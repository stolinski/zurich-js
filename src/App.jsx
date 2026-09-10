import { Suspense } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Scene } from './scene/Scene.jsx'
import { CameraRig } from './scene/CameraRig.jsx'
import { Effects } from './scene/Effects.jsx'
import { FrameCap } from './scene/FrameCap.jsx'
import { FlatScreen } from './ui/FlatScreen.jsx'
import { Overlay } from './ui/Overlay.jsx'
import { SlideIndex } from './ui/SlideIndex.jsx'
import { useKeyboardNav } from './state/useKeyboardNav.js'
import { useSessionAutoplay } from './state/useSessionAutoplay.js'
import { FLAT } from './flat.js'
import { INDEX } from './slideIndex.js'
import { QUALITY_AA_PROFILE } from './qualityProfile.js'

export default function App() {
  useKeyboardNav()
  useSessionAutoplay()

  // `?index` — the deck as a list of cards linking to every slide. Presenter
  // tooling, not the talk: no canvas, no chrome. See slideIndex.js.
  if (INDEX) return <SlideIndex />

  return (
    <>
      {/* `?flat` paints the screen's canvas straight to the page — no R3F mount,
          no WebGL context, no shader compile. For working on what the screen
          SAYS without booting the 3D. See flat.js. */}
      {FLAT ? (
        <FlatScreen />
      ) : (
        // Filmic tone mapping lives at the end of Effects.jsx. EffectComposer
        // intentionally forces the renderer to NoToneMapping; declaring ACES
        // only here used to look configured while doing nothing on every 3D
        // slide. The cold open bypasses the composer and remains bit-flat.
        <Canvas
          // PCF, not VSM. VSM's separable blur was chosen because it honors a
          // large `radius`, but at the radii this scene was using it light-bleeds
          // the CONTACT REGION away entirely — the mug, keyboard, chair and
          // pedestal all met their surface with no darkening at all, which is the
          // single strongest tell that a frame is CG. PCFShadowMap still honors
          // `shadow.radius` (PCF_SOFT does not — it is a fixed 3×3 kernel), so
          // softness stays tunable per light while contact survives.
          shadows="percentage"
          // The composer resolves edges with a final FXAA pass. Rendering its
          // targets at Retina 2× meant four times the pixels before bloom and was the
          // main reason a laptop sounded distressed. Cap DPR at 1.25 — the value
          // QUALITY.md's gates were measured at; the code had drifted to 1.5,
          // which is 44% more pixels than the documented cap on a Retina panel
          // and identical on the 1080p projector. The CRT texture itself remains
          // 2560×1440 and the procedural Nyquist guards preserve its close detail.
          dpr={QUALITY_AA_PROFILE?.dpr ?? [1, 1.25]}
          gl={{
            // Antialiasing lives on the composer's target, not the unused
            // default framebuffer.
            antialias: false,
            powerPreference: 'high-performance',
            stencil: false,
            toneMapping: THREE.NoToneMapping,
          }}
          camera={{ position: [0, 0, 9.65], fov: 50, near: 0.1, far: 4000 }}
          // FrameCap owns the loop: the stage is 60 Hz, and a 120 Hz laptop
          // panel would otherwise render twice the frames for nothing.
          frameloop="never"
        >
          <color attach="background" args={['#04060a']} />
          <FrameCap fps={60} />
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
          <CameraRig />
          <Effects />
        </Canvas>
      )}
      <Overlay />
    </>
  )
}
