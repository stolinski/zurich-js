#!/usr/bin/env python3
"""Build the agent wall source scene for The True Cost of AI Coding.

The wall is the third stage: the workstation compressed into infrastructure.
Fifty-four agents surround the hero glass in a concave vault — a five-by-five
rear bank with the hero at its centre and two three-deep wings turned toward
the camera — and every one of them is the same CRT on a shelf in a steel
rack. It is authored at true metric scale on the deck's contract (cells on a
19.2 × 16.5 pitch, wings at x ±78/69/60 and z 26/1/−24 yawed 0.68/0.61/0.54,
shell ±94 / ±43 / −42, in scene units of 32.5 mm), so the near and wide
waypoints in ``src/slides/index.js`` keep working unchanged.

Run:
    blender --background --factory-startup --python blender/wall/build_scene.py

The script saves ``wall.blend`` beside itself and writes look-development
renders under ``quality-artifacts/blender-wall/lookdev``. Export with
``export_scene.py``.

What stays at runtime: the fifty-four animated agent screens (placements
exported as scene extras from here), the irradiance patches that carry their
aggregate spill, and the one broad reflection source. What lives here: the
vault, the racks, the housings, and the cabling that makes it a place.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.setkit import (  # noqa: E402
    add_area_light,
    add_box,
    add_curve,
    add_decimate,
    bake_object_transform,
    blender_to_three,
    box_project_uv,
    clean_scene,
    collection,
    configure_eevee,
    crease_by_angle,
    deck_camera,
    duplicate_object,
    import_glb,
    make_camera,
    mapped_surface_material,
    principled_material,
    render_still,
    set_input,
    stamp_contract,
    textured_material,
    three_to_blender,
    units,
)

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "public" / "models"
TEXTURE_DIR = ROOT / "public" / "textures"
RENDER_DIR = ROOT / "quality-artifacts" / "blender-wall" / "lookdev"
BLEND_PATH = SOURCE_DIR / "wall.blend"

random.seed(0xA93E17)

# ── The contract, in metres (Blender: X right, Y away from the camera, Z up) ──
FLOOR_Z = units(-42.25)
CEILING_Z = units(42.25)
WALL_HALF_X = units(93.0)
BACK_Y = units(41.0)
FRONT_Y = units(-92.0)
# 20 units (650 mm) across, not the old set's 19.2: a 609 mm housing has to
# clear the uprights either side of it, and on the old pitch it could not.
CELL_PITCH_X = units(20.0)
CELL_PITCH_Z = units(16.5)
REAR_BANK_Y = units(0.2)
# The wings sit a little inside the old set's cells (78/69/60 at 26/1/−24): a
# 620 mm rack turned toward the camera reaches 0.4 m further out than a
# 270 mm box did, and at the old positions the outer racks ran into the side
# walls and the inner ones into the back wall.
WING_DEPTHS = [
    (units(72.0), units(-26.0), 0.68),
    (units(66.0), units(-1.0), 0.61),
    (units(59.0), units(18.0), 0.54),
]
# The housing's contract (Monitor.jsx): its origin sits 17 mm above the glass
# centre and 10 mm behind the glass plane; its stand's underside is 288 mm
# below the origin. A shelf top therefore sits 271 mm below the glass centre.
HOUSING_ORIGIN_UP = 0.017
HOUSING_ORIGIN_BACK = 0.010
SHELF_DROP = 0.288 - HOUSING_ORIGIN_UP
# Rack construction.
UPRIGHT = 0.035
RACK_HALF_W = CELL_PITCH_X / 2
RACK_FRONT_Y = 0.03
RACK_DEPTH = 0.62
SHELF_T = 0.025

AGENT_SCREENS: list[dict[str, float]] = []


# ── Materials ────────────────────────────────────────────────────────────────


def build_materials() -> dict[str, bpy.types.Material]:
    plaster = TEXTURE_DIR / "painted-plaster"
    materials = {
        # Enough albedo that the aggregate screen spill grounds the vault's
        # floor and ceiling; near-vantablack returned no light at all and the
        # wall read as rows floating in a void.
        "floor": mapped_surface_material("Vault floor", "#1d2523", 0.94, plaster, repeats=(1.0, 1.0, 1.0), normal_strength=0.2, metallic=0.04),
        "ceiling": mapped_surface_material("Vault ceiling", "#1a2120", 0.95, plaster, repeats=(1.0, 1.0, 1.0), normal_strength=0.2),
        "wall": mapped_surface_material("Vault wall", "#1d2523", 0.94, plaster, repeats=(1.0, 1.0, 1.0), normal_strength=0.25),
        "upright": principled_material("Rack upright", "#18201f", 0.46, metallic=0.52),
        "shelf": principled_material("Rack shelf", "#141a1b", 0.5, metallic=0.4),
        "panel": principled_material("Rack panel", "#12181a", 0.84, metallic=0.12),
        "tray": principled_material("Cable tray", "#4a5250", 0.5, metallic=0.6),
        "bundle": principled_material("Cable bundle", "#0c0d0d", 0.8),
        "cable": principled_material("Power cable", "#0a0b0d", 0.62, metallic=0.05),
        "trench": principled_material("Trench cover", "#20262a", 0.62, metallic=0.28),
        "crt": textured_material("Wall CRT", "#2b2d32", "#33363c", 0.62, scale=52.0, detail=3.0, bump_strength=0.035, bump_distance=0.0007, metallic=0.015),
        # Lookdev only.
        "screen_black": principled_material("CRT glass black", "#050705", 0.34, coat=0.06, emission="#090b07", emission_strength=0.16),
        "screen_amber": principled_material("Amber phosphor hot", "#ffd54a", 0.34, emission="#ffd54a", emission_strength=6.0),
        "screen_dim": principled_material("Amber phosphor dim", "#8f6c22", 0.44, emission="#b68a2c", emission_strength=2.2),
    }
    set_input(materials["screen_black"].node_tree.nodes.get("Principled BSDF"), "Specular IOR Level", 0.10)
    return materials


def glow_material(drive: float) -> bpy.types.Material:
    """A lookdev screen at one agent's drive: the deck runs its screens from
    0.34 to 1.39 on purpose, so the wall is not fifty-four identical swatches."""
    material = principled_material(
        f"Agent glow {drive:.2f}",
        "#6a5220",
        0.4,
        emission="#e0a83a",
        emission_strength=2.6 * drive,
    )
    return material


# ── Shell ────────────────────────────────────────────────────────────────────


def build_shell(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    width = WALL_HALF_X * 2
    depth = BACK_Y - FRONT_Y
    mid_y = (BACK_Y + FRONT_Y) / 2
    floor = add_box("Vault floor", (width, depth, 0.05), (0.0, mid_y, FLOOR_Z - 0.025), mats["floor"], target)
    box_project_uv(floor, 1.0)
    ceiling = add_box("Vault ceiling", (width, depth, 0.05), (0.0, mid_y, CEILING_Z + 0.025), mats["ceiling"], target)
    box_project_uv(ceiling, 1.0)
    height = CEILING_Z - FLOOR_Z
    for side in (-1, 1):
        wall = add_box("Vault side wall", (0.08, depth, height), (side * (WALL_HALF_X + 0.04), mid_y, 0.0), mats["wall"], target)
        box_project_uv(wall, 1.0)
    back = add_box("Vault back wall", (width, 0.08, height), (0.0, BACK_Y + 0.04, 0.0), mats["wall"], target)
    box_project_uv(back, 1.0)

    # A cable trench cover down the centre of the floor, from the racks
    # toward the camera: the one line on the floor that says the room has
    # services under it.
    trench_y0, trench_y1 = FRONT_Y + 0.2, REAR_BANK_Y - 0.03
    add_box("Trench cover", (0.32, trench_y1 - trench_y0, 0.006), (0.0, (trench_y0 + trench_y1) / 2, FLOOR_Z + 0.003), mats["trench"], target, bevel=0.002, segments=2)


def build_ceiling_services(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    """Ladder cable trays running from the camera's end of the vault into the
    rear bank's rack tops, with the bundles that ride in them."""
    tray_z = CEILING_Z - 0.16
    tray_w = 0.45
    # The racks stand floor to ceiling, so the trays end just short of the
    # housings' faces on the rear bank's glass plane.
    y0, y1 = FRONT_Y + 0.4, REAR_BANK_Y - 0.03
    for x in (-units(30.0), units(30.0)):
        for sx in (-1, 1):
            add_box("Cable tray rail", (0.05, y1 - y0, 0.03), (x + sx * (tray_w / 2 - 0.025), (y0 + y1) / 2, tray_z), mats["tray"], target, bevel=0.003, segments=2)
        y = y0 + 0.15
        while y < y1:
            add_box("Cable tray rung", (tray_w - 0.05, 0.02, 0.02), (x, y, tray_z - 0.005), mats["tray"], target)
            y += 0.30
        # The bundle lying in the tray.
        add_curve(
            "Tray cable bundle",
            [
                (x - 0.08, y0 + 0.1, tray_z + 0.03),
                (x + 0.05, (y0 + y1) * 0.4, tray_z + 0.035),
                (x - 0.04, (y0 + y1) * 0.7, tray_z + 0.03),
                (x + 0.06, y1 - 0.1, tray_z + 0.035),
            ],
            0.035,
            mats["bundle"],
            target,
        )
    # Tray hangers: threaded rod from the slab every metre.
    for x in (-units(30.0), units(30.0)):
        y = y0 + 0.3
        while y < y1:
            for sx in (-1, 1):
                add_box("Tray hanger", (0.012, 0.012, CEILING_Z - tray_z - 0.015), (x + sx * (tray_w / 2 - 0.025), y, (CEILING_Z + tray_z + 0.015) / 2), mats["tray"], target)
            y += 1.0


