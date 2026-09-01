/**
 * Runs the talk's production browser-evidence harness and stores durable results.
 *
 * This model deliberately distinguishes automated transition evidence from
 * visual acceptance. A fast frame is not evidence that a frame looks good.
 *
 * @module
 */
import { z } from "npm:zod@4";

const ProfileSchema = z.enum(["smoke", "transitions", "full"]);
const CacheSchema = z.enum(["fresh", "warm"]);
const DirectionSchema = z.enum(["both", "forward", "backward"]);
const ModeSchema = z.enum(["all", "settled", "transitions"]);
const BrowserModeSchema = z.enum(["headless", "headed"]);
const HandoffModeSchema = z.enum(["normal", "shader", "geometry"]);
const AaProfileSchema = z.enum([
  "production",
  "fxaa",
  "msaa2-dpr125",
  "msaa4-dpr1",
  "msaa2-fxaa",
  "ssaa4-reference",
]);

const RunArgsSchema = z.object({
  profile: ProfileSchema.default("smoke"),
  viewport: z.string().regex(/^\d+x\d+$/).default("1920x1080"),
  dpr: z.number().positive().default(1),
  cache: CacheSchema.default("warm"),
  slides: z.string().min(1).default("all"),
  directions: DirectionSchema.default("both"),
  mode: ModeSchema.default("all"),
  settleMs: z.number().int().nonnegative().default(2500),
  traceMs: z.number().int().positive().default(4000),
  build: z.boolean().default(true),
  browserMode: BrowserModeSchema.default("headless"),
  aaProfile: AaProfileSchema.default("production"),
  handoffMode: HandoffModeSchema.default("normal"),
});

type RunArgs = z.infer<typeof RunArgsSchema>;

const GateSchema = z.object({
  status: z.enum(["pass", "fail", "incomplete", "manual-review-required"]),
  reason: z.string(),
});