# ── Racks ────────────────────────────────────────────────────────────────────


class RackFrame:
    """Floor-to-ceiling steel racks. Uprights are collected by position so the
    rear bank's neighbouring columns share theirs."""

    def __init__(self, target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
        self.target = target
        self.mats = mats
        self.uprights: dict[tuple[float, float], float] = {}

    def upright(self, x: float, y: float, yaw: float) -> None:
        self.uprights[(round(x, 3), round(y, 3))] = yaw

    def column(
        self,
        name: str,
        origin: tuple[float, float],
        yaw: float,
        cells_z: list[float],
        monitor_src: bpy.types.Object,
        lookdev: bpy.types.Collection,
        *,
        hero_cell_z: float | None = None,
    ) -> None:
        """One rack: a glass plane through `origin` facing −Y rotated by
        `yaw`, with a CRT on a shelf at every cell height."""
        ox, oy = origin
        cos, sin = math.cos(yaw), math.sin(yaw)

        def local(x: float, y: float) -> tuple[float, float]:
            return (ox + x * cos - y * sin, oy + x * sin + y * cos)

        facing = (sin, -cos)
        for sx in (-1, 1):
            for y in (RACK_FRONT_Y, RACK_DEPTH):
                self.upright(*local(sx * RACK_HALF_W, y), yaw)
        # Top and bottom side rails tie front and rear uprights together.
        for sx in (-1, 1):
            for z in (FLOOR_Z + 0.06, CEILING_Z - 0.06):
                lx, ly = local(sx * RACK_HALF_W, (RACK_FRONT_Y + RACK_DEPTH) / 2)
                add_box(f"{name} side rail", (UPRIGHT * 0.8, RACK_DEPTH - RACK_FRONT_Y - UPRIGHT, UPRIGHT * 0.8), (lx, ly, z), self.mats["upright"], self.target, rotation=(0, 0, yaw))
        # Rear panel.
        px, py = local(0.0, RACK_DEPTH + UPRIGHT / 2 + 0.006)
        add_box(f"{name} rear panel", (RACK_HALF_W * 2 - UPRIGHT, 0.012, CEILING_Z - FLOOR_Z - 0.12), (px, py, 0.0), self.mats["panel"], self.target, rotation=(0, 0, yaw))
        # The bundle running down the rear-right upright.
        bx, by = local(RACK_HALF_W - UPRIGHT * 0.5 - 0.03, RACK_DEPTH + 0.04)
        add_box(f"{name} cable bundle", (0.045, 0.045, CEILING_Z - FLOOR_Z - 0.1), (bx, by, 0.0), self.mats["bundle"], self.target, rotation=(0, 0, yaw), bevel=0.012, segments=3)

        for cell_z in cells_z:
            shelf_top = cell_z - SHELF_DROP
            sx_, sy_ = local(0.0, (RACK_FRONT_Y + RACK_DEPTH) / 2 - 0.01)
            add_box(
                f"{name} shelf {cell_z:.2f}",
                (RACK_HALF_W * 2 - UPRIGHT - 0.01, RACK_DEPTH - RACK_FRONT_Y - 0.02, SHELF_T),
                (sx_, sy_, shelf_top - SHELF_T / 2),
                self.mats["shelf"],
                self.target,
                rotation=(0, 0, yaw),
                bevel=0.003,
                segments=2,
            )
            lx, ly = local(0.0, RACK_FRONT_Y - 0.005)
            add_box(f"{name} shelf lip {cell_z:.2f}", (RACK_HALF_W * 2 - UPRIGHT - 0.01, 0.012, 0.035), (lx, ly, shelf_top - 0.01), self.mats["shelf"], self.target, rotation=(0, 0, yaw))
            # The housing, glass on the rack's front plane.
            hx, hy = local(0.0, HOUSING_ORIGIN_BACK)
            is_hero = hero_cell_z is not None and abs(cell_z - hero_cell_z) < 1e-6
            if is_hero:
                # The live CRT: the deck draws the housing and the glass; the
                # lookdev proxy stands in for both here.
                import_glb(MODEL_DIR / "crt-monitor.glb", "Hero CRT proxy", lookdev, location=(hx, hy, cell_z + HOUSING_ORIGIN_UP), rotation=(0, 0, yaw), material=self.mats["crt"])
                gx, gy = local(0.0, -0.004)
                add_box("Lookdev glass", (0.520, 0.008, 0.2925), (gx, gy, cell_z), self.mats["screen_black"], lookdev, rotation=(0, 0, yaw), bevel=0.020, segments=8)
                for row, (width, dz) in enumerate(((0.19, 0.022), (0.075, -0.055))):
                    bx_, by_ = local(-0.145, -0.0095)
                    add_box(f"Screen label {row}", (0.12, 0.002, 0.004), (bx_, by_, cell_z + dz), self.mats["screen_dim"], lookdev, rotation=(0, 0, yaw), bevel=0.001)
                    bx_, by_ = local(0.055 - (0.19 - width) / 2, -0.0095)
                    add_box(f"Screen bar {row}", (width, 0.002, 0.013), (bx_, by_, cell_z + dz), self.mats["screen_amber"], lookdev, rotation=(0, 0, yaw), bevel=0.002)
                tx, ty = local(-0.115, -0.0095)
                add_box("Screen title", (0.21, 0.002, 0.009), (tx, ty, cell_z + 0.092), self.mats["screen_amber"], lookdev, rotation=(0, 0, yaw), bevel=0.001)
            else:
                duplicate_object(monitor_src, f"{name} CRT {cell_z:.2f}", self.target, location=(hx, hy, cell_z + HOUSING_ORIGIN_UP), rotation=(0, 0, yaw))
                drive = 0.34 + random.random() * 1.05
                gx, gy = local(0.0, -0.002)
                add_box(f"{name} lookdev glass {cell_z:.2f}", (0.520, 0.006, 0.2925), (gx, gy, cell_z), glow_material(drive), lookdev, rotation=(0, 0, yaw), bevel=0.012, segments=4)
                x, y, z = blender_to_three((ox, oy, cell_z))
                AGENT_SCREENS.append({"x": round(x, 4), "y": round(y, 4), "z": round(z, 4), "yaw": round(yaw, 6)})
            # The power cable out of the back of the housing, down to the shelf
            # and off to the bundle.
            c0 = local(0.01, 0.51)
            c1 = local(0.08, 0.56)
            c2 = local(RACK_HALF_W - 0.09, RACK_DEPTH - 0.02)
            add_curve(
                f"{name} power cable {cell_z:.2f}",
                [
                    (c0[0], c0[1], cell_z - 0.03),
                    (c1[0], c1[1], shelf_top + 0.02),
                    (c2[0], c2[1], shelf_top + 0.01),
                ],
                0.0045,
                self.mats["cable"],
                self.target,
            )

    def build_uprights(self) -> None:
        for (x, y), yaw in self.uprights.items():
            add_box(
                f"Upright ({x:.2f}, {y:.2f})",
                (UPRIGHT, UPRIGHT, CEILING_Z - FLOOR_Z),
                (x, y, 0.0),
                self.mats["upright"],
                self.target,
                rotation=(0, 0, yaw),
                bevel=0.003,
                segments=2,
            )


def build_racks(
    export: bpy.types.Collection,
    lookdev: bpy.types.Collection,
    sources: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> None:
    imported = import_glb(MODEL_DIR / "crt-monitor.glb", "Wall CRT source", sources, material=mats["crt"])
    assert len(imported) == 1 and imported[0].type == "MESH"
    monitor_src = imported[0]
    bake_object_transform(monitor_src)
    crease_by_angle(monitor_src)
    # Fifty-four housings: a third of the loft each keeps the wide frame's
    # budget, and the near frame only resolves the cells beside the hero.
    add_decimate(monitor_src, 0.34)

    frame = RackFrame(export, mats)
    cells_z = [row * CELL_PITCH_Z for row in (2, 1, 0, -1, -2)]
    # Rear bank: five columns sharing uprights, the hero at the centre.
    for column in range(-2, 3):
        frame.column(
            f"Rear column {column:+d}",
            (column * CELL_PITCH_X, REAR_BANK_Y),
            0.0,
            cells_z,
            monitor_src,
            lookdev,
            hero_cell_z=0.0 if column == 0 else None,
        )
    # Wings: three columns a side, turned toward the camera and narrowing as
    # they recede. The hero's centre slot is at the origin; the wings' glass
    # planes pass through their listed positions.
    for side in (-1, 1):
        for index, (x, y, yaw) in enumerate(WING_DEPTHS):
            frame.column(
                f"Wing {side:+d} {index}",
                (side * x, y),
                yaw if side < 0 else -yaw,
                cells_z,
                monitor_src,
                lookdev,
            )
    frame.build_uprights()


# ── Lookdev ──────────────────────────────────────────────────────────────────


def build_lighting(target: bpy.types.Collection) -> None:
    """The deck's wall rig: the hero screen and one broad reflection source
    standing for the aggregate spill; the fifty-four glass panels carry the
    rest as emission."""
    add_area_light(
        "Screen key",
        three_to_blender(0, 0, 0.02),
        three_to_blender(0, 0, 40),
        3.2,
        "#ffe4a8",
        0.520,
        0.2925,
        target,
    )
    add_area_light(
        "Aggregate spill",
        three_to_blender(0.0, 2.0, 34.0),
        three_to_blender(0.0, 2.0, -40.0),
        90.0,
        "#d9a94f",
        units(175.0),
        units(82.0),
        target,
    )


def configure_scene(scene: bpy.types.Scene) -> None:
    configure_eevee(
        scene,
        filepath=RENDER_DIR / "wall-wide.png",
        world_color=(0.42, 0.31, 0.12, 1.0),
        world_strength=0.02,
        exposure=0.2,
        samples=64,
    )


def main() -> None:
    clean_scene()
    export = collection("WALL_EXPORT")
    lookdev = collection("LOOKDEV_ONLY")
    sources = collection("SOURCES")
    cameras = collection("CAMERAS")
    lights = collection("LIGHTS")
    sources.hide_render = True
    mats = build_materials()

    build_shell(export, mats)
    build_ceiling_services(export, mats)
    build_racks(export, lookdev, sources, mats)
    build_lighting(lights)

    near_camera = deck_camera("Agent wall near camera", (-16.0, 2.0, 58.0), (0.0, 0.0, -6.0), cameras)
    wide_camera = deck_camera("Agent wall camera", (0.0, 0.0, 206.0), (0.0, 0.0, -3.0), cameras)
    rack_camera = make_camera(
        "Rack review camera",
        (units(-30.0), units(-40.0), units(12.0)),
        (units(20.0), units(10.0), units(-4.0)),
        cameras,
        fov_degrees=40.0,
    )

    scene = bpy.context.scene
    scene.camera = wide_camera
    configure_scene(scene)
    stamp_contract(scene)
    scene["agent_screens"] = json.dumps(AGENT_SCREENS)

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    render_still(scene, wide_camera, RENDER_DIR / "wall-wide.png")
    render_still(scene, near_camera, RENDER_DIR / "wall-near.png")
    render_still(scene, rack_camera, RENDER_DIR / "wall-rack.png")

    scene.camera = wide_camera
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"WALL_BLEND={BLEND_PATH}")
    print(f"WALL_RENDERS={RENDER_DIR}")
    print(f"WALL_AGENT_SCREENS={len(AGENT_SCREENS)}")


if __name__ == "__main__":
    main()