const ResultSchema = z.object({
  runId: z.string(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  profile: ProfileSchema,
  viewport: z.string(),
  dpr: z.number(),
  cache: CacheSchema,
  browserMode: BrowserModeSchema,
  aaProfile: AaProfileSchema,
  handoffMode: HandoffModeSchema,
  automationStatus: z.enum(["success", "failed"]),
  transitionGate: GateSchema,
  visualGate: GateSchema,
  transitionCount: z.number().int().nonnegative(),
  passedTransitions: z.number().int().nonnegative(),
  failedTransitions: z.number().int().nonnegative(),
  incompleteTransitions: z.number().int().nonnegative(),
  maxP95FrameMs: z.number().nullable(),
  maxFrameMs: z.number().nullable(),
  maxInputLatencyMs: z.number().nullable(),
  createdPrograms: z.number().int().nonnegative(),
  createdTextures: z.number().int().nonnegative(),
  textureUploads: z.number().int().nonnegative(),
  settledCaptureCount: z.number().int().nonnegative(),
  note: z.string(),
});

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type EvidenceTransition = {
  summary?: {
    verdict?: string;
    p95FrameMs?: number;
    maxFrameMs?: number;
    inputLatencyMs?: number;
  };
  trace?: {
    webglInterception?: {
      delta?: {
        createdPrograms?: number;
        createdTextures?: number;
        textureUploads?: number;
      };
    };
  };
};

type Evidence = {
  transitions?: EvidenceTransition[];
  settled?: unknown[];
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  const output = await new Deno.Command(command, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: output.code,
    stdout: textDecoder.decode(output.stdout),
    stderr: textDecoder.decode(output.stderr),
  };
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function findChrome(): Promise<string> {
  const candidates = Deno.build.os === "darwin"
    ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    : ["google-chrome", "chromium", "chromium-browser"];

  for (const candidate of candidates) {
    if (candidate.startsWith("/")) {
      try {
        const stat = await Deno.stat(candidate);
        if (stat.isFile) return candidate;
      } catch {
        // Try the next known location.
      }
    } else {
      const result = await runCommand("/usr/bin/env", ["which", candidate], Deno.cwd());
      if (result.code === 0 && result.stdout.trim()) return result.stdout.trim();
    }
  }
  throw new Error("Chrome or Chromium was not found on this machine");
}

function finiteMax(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

function total(values: Array<number | undefined>): number {
  let sum = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) sum += value;
  }
  return sum;
}

async function stopProcess(process: Deno.ChildProcess | null): Promise<void> {
  if (!process) return;
  try {
    process.kill("SIGTERM");
  } catch {
    return;
  }
  await Promise.race([
    process.status,
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  try {
    process.kill("SIGKILL");
  } catch {
    // It already exited.
  }
}

/** Typed quality-evidence runner for the conference talk. */
export const model = {
  type: "talk/quality",
  version: "2026.08.26.1",
  globalArguments: z.object({}),
  resources: {
    result: {
      description: "Structured transition evidence with explicit visual-gate status",
      schema: ResultSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  files: {
    evidence: {
      description: "Compressed captures, traces, hashes, and generated reports",
      contentType: "application/gzip",
      lifetime: "infinite",
      garbageCollection: 10,
    },
    log: {
      description: "Build and capture logs",
      contentType: "text/plain",
      lifetime: "infinite",
      garbageCollection: 20,
    },
  },
  methods: {
    run: {
      description: "Build the talk, launch an isolated preview/browser, and capture quality evidence",
      arguments: RunArgsSchema,
      execute: async (
        args: RunArgs,
        context: {
          repoDir: string;
          signal: AbortSignal;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
          createFileWriter: (
            specName: string,
            name: string,
            overrides?: Record<string, unknown>,
          ) => {
            writeText: (text: string) => Promise<{ name: string }>;
            writeAll: (content: Uint8Array) => Promise<{ name: string }>;
          };
          logger: {
            info: (message: string, properties?: Record<string, unknown>) => void;
          };
        },
      ) => {
        const startedAt = new Date();
        const runId = startedAt.toISOString().replace(/[:.]/g, "-");
        const tempRoot = await Deno.makeTempDir({ prefix: "talk-quality-" });
        const outputDirectory = `${tempRoot}/evidence`;
        const chromeProfile = `${tempRoot}/chrome`;
        const previewPort = 4183;
        const cdpPort = 9233;
        const previewUrl = `http://127.0.0.1:${previewPort}`;
        const logs: string[] = [];
        let preview: Deno.ChildProcess | null = null;
        let chrome: Deno.ChildProcess | null = null;

        const profileArgs = args.profile === "smoke"
          ? { slides: "0-2,5-6,8-9,11-12", mode: "all", directions: "both", max: "8" }
          : args.profile === "transitions"
          ? { slides: args.slides, mode: "transitions", directions: args.directions, max: null }
          : { slides: args.slides, mode: args.mode, directions: args.directions, max: null };

        try {
          if (args.build) {
            context.logger.info("Building production presentation");
            const build = await runCommand("/usr/bin/env", ["pnpm", "exec", "vite", "build"], context.repoDir);
            logs.push("## build stdout\n", build.stdout, "\n## build stderr\n", build.stderr);
            if (build.code !== 0) throw new Error(`Production build failed with exit ${build.code}`);
          }

          preview = new Deno.Command("/usr/bin/env", {
            args: [
              "pnpm",
              "exec",
              "vite",
              "preview",
              "--host",
              "127.0.0.1",
              "--port",
              String(previewPort),
              "--strictPort",
            ],
            cwd: context.repoDir,
            stdout: "null",
            stderr: "null",
          }).spawn();
          await waitForUrl(previewUrl, 30_000);

          const chromeExecutable = await findChrome();
          const chromeArgs = [
            `--remote-debugging-port=${cdpPort}`,
            `--user-data-dir=${chromeProfile}`,
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank",
          ];
          if (args.browserMode === "headless") chromeArgs.unshift("--headless=new");
          chrome = new Deno.Command(chromeExecutable, {
            args: chromeArgs,
            stdout: "null",
            stderr: "null",
          }).spawn();
          await waitForUrl(`http://127.0.0.1:${cdpPort}/json/version`, 30_000);

          const presentationParams = new URLSearchParams({ quality: "" });
          if (args.aaProfile !== "production") {
            presentationParams.set("aa", args.aaProfile);
          }
          if (args.handoffMode !== "normal") {
            presentationParams.set("handoff", args.handoffMode);
          }
          const presentationUrl = `${previewUrl}/?${presentationParams}`;
          const captureArgs = [
            "scripts/quality/capture.mjs",
            "--url",
            presentationUrl,
            "--cdp",
            String(cdpPort),
            "--viewport",
            args.viewport,
            "--dpr",
            String(args.dpr),
            "--cache",
            args.cache,
            "--slides",
            profileArgs.slides,
            "--directions",
            profileArgs.directions,
            "--mode",
            profileArgs.mode,
            "--settle-ms",
            String(args.settleMs),
            "--trace-ms",
            String(args.traceMs),
            "--out",
            outputDirectory,
          ];
          if (profileArgs.max) captureArgs.push("--max-transitions", profileArgs.max);

          context.logger.info("Capturing {profile} evidence", { profile: args.profile });
          const capture = await runCommand("/usr/bin/env", ["node", ...captureArgs], context.repoDir);
          logs.push("\n## capture stdout\n", capture.stdout, "\n## capture stderr\n", capture.stderr);
          if (capture.code !== 0) throw new Error(`Evidence capture failed with exit ${capture.code}`);

          const evidence = JSON.parse(
            await Deno.readTextFile(`${outputDirectory}/evidence.json`),
          ) as Evidence;
          const transitions = evidence.transitions ?? [];
          const verdicts = transitions.map((transition) => transition.summary?.verdict ?? "incomplete");
          const passedTransitions = verdicts.filter((verdict) => verdict === "pass").length;
          const failedTransitions = verdicts.filter((verdict) => verdict === "fail").length;
          const incompleteTransitions = transitions.length - passedTransitions - failedTransitions;
          const deltas = transitions.map((transition) => transition.trace?.webglInterception?.delta);
          const transitionPass = transitions.length > 0 && failedTransitions === 0 && incompleteTransitions === 0;
          const transitionStatus = transitions.length === 0
            ? "incomplete"
            : transitionPass
            ? "pass"
            : "fail";

          const result = {
            runId,
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            profile: args.profile,
            viewport: args.viewport,
            dpr: args.dpr,
            cache: args.cache,
            browserMode: args.browserMode,
            aaProfile: args.aaProfile,
            handoffMode: args.handoffMode,
            automationStatus: "success",
            transitionGate: {
              status: transitionStatus,
              reason: transitions.length === 0
                ? "No transition traces were requested"
                : `${passedTransitions}/${transitions.length} automated transition traces passed`,
            },
            visualGate: {
              status: "manual-review-required",
              reason: "Captures are stored, but no timing or allocation metric can approve photographic quality",
            },
            transitionCount: transitions.length,
            passedTransitions,
            failedTransitions,
            incompleteTransitions,
            maxP95FrameMs: finiteMax(transitions.map((transition) => transition.summary?.p95FrameMs)),
            maxFrameMs: finiteMax(transitions.map((transition) => transition.summary?.maxFrameMs)),
            maxInputLatencyMs: finiteMax(transitions.map((transition) => transition.summary?.inputLatencyMs)),
            createdPrograms: total(deltas.map((delta) => delta?.createdPrograms)),
            createdTextures: total(deltas.map((delta) => delta?.createdTextures)),
            textureUploads: total(deltas.map((delta) => delta?.textureUploads)),
            settledCaptureCount: evidence.settled?.length ?? 0,
            note: "Automated evidence is not visual acceptance. Review the archived PNGs before calling the talk better.",
          } as const;

          const resultHandle = await context.writeResource("result", "quality-result", result);
          const logHandle = await context.createFileWriter("log", `log-${runId}`).writeText(logs.join("\n"));
          const archiveWriter = context.createFileWriter("evidence", `evidence-${runId}`);
          const archivePath = `${tempRoot}/evidence.tar.gz`;
          const archive = await runCommand("/usr/bin/env", ["tar", "-czf", archivePath, "-C", outputDirectory, "."], context.repoDir);
          if (archive.code !== 0) throw new Error(`Could not archive evidence: ${archive.stderr}`);
          const archiveHandle = await archiveWriter.writeAll(await Deno.readFile(archivePath));
          return { dataHandles: [resultHandle, logHandle, archiveHandle] };
        } finally {
          await stopProcess(chrome);
          await stopProcess(preview);
          await Deno.remove(tempRoot, { recursive: true }).catch(() => {});
        }
      },
    },
  },
};
