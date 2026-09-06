#!/usr/bin/env python3
"""Build the cubicle office source scene for The True Cost of AI Coding.

The office is the second stage of the talk: the home workstation repeated
into fluorescent bureaucracy. It is authored at true metric scale in Blender
on the deck's spatial contract (desk top at −8.34, floor −29.54, ceiling
33.3, aisle ±29, banks ±29..±76, bay edges every 42 from −20, shell ±94 /
−240, all in scene units of 32.5 mm), so the camera waypoints in
``src/slides/index.js`` and the runtime lighting in ``Stages.jsx`` keep
working unchanged.

Run:
    blender --background --factory-startup --python blender/office/build_scene.py

The script saves ``office.blend`` beside itself and writes look-development
renders under ``quality-artifacts/blender-office/lookdev``. Export with
``export_scene.py``.

What stays at runtime: the light rig, the ceiling tile map, the carpet tile
field, the eight animated agent screens (their placements are exported as
scene extras from here, so they can never drift from the housings), the
baked irradiance receivers, and the contact patches. What lives here: every
surface the audience can see.
"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.deskprops import (  # noqa: E402
    KEYBOARD_DEPTH,
    build_bay_keyboard,
    build_keyboard,
    build_mouse,
    build_mug,
    build_simple_mouse,
)
from lib.setkit import (  # noqa: E402
    add_area_light,
    add_box,
    add_curve,
    add_cylinder,
    add_decimate,
    add_spot_light,
    bake_object_transform,
    bevelled_block,
    blender_to_three,
    box_project_uv,
    clean_scene,
    collection,
    configure_eevee,
    crease_by_angle,
    deck_camera,
    duplicate_object,
    fitted_uv,
    import_glb,
    make_camera,
    mapped_surface_material,
    principled_material,
    render_still,
    seat_on,
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
RENDER_DIR = ROOT / "quality-artifacts" / "blender-office" / "lookdev"
BLEND_PATH = SOURCE_DIR / "office.blend"

random.seed(0x0FF1CE)

# ── The contract, in metres (Blender: X right, Y into the aisle, Z up) ──────
FLOOR_Z = units(-29.54)
DESK_Z = units(-8.34)
CEILING_Z = units(33.3)
AISLE_HALF = units(29.0)
BANK_OUTER = units(76.0)
# Transverse divider lines down both banks: three bays of 56 units (1.82 m)
# and a last one to the far panel. The first pass kept the old set's 42-unit
# bays, and 1.365 m is too shallow for a desk with a chair in front of it.
BAY_EDGES_Y = [units(20.0), units(76.0), units(132.0)]
FAR_PANEL_Y = units(190.0)
BAYS_Y = list(zip(BAY_EDGES_Y, BAY_EDGES_Y[1:] + [FAR_PANEL_Y]))
SHELL_HALF_X = units(94.0)
SHELL_BACK_Y = units(240.0)
SHELL_FRONT_Y = units(-70.0)
FLOOR_CENTRE_Y = units(80.0)
FLOOR_WIDTH = units(260.0)
FLOOR_DEPTH = units(360.0)
HERO_PANEL_Y0 = units(-16.0)
HERO_PANEL_Y1 = BAY_EDGES_Y[0]
# Taller than the bay dividers, low enough that the near bays' screens show
# past them from the aisle.
HERO_PANEL_TOP = FLOOR_Z + 1.02
BANK_PANEL_TOP = units(-8.34 + 22.7)
# The dividers between bays are low (880 mm, 190 mm over the worksurface):
# from a camera in the aisle every bay's screen and chair back shows over
# them, so the office reads as two receding rows of lit workstations. The
# outer runs and the far panel stay at full height and keep the room closed.
DIVIDER_TOP = FLOOR_Z + 0.88
OUTER_PANEL_Y0 = units(-28.0)
# Each bay's desk stands against its far divider with the screen facing the
# camera; the glass sits far enough forward for the housing to clear the
# divider and for a keyboard to sit in front of it.
BAY_DESK_DEPTH = 0.85
BAY_GLASS_FROM_BACK = 0.53
# Ceiling grid: 16-unit (520 mm) tiles. The runtime paints the tile map with
# grid lines at x = 8 + 16k and z = −4 + 16k (ceiling.js gridOrigin), and the
# tees, troffers and grilles here sit on that same grid.
TILE = units(16.0)
GRID_X0 = units(8.0)
GRID_Y0 = units(4.0)
# Recessed troffers: one tile across, two tiles along the aisle, over the
# aisle's edges. Mirrored in OFFICE_LAYOUT.fixtures (Stages.jsx).
FIXTURE_XS = (-units(16.0), units(16.0))
FIXTURE_YS = [units(-12.0), units(36.0), units(84.0), units(132.0), units(180.0)]
# Only the two rows backed by runtime area sources run at full output. The
# remaining apertures stay visibly installed but idle, creating the dark gaps
# between fluorescent pools that keep the aisle from reading as uniform fill.
FIXTURE_DRIVES = [1.0, 0.12, 0.9, 0.1, 0.06]
FIXTURE_SIZE = (TILE, TILE * 2)

# Panel system dimensions.
POST = 0.05
PANEL_T = 0.065
CAP_H = 0.042
RACEWAY_H = 0.105
WORKTOP_T = 0.028
HERO_TOP_X = (-(AISLE_HALF - POST / 2 - 0.012), AISLE_HALF - POST / 2 - 0.012)
HERO_TOP_Y = (-0.38, 0.52)

# Where the deck's agent screens go (three.js units), collected as the bays
# are built and written to the scene extras.
AGENT_SCREENS: list[dict[str, float]] = []


def three_yaw_to_blender(yaw: float) -> float:
    """The deck yaws about +Y, which the axis contract maps to +Z here — the
    contract is a proper rotation (a quarter turn about X), so a yaw keeps
    its sign: turning +Z toward +X in the deck is turning −Y toward +X here."""
    return yaw


# ── Materials ────────────────────────────────────────────────────────────────


def build_materials() -> dict[str, bpy.types.Material]:
    linen = TEXTURE_DIR / "rough-linen"
    plaster = TEXTURE_DIR / "painted-plaster"
    carpet = TEXTURE_DIR / "office-carpet"
    materials = {
        # Runtime re-materials these by name (CubicleOffice.jsx) with the
        # talk's shared maps; the Blender look only has to predict the deck.
        "fabric": mapped_surface_material("Cubicle fabric", "#687371", 0.86, linen, repeats=(1.0, 1.0, 1.0), normal_strength=0.5),
        "fabric_lower": mapped_surface_material("Cubicle fabric lower", "#454d4c", 0.88, linen, repeats=(1.0, 1.0, 1.0), normal_strength=0.5),
        "frame": principled_material("Partition frame", "#515b59", 0.55, metallic=0.25, coat=0.04),
        "raceway": principled_material("Partition raceway", "#363f3d", 0.62, metallic=0.18),
        "laminate": textured_material("Laminate worktop", "#989188", "#8e887f", 0.61, scale=900.0, detail=1.0, bump_strength=0.0, bump_distance=0.0001),
        "steel": principled_material("Desk steel", "#394346", 0.4, metallic=0.58, coat=0.025),
        "carpet": mapped_surface_material("Carpet tile", "#3e4341", 0.98, carpet, repeats=(18.0, 24.0, 1.0), normal_strength=0.38, use_diffuse=True),
        "ceiling": principled_material("Ceiling tile", "#8d938f", 0.9),
        "tee": principled_material("Ceiling tee", "#626966", 0.55, metallic=0.12),
        "troffer": principled_material("Troffer frame", "#818a86", 0.5, metallic=0.2),
        "lens": principled_material("Troffer lens active", "#b8c2bd", 0.62, emission="#bac8c1", emission_strength=9.0),
        "lens_idle": principled_material("Troffer lens idle", "#626b67", 0.72, emission="#7a8782", emission_strength=1.0),
        "grille": principled_material("Return grille", "#4b5353", 0.5, metallic=0.38),
        "shell": mapped_surface_material("Office shell", "#4b534f", 0.93, plaster, repeats=(3.0, 2.0, 1.0), normal_strength=0.3),
        "base": principled_material("Vinyl base", "#2e3231", 0.7),
        "door": principled_material("Office door", "#666b67", 0.48, coat=0.06),
        "door_frame": principled_material("Door frame", "#2c302f", 0.5, metallic=0.3),
        "door_glass": principled_material("Door glass", "#071013", 0.19, metallic=0.04, coat=0.32),
        "bin": principled_material("Binder bin", "#8d918b", 0.55, metallic=0.12),
        "pedestal_body": principled_material("Pedestal carcass", "#5d6966", 0.61, metallic=0.06, coat=0.08),
        "pedestal_front": principled_material("Pedestal drawer", "#697571", 0.49, metallic=0.08, coat=0.1),
        "pedestal_hardware": principled_material("Pedestal hardware", "#343b3c", 0.27, metallic=0.76),
        "pedestal_caster": principled_material("Pedestal caster", "#202629", 0.7, metallic=0.04),
        "chair_fabric": mapped_surface_material("Chair wool", "#62584d", 0.96, linen, repeats=(1.0, 1.0, 1.0), normal_strength=0.45, use_diffuse=True),
        "chair_frame": principled_material("Chair frame", "#151a1d", 0.5, metallic=0.025),
        "chrome": principled_material("Chair chrome", "#8b9491", 0.29, metallic=0.78),
        "crt": textured_material("Bay CRT", "#2b2d32", "#33363c", 0.62, scale=52.0, detail=3.0, bump_strength=0.035, bump_distance=0.0007, metallic=0.015),
        "keyboard": principled_material("Keyboard case", "#20262d", 0.72),
        "keycap": principled_material("PBT keycaps", "#3a424c", 0.62),
        "keycap_mod": principled_material("PBT modifier keycaps", "#2c333b", 0.66),
        "keyboard_plate": principled_material("Keyboard plate", "#0b0d0d", 0.8),
        "rubber": principled_material("Soft rubber", "#111514", 0.82),
        "mouse": principled_material("Mouse shell", "#2a3038", 0.54, coat=0.08),
        "black": principled_material("Dead black", "#080b0a", 0.84),
        "ceramic": principled_material("Bone ceramic", "#c9c6bc", 0.38, coat=0.65),
        "coffee": principled_material("Black coffee", "#070605", 0.18, coat=0.4),
        "paper": principled_material("Copy paper", "#d8d3c5", 0.9),
        "badge": principled_material("ID badge", "#315b70", 0.74, coat=0.2),
        "lanyard": principled_material("Lanyard", "#23282c", 0.9),
        "modesty": principled_material("Modesty panel", "#585e5c", 0.55, metallic=0.3),
        "waste": principled_material("Waste bin", "#2b2f2e", 0.72),
        "strip": principled_material("Power strip", "#d8d6cf", 0.6),
        "phone": principled_material("Desk phone", "#3a3f3e", 0.6, coat=0.06),
        "copier": principled_material("Copier shell", "#a9a79e", 0.55, coat=0.05),
        "copier_trim": principled_material("Copier trim", "#2c302f", 0.5),
        "clock_rim": principled_material("Clock rim", "#1d2120", 0.45, metallic=0.3),
        "clock_face": principled_material("Clock face", "#e6e4dc", 0.7),
        # Lookdev only: the glass and the marks on it.
        "screen_black": principled_material("CRT glass black", "#050705", 0.34, coat=0.06, emission="#090b07", emission_strength=0.16),
        "screen_amber": principled_material("Amber phosphor hot", "#ffd54a", 0.34, emission="#ffd54a", emission_strength=6.0),
        "screen_dim": principled_material("Amber phosphor dim", "#8f6c22", 0.44, emission="#b68a2c", emission_strength=2.2),
        "screen_bay": principled_material("Bay phosphor glow", "#6a5220", 0.4, emission="#c9951f", emission_strength=1.6),
    }
    set_input(materials["screen_black"].node_tree.nodes.get("Principled BSDF"), "Specular IOR Level", 0.10)
    return materials


# ── Shell ────────────────────────────────────────────────────────────────────


def build_shell(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    floor = add_box(
        "Carpet floor",
        (FLOOR_WIDTH, FLOOR_DEPTH, 0.02),
        (0.0, FLOOR_CENTRE_Y, FLOOR_Z - 0.01),
        mats["carpet"],
        target,
    )
    # The deck's carpet tile field and the ceiling maps are painted to these
    # exact footprints; fitted UVs put them where the painters expect.
    footprint = dict(
        x_range=(-FLOOR_WIDTH / 2, FLOOR_WIDTH / 2),
        y_range=(FLOOR_CENTRE_Y - FLOOR_DEPTH / 2, FLOOR_CENTRE_Y + FLOOR_DEPTH / 2),
    )
    fitted_uv(floor, **footprint)
    ceiling = add_box(
        "Ceiling tiles",
        (FLOOR_WIDTH, FLOOR_DEPTH, 0.02),
        (0.0, FLOOR_CENTRE_Y, CEILING_Z + 0.01),
        mats["ceiling"],
        target,
    )
    fitted_uv(ceiling, **footprint)

    wall_height = CEILING_Z - FLOOR_Z
    wall_mid = (CEILING_Z + FLOOR_Z) / 2
    depth = SHELL_BACK_Y - SHELL_FRONT_Y
    for side in (-1, 1):
        wall = add_box(
            "Side wall",
            (0.12, depth, wall_height),
            (side * (SHELL_HALF_X + 0.06), (SHELL_BACK_Y + SHELL_FRONT_Y) / 2, wall_mid),
            mats["shell"],
            target,
        )
        box_project_uv(wall, 1.0)
        add_box(
            "Side vinyl base",
            (0.012, depth, 0.1),
            (side * (SHELL_HALF_X - 0.006), (SHELL_BACK_Y + SHELL_FRONT_Y) / 2, FLOOR_Z + 0.05),
            mats["base"],
            target,
            bevel=0.003,
            segments=2,
        )

    # Back wall with a pair of doors on the aisle axis: the corridor leads
    # somewhere, which is what keeps the far end from reading as a set edge.
    door_w, door_h = 0.9, 2.04
    door_top = FLOOR_Z + door_h
    spans = [
        (-SHELL_HALF_X, -door_w, FLOOR_Z, CEILING_Z),
        (door_w, SHELL_HALF_X, FLOOR_Z, CEILING_Z),
        (-door_w, door_w, door_top, CEILING_Z),
    ]
    for index, (left, right, bottom, top) in enumerate(spans):
        wall = add_box(
            f"Back wall {index + 1}",
            (right - left, 0.12, top - bottom),
            ((left + right) / 2, SHELL_BACK_Y + 0.06, (bottom + top) / 2),
            mats["shell"],
            target,
        )
        box_project_uv(wall, 1.0)
    for x0, x1 in ((-SHELL_HALF_X, -door_w - 0.05), (door_w + 0.05, SHELL_HALF_X)):
        add_box(
            "Back vinyl base",
            (x1 - x0, 0.012, 0.1),
            ((x0 + x1) / 2, SHELL_BACK_Y - 0.006, FLOOR_Z + 0.05),
            mats["base"],
            target,
            bevel=0.003,
            segments=2,
        )
    for x in (-door_w - 0.03, door_w + 0.03):
        add_box("Door jamb", (0.06, 0.14, door_h + 0.06), (x, SHELL_BACK_Y - 0.01, (door_top + FLOOR_Z) / 2 + 0.03), mats["door_frame"], target, bevel=0.004)
    add_box("Door head", (door_w * 2 + 0.12, 0.14, 0.06), (0.0, SHELL_BACK_Y - 0.01, door_top + 0.03), mats["door_frame"], target, bevel=0.004)
    for side in (-1, 1):
        add_box(
            "Door leaf",
            (door_w - 0.012, 0.045, door_h - 0.02),
            (side * door_w / 2, SHELL_BACK_Y - 0.03, FLOOR_Z + door_h / 2 - 0.005),
            mats["door"],
            target,
            bevel=0.006,
        )
        add_box("Door push plate", (0.1, 0.004, 0.3), (side * 0.12, SHELL_BACK_Y - 0.054, FLOOR_Z + 1.02), mats["chrome"], target, bevel=0.002, segments=2)
        add_box("Door vision panel", (0.12, 0.05, 0.6), (side * 0.32, SHELL_BACK_Y - 0.03, FLOOR_Z + 1.45), mats["door_glass"], target)


# ── Ceiling system ───────────────────────────────────────────────────────────


def grid_lines(origin: float, start: float, end: float) -> list[float]:
    first = origin + math.floor((start - origin) / TILE) * TILE
    values = []
    value = first
    while value <= end + 1e-6:
        if value >= start - 1e-6:
            values.append(value)
        value += TILE
    return values


def build_ceiling_system(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    y0 = FLOOR_CENTRE_Y - FLOOR_DEPTH / 2
    y1 = SHELL_BACK_Y
    x0, x1 = -SHELL_HALF_X, SHELL_HALF_X
    tee_w, tee_h = 0.024, 0.02
    tee_z = CEILING_Z - tee_h / 2 + 0.004
    # A suspended grid at its real 24 mm; the runtime fades the whole member
    # set out once it projects under 1.5 px, into the painted grid on the tiles.
    for x in grid_lines(GRID_X0, x0, x1):
        add_box(f"Ceiling tee x{x:.2f}", (tee_w, y1 - y0, tee_h), (x, (y0 + y1) / 2, tee_z), mats["tee"], target)
    for y in grid_lines(GRID_Y0, y0, y1):
        add_box(f"Ceiling tee y{y:.2f}", (x1 - x0, tee_w, tee_h), (0.0, y, tee_z), mats["tee"], target)

    # Recessed troffers: a lens set 6 mm up into the tile plane, with a
    # 20 mm door frame around it, sitting on the grid.
    lens_w, lens_d = FIXTURE_SIZE[0] - 0.05, FIXTURE_SIZE[1] - 0.05
    frame_w, frame_d = FIXTURE_SIZE[0] - 0.012, FIXTURE_SIZE[1] - 0.012
    for x in FIXTURE_XS:
        for row, y in enumerate(FIXTURE_YS):
            lens_material = mats["lens"] if FIXTURE_DRIVES[row] >= 0.5 else mats["lens_idle"]
            add_box(f"Troffer lens ({x:.2f}, {y:.2f})", (lens_w, lens_d, 0.008), (x, y, CEILING_Z - 0.006), lens_material, target)
            for sx in (-1, 1):
                add_box("Troffer door rail", (0.02, frame_d, 0.014), (x + sx * (frame_w / 2 - 0.01), y, CEILING_Z - 0.007), mats["troffer"], target, bevel=0.002, segments=2)
            for sy in (-1, 1):
                add_box("Troffer door rail", (frame_w, 0.02, 0.014), (x, y + sy * (frame_d / 2 - 0.01), CEILING_Z - 0.007), mats["troffer"], target, bevel=0.002, segments=2)

    # Return-air grilles down the left side of the aisle ceiling.
    for y in (units(28.0), units(124.0), units(220.0)):
        x = -units(40.0)
        add_box("Grille frame", (TILE - 0.03, TILE / 2 - 0.02, 0.012), (x, y, CEILING_Z - 0.005), mats["grille"], target)
        for index in range(6):
            ly = y - (TILE / 2 - 0.02) / 2 + 0.03 + index * 0.038
            add_box("Grille louvre", (TILE - 0.07, 0.014, 0.02), (x, ly, CEILING_Z - 0.016), mats["grille"], target, rotation=(math.radians(35), 0, 0))


# ── Partitions ───────────────────────────────────────────────────────────────


class PanelSystem:
    """Fabric panels between shared posts. Posts are collected as panels are
    laid out, so two panels meeting at a corner share one post rather than
    stacking two."""

    def __init__(self, target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
        self.target = target
        self.mats = mats
        self.posts: dict[tuple[float, float], float] = {}

    def post(self, x: float, y: float, top_z: float) -> None:
        key = (round(x, 3), round(y, 3))
        self.posts[key] = max(self.posts.get(key, FLOOR_Z), top_z)

    def panel(
        self,
        name: str,
        start: tuple[float, float],
        end: tuple[float, float],
        top_z: float,
    ) -> None:
        (x0, y0), (x1, y1) = start, end
        length = math.hypot(x1 - x0, y1 - y0)
        angle = math.atan2(y1 - y0, x1 - x0)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rot = (0.0, 0.0, angle)
        inner = length - POST - 0.006
        raceway_top = FLOOR_Z + RACEWAY_H
        cap_bottom = top_z - CAP_H
        # Two fabric tiles, split at the beltline rail: a darker one below
        # the worksurface and a lighter one above. One flat tile floor to cap
        # read as a slab; the tone break is what says panel system.
        beltline_z = DESK_Z - 0.06
        for label, material, z0, z1 in (
            ("lower fabric", self.mats["fabric_lower"], raceway_top + 0.002, beltline_z - 0.013),
            ("upper fabric", self.mats["fabric"], beltline_z + 0.013, cap_bottom - 0.002),
        ):
            fabric = add_box(
                f"{name} {label}",
                (inner, PANEL_T - 0.012, z1 - z0),
                (cx, cy, (z0 + z1) / 2),
                material,
                self.target,
                rotation=rot,
                bevel=0.005,
                segments=2,
            )
            box_project_uv(fabric, 1.0)
        add_box(
            f"{name} raceway",
            (inner, PANEL_T, RACEWAY_H - 0.006),
            (cx, cy, FLOOR_Z + RACEWAY_H / 2 + 0.002),
            self.mats["raceway"],
            self.target,
            rotation=rot,
            bevel=0.003,
            segments=2,
        )
        add_box(
            f"{name} cap",
            (inner + 0.004, PANEL_T + 0.006, CAP_H),
            (cx, cy, top_z - CAP_H / 2),
            self.mats["frame"],
            self.target,
            rotation=rot,
            bevel=0.006,
        )
        # The beltline rail the worksurface hardware hangs from.
        add_box(
            f"{name} beltline",
            (inner, PANEL_T + 0.004, 0.026),
            (cx, cy, DESK_Z - 0.06),
            self.mats["frame"],
            self.target,
            rotation=rot,
            bevel=0.003,
            segments=2,
        )
        self.post(x0, y0, top_z)
        self.post(x1, y1, top_z)

    def build_posts(self) -> None:
        for (x, y), top_z in self.posts.items():
            add_box(
                f"Post ({x:.2f}, {y:.2f})",
                (POST, POST, top_z - FLOOR_Z),
                (x, y, (top_z + FLOOR_Z) / 2),
                self.mats["frame"],
                self.target,
                bevel=0.004,
                segments=2,
            )


def build_partitions(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    system = PanelSystem(target, mats)
    # Hero bay: two low side panels on the aisle lines, sharing their far
    # posts with the first transverse panels of each bank.
    for side in (-1, 1):
        x = side * AISLE_HALF
        system.panel(f"Hero side panel {side}", (x, HERO_PANEL_Y0), (x, HERO_PANEL_Y1), HERO_PANEL_TOP)
    for side in (-1, 1):
        inner = side * AISLE_HALF
        outer = side * BANK_OUTER
        for y in BAY_EDGES_Y:
            system.panel(f"Transverse panel {side} {y:.2f}", (inner, y), (outer, y), DIVIDER_TOP)
        # The outer run, one segment per bay so the posts are shared.
        edges = [OUTER_PANEL_Y0, *BAY_EDGES_Y, FAR_PANEL_Y]
        for y0, y1 in zip(edges, edges[1:]):
            system.panel(f"Outer panel {side} {y0:.2f}", (outer, y0), (outer, y1), BANK_PANEL_TOP)
    # The far panel closes the aisle between the two outer runs.
    far_edges = [-BANK_OUTER, -AISLE_HALF, AISLE_HALF, BANK_OUTER]
    for x0, x1 in zip(far_edges, far_edges[1:]):
        system.panel(f"Far panel {x0:.2f}", (x0, FAR_PANEL_Y), (x1, FAR_PANEL_Y), BANK_PANEL_TOP)
    system.build_posts()


# ── Workstations ─────────────────────────────────────────────────────────────


def build_worktop(
    name: str,
    x_range: tuple[float, float],
    y_range: tuple[float, float],
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    *,
    back: str,
) -> None:
    """A laminate worksurface on a steel C-frame that stands on the floor:
    two columns near the back edge with feet running forward under the top,
    a beam between them, a modesty panel below the back edge, and a cable
    tray. `back` names the top's back edge: 'y1' for the hero top (its back
    toward the aisle), 'x0'/'x1' for a bank top (its back at the outer
    partition). The first pass hung the tops on panel cleats, and the cleat
    hangers read as legs that stop in mid-air."""
    x0, x1 = x_range
    y0, y1 = y_range
    top = add_box(
        f"{name} top",
        (x1 - x0, y1 - y0, WORKTOP_T),
        ((x0 + x1) / 2, (y0 + y1) / 2, DESK_Z - WORKTOP_T / 2),
        mats["laminate"],
        target,
        bevel=0.006,
        segments=3,
    )
    box_project_uv(top, 1.0)

    # The frame is described along the back edge (a) and across it (v).
    if back == "y1":
        along, a0, a1, back_v, front_v = "x", x0 + 0.14, x1 - 0.14, y1, y0
    elif back == "x1":
        along, a0, a1, back_v, front_v = "y", y0 + 0.06, y1 - 0.06, x1, x0
    else:
        along, a0, a1, back_v, front_v = "y", y0 + 0.06, y1 - 0.06, x0, x1
    sign = 1.0 if front_v > back_v else -1.0
    column_v = back_v + sign * 0.10
    foot_length = min(0.55, abs(front_v - back_v) - 0.14)

    def place(a: float, v: float) -> tuple[float, float]:
        return (a, v) if along == "x" else (v, a)

    def dims(da: float, dv: float, dz: float) -> tuple[float, float, float]:
        return (da, dv, dz) if along == "x" else (dv, da, dz)

    underside = DESK_Z - WORKTOP_T
    column_h = underside - FLOOR_Z - 0.03
    for a in (a0, a1):
        cx, cy = place(a, column_v)
        add_box(f"{name} column", dims(0.05, 0.05, column_h), (cx, cy, FLOOR_Z + 0.03 + column_h / 2), mats["steel"], target, bevel=0.004, segments=2)
        fx, fy = place(a, column_v + sign * (foot_length / 2 - 0.025))
        add_box(f"{name} foot", dims(0.06, foot_length, 0.03), (fx, fy, FLOOR_Z + 0.015), mats["steel"], target, bevel=0.006, segments=2)
        add_box(f"{name} top beam", dims(0.05, foot_length, 0.04), (fx, fy, underside - 0.02), mats["steel"], target, bevel=0.004, segments=2)
    bx, by = place((a0 + a1) / 2, column_v)
    add_box(f"{name} rear beam", dims(a1 - a0, 0.05, 0.05), (bx, by, underside - 0.045), mats["steel"], target, bevel=0.004, segments=2)
    mx, my = place((a0 + a1) / 2, back_v + sign * 0.06)
    add_box(f"{name} modesty panel", dims(a1 - a0 - 0.02, 0.012, 0.32), (mx, my, underside - 0.02 - 0.16), mats["modesty"], target, bevel=0.003, segments=2)
    tx, ty = place((a0 + a1) / 2, back_v + sign * 0.03)
    add_box(f"{name} cable tray", dims(a1 - a0 - 0.30, 0.05, 0.05), (tx, ty, underside - 0.045), mats["steel"], target, bevel=0.003, segments=2)


def bucket_pedestal(obj: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    """The four manufactured families of the filing pedestal, by position in
    its own metric Z-up frame (the runtime used the same windows in mm).

    No lock window: the CAD front is a few large triangles, and painting the
    ones whose centroids fell in a 50 mm lock window dark drew a jagged
    wedge across the top drawer. There is no modelled lock to paint."""
    obj.data.materials.clear()
    for material in (mats["pedestal_body"], mats["pedestal_front"], mats["pedestal_hardware"], mats["pedestal_caster"]):
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        x, y, z = polygon.center
        front = y < -0.252
        pull = front and any(abs(z - height) < 0.012 for height in (0.323, 0.447, 0.569))
        if pull:
            polygon.material_index = 2
        elif z < 0.062:
            polygon.material_index = 3
        elif front and z > 0.082:
            polygon.material_index = 1
        else:
            polygon.material_index = 0


def bucket_chair(obj: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> None:
    obj.data.materials.clear()
    for material in (mats["chair_fabric"], mats["chair_frame"], mats["chrome"]):
        obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        center = polygon.center
        radial = math.hypot(center.x, center.y)
        polygon.material_index = 0 if center.z > 0.43 else 2 if 0.18 < center.z < 0.42 and radial < 0.075 else 1


def import_cad_source(path: Path, name: str, target: bpy.types.Collection) -> bpy.types.Object:
    """A millimetre, Z-up CAD export stood up in metres with its transforms
    baked into the mesh and its edges creased at 40°, so placed copies only
    need a location and a yaw."""
    imported = import_glb(path, name, target, rotation=(-math.pi / 2, 0.0, 0.0))
    assert len(imported) == 1 and imported[0].type == "MESH", path
    source = imported[0]
    bake_object_transform(source)
    crease_by_angle(source)
    return source


def place_seated(
    source: bpy.types.Object,
    name: str,
    target: bpy.types.Collection,
    *,
    location: tuple[float, float],
    yaw: float,
    surface_z: float,
) -> bpy.types.Object:
    obj = duplicate_object(source, name, target, location=(location[0], location[1], surface_z), rotation=(0.0, 0.0, yaw))
    seat_on([obj], surface_z)
    return obj


def place_bay_monitor(
    source: bpy.types.Object,
    name: str,
    target: bpy.types.Collection,
    lookdev: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    *,
    glass_centre: tuple[float, float, float],
) -> None:
    """A housing whose glass lands where the deck will draw the screen, facing
    the camera down the aisle (−Y here, +Z in the deck: yaw 0 in both). The
    pocket floor sits 10 mm behind the glass and the opening is centred 17 mm
    below the housing's origin (Monitor.jsx), so the origin is 10 mm behind
    and 17 mm up from the glass centre."""
    gx, gy, gz = glass_centre
    duplicate_object(source, name, target, location=(gx, gy + 0.010, gz + 0.017))
    add_box(
        f"{name} lookdev glass",
        (0.520, 0.006, 0.2925),
        (gx, gy - 0.002, gz),
        mats["screen_bay"],
        lookdev,
        bevel=0.012,
        segments=4,
    )
    x, y, z = blender_to_three((gx, gy, gz))
    AGENT_SCREENS.append({"x": round(x, 4), "y": round(y, 4), "z": round(z, 4), "yaw": 0.0})


def build_bay_desk_props(
    bay: int,
    side: int,
    x_centre: float,
    glass_y: float,
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> None:
    """What sits on a bay desk besides its monitor: the keyboard in front of
    the glass, a mouse beside it, and a mug or a paper stack, varied per bay.
    The desk faces +Y (away from the camera), so the board's depth runs +Y."""
    build_bay_keyboard(
        target,
        mats,
        location=(x_centre - 0.02, glass_y - 0.15 - KEYBOARD_DEPTH, DESK_Z),
        rotation=(math.radians(4.0), 0.0, math.radians(random.uniform(-3, 3))),
        name=f"Bay {bay} {side} keyboard",
    )
    # The mouse's nose points toward the glass (its nose is local −Y).
    build_simple_mouse(
        target,
        mats,
        (x_centre + 0.27, glass_y - 0.21, DESK_Z),
        math.radians(180.0 + random.uniform(-14, 14)),
        name=f"Bay {bay} {side} mouse",
    )
    dress = random.random()
    if dress < 0.5:
        build_mug(
            target,
            mats,
            (x_centre + 0.46, glass_y - 0.10 + random.uniform(-0.05, 0.05), DESK_Z),
            math.radians(random.uniform(0, 360)),
            name=f"Bay {bay} {side} mug",
            steps=24,
        )
    else:
        add_box(
            f"Bay {bay} {side} paper stack",
            (0.21, 0.297, 0.018),
            (x_centre - 0.50, glass_y - 0.20, DESK_Z + 0.009),
            mats["paper"],
            target,
            rotation=(0, 0, math.radians(random.uniform(-15, 15))),
            bevel=0.002,
            segments=2,
        )


def build_workstations(
    export: bpy.types.Collection,
    lookdev: bpy.types.Collection,
    sources: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> None:
    # Sources live outside the export collection: every placed piece is a
    # copy, the hero ones sharing full-resolution data and the bay ones a
    # decimated copy of it.
    pedestal_src = import_cad_source(MODEL_DIR / "office-pedestal.glb", "Pedestal source", sources)
    bucket_pedestal(pedestal_src, mats)
    chair_src = import_cad_source(MODEL_DIR / "office-chair.glb", "Chair source", sources)
    bucket_chair(chair_src, mats)
    # The upholstery carries the office linen at runtime; the CAD has no UVs,
    # so project them here at the 620 mm tile the deck's chair used.
    box_project_uv(chair_src, 0.62)
    bay_chair_src = duplicate_object(chair_src, "Bay chair source", sources, location=(0.0, 0.0, 0.0), linked=False)
    add_decimate(bay_chair_src, 0.12)
    bay_pedestal_src = duplicate_object(pedestal_src, "Bay pedestal source", sources, location=(0.0, 0.0, 0.0), linked=False)
    add_decimate(bay_pedestal_src, 0.35)
    imported = import_glb(MODEL_DIR / "crt-monitor.glb", "Bay CRT source", sources, material=mats["crt"])
    assert len(imported) == 1 and imported[0].type == "MESH"
    monitor_src = imported[0]
    bake_object_transform(monitor_src)
    crease_by_angle(monitor_src)
    # From the aisle the housing is 3–7 m away; a third of its triangles
    # keeps the loft and the chin and drops what the frame cannot resolve.
    add_decimate(monitor_src, 0.34)

    # ── Hero bay ──
    build_worktop("Hero", HERO_TOP_X, HERO_TOP_Y, export, mats, back="y1")
    # The pedestal under the right side, drawers to the sitter, inboard of
    # the right column; the chair pulled out to the left of the bay, the way
    # it was left.
    place_seated(pedestal_src, "Hero pedestal", export, location=(units(15.0), units(3.0)), yaw=0.0, surface_z=FLOOR_Z)
    place_seated(chair_src, "Hero task chair", export, location=(units(-43.0), units(-18.0)), yaw=three_yaw_to_blender(0.18), surface_z=FLOOR_Z)

    # ── Bank bays ──
    # Every bay is the hero workstation again: a desk against the far
    # divider, the screen facing the camera down the aisle, the chair with
    # its back to us. Over the low dividers the two rows read as rows.
    for bay, (y0, y1) in enumerate(BAYS_Y):
        for side in (-1, 1):
            x_inner = side * (AISLE_HALF + 0.05)
            x_outer = side * (BANK_OUTER - PANEL_T / 2 - 0.03)
            x_lo, x_hi = min(x_inner, x_outer), max(x_inner, x_outer)
            x_centre = (x_lo + x_hi) / 2
            y_back = y1 - POST / 2 - 0.02
            y_front = y_back - BAY_DESK_DEPTH
            glass_y = y_back - BAY_GLASS_FROM_BACK
            build_worktop(f"Bay {bay} {side}", (x_lo, x_hi), (y_front, y_back), export, mats, back="y1")
            place_bay_monitor(
                monitor_src,
                f"Bay {bay} {side} CRT",
                export,
                lookdev,
                mats,
                glass_centre=(x_centre, glass_y, 0.0),
            )
            # The chair pushed up to the desk's front edge, facing it.
            place_seated(
                bay_chair_src,
                f"Bay {bay} {side} chair",
                export,
                location=(x_centre + random.uniform(-0.12, 0.12), y_front - 0.36),
                yaw=math.radians(random.uniform(-10, 10)),
                surface_z=FLOOR_Z,
            )
            # Pedestal under the outer end of the desk, drawers to the sitter,
            # inboard of the frame's outer column; the waste bin under the
            # inner end.
            place_seated(
                bay_pedestal_src,
                f"Bay {bay} {side} pedestal",
                export,
                location=(x_centre + side * 0.42, y_back - 0.30),
                yaw=0.0,
                surface_z=FLOOR_Z,
            )
            add_cylinder(
                f"Bay {bay} {side} waste bin",
                0.13,
                0.30,
                (x_centre - side * 0.50, y_back - 0.45, FLOOR_Z + 0.15),
                mats["waste"],
                export,
                vertices=32,
                bevel=0.006,
            )
            build_bay_desk_props(bay, side, x_centre, glass_y, export, mats)
            # Binder bin hung on the outer partition over the desk's outer end.
            bin_x = side * (BANK_OUTER - PANEL_T / 2 - 0.16)
            bin_top = BANK_PANEL_TOP - CAP_H - 0.02
            y_centre = (y0 + y1) / 2
            add_box(f"Bay {bay} {side} binder bin", (0.30, 0.90, 0.36), (bin_x, y_centre, bin_top - 0.18), mats["bin"], export, bevel=0.006, segments=2)
            add_box(f"Bay {bay} {side} bin door", (0.012, 0.86, 0.30), (bin_x - side * 0.152, y_centre, bin_top - 0.16), mats["frame"], export, bevel=0.004, segments=2)


# ── Hero desk props ──────────────────────────────────────────────────────────


def build_hero_props(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # The same keyboard, mouse and mug as the home desk: it is the same
    # workstation, which is the point.
    # No keyboard or mouse cables here: on a 900 mm top with the housing
    # 190 mm behind the board there is nowhere for them to go but through the
    # laminate, which is exactly where the first pass put them.
    build_keyboard(
        target,
        mats,
        location=(units(-0.4), -0.19 - KEYBOARD_DEPTH / 2, DESK_Z),
        rotation=(math.radians(4.5), 0.0, math.radians(-2.5)),
        cable=False,
    )
    build_mouse(target, mats, (units(6.1), -0.20, DESK_Z), math.radians(175), desk_top_z=DESK_Z, cable=False)
    build_mug(target, mats, (units(9.9), -0.06, DESK_Z), math.radians(28))
    # Corporate ephemera: a loose sheet of paper and an ID badge.
    add_box(
        "Loose paper",
        (0.21, 0.297, 0.004),
        (units(-10.5), -0.16, DESK_Z + 0.002),
        mats["paper"],
        target,
        rotation=(0, 0, math.radians(13)),
        bevel=0.001,
        segments=1,
    )
    badge_x = units(-16.5)
    add_box(
        "ID badge",
        (0.054, 0.086, 0.004),
        (badge_x, -0.34, DESK_Z + 0.002),
        mats["badge"],
        target,
        rotation=(0, 0, math.radians(-8)),
        bevel=0.004,
        segments=3,
    )
    # The monitor's power cable: off the back of the housing, over the top's
    # back edge (y = 0.52), down behind the modesty panel, into the power
    # strip. The first route went through the laminate.
    add_curve(
        "Monitor power cable",
        [
            (0.20, 0.20, DESK_Z + 0.33),
            (0.28, 0.44, DESK_Z + 0.06),
            (0.33, 0.55, DESK_Z - 0.02),
            (0.34, 0.57, DESK_Z - 0.30),
            (0.30, 0.55, FLOOR_Z + 0.12),
            (0.24, 0.47, FLOOR_Z + 0.03),
        ],
        0.006,
        mats["rubber"],
        target,
    )
    add_box(
        "Power strip",
        (0.30, 0.06, 0.04),
        (0.12, 0.44, FLOOR_Z + 0.02),
        mats["strip"],
        target,
        rotation=(0, 0, math.radians(12)),
        bevel=0.006,
        segments=2,
    )
    # A desk phone at the left, its handset cradled, the cord coiled off it.
    phone_x, phone_y, phone_yaw = -0.62, 0.14, math.radians(20)
    add_box("Desk phone", (0.19, 0.21, 0.05), (phone_x, phone_y, DESK_Z + 0.025), mats["phone"], target, rotation=(0, 0, phone_yaw), bevel=0.008, segments=3)
    add_box("Desk phone keypad", (0.085, 0.075, 0.004), (phone_x + 0.035 * math.cos(phone_yaw), phone_y + 0.035 * math.sin(phone_yaw), DESK_Z + 0.052), mats["black"], target, rotation=(0, 0, phone_yaw), bevel=0.002, segments=2)
    add_box("Desk phone display", (0.085, 0.03, 0.004), (phone_x + 0.035 * math.cos(phone_yaw) - 0.06 * math.sin(phone_yaw), phone_y + 0.035 * math.sin(phone_yaw) + 0.06 * math.cos(phone_yaw), DESK_Z + 0.052), mats["black"], target, rotation=(0, 0, phone_yaw), bevel=0.002, segments=2)
    bevelled_block(
        "Desk phone handset",
        (0.045, 0.215, 0.04),
        (phone_x - 0.075 * math.cos(phone_yaw), phone_y - 0.075 * math.sin(phone_yaw), DESK_Z + 0.07),
        mats["phone"],
        target,
        bevel=0.016,
        segments=5,
        rotation=(0, 0, phone_yaw),
    )
    # A short cord from the handset's end into the body, coiled tight.
    add_curve(
        "Desk phone cord",
        [
            (phone_x - 0.075 * math.cos(phone_yaw) + 0.105 * math.sin(phone_yaw), phone_y - 0.075 * math.sin(phone_yaw) - 0.105 * math.cos(phone_yaw), DESK_Z + 0.05),
            (phone_x - 0.06 * math.cos(phone_yaw) + 0.15 * math.sin(phone_yaw), phone_y - 0.06 * math.sin(phone_yaw) - 0.15 * math.cos(phone_yaw), DESK_Z + 0.012),
            (phone_x + 0.13 * math.sin(phone_yaw), phone_y - 0.13 * math.cos(phone_yaw), DESK_Z + 0.03),
        ],
        0.003,
        mats["rubber"],
        target,
    )
    # The waste bin under the left side of the desk.
    add_cylinder("Waste bin", 0.13, 0.30, (-0.55, 0.30, FLOOR_Z + 0.15), mats["waste"], target, vertices=32, bevel=0.006)
    # Three notes pinned to the right-hand panel's inner face.
    note_x = AISLE_HALF - (PANEL_T - 0.012) / 2 - 0.0015
    for index, (dy, dz, tilt) in enumerate(((0.06, 0.16, -4.0), (0.17, 0.19, 3.0), (0.12, 0.07, -2.0))):
        add_box(
            f"Pinned note {index + 1}",
            (0.002, 0.076, 0.076),
            (note_x, dy, DESK_Z + dz),
            mats["paper"],
            target,
            rotation=(math.radians(tilt), 0, 0),
        )


def build_aisle_end(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    """What the aisle runs toward: a copier against the far panel, and a
    clock on the back wall beside the doors. The far end read as a set edge
    without something the corridor leads to."""
    cx, cy = 0.0, FAR_PANEL_Y - 0.46
    add_box("Copier body", (0.62, 0.66, 0.92), (cx, cy, FLOOR_Z + 0.46), mats["copier"], target, bevel=0.012, segments=3)
    add_box("Copier lid", (0.60, 0.50, 0.06), (cx, cy + 0.05, FLOOR_Z + 0.95), mats["copier"], target, bevel=0.010, segments=3)
    add_box("Copier control panel", (0.30, 0.16, 0.03), (cx + 0.12, cy - 0.28, FLOOR_Z + 0.955), mats["copier_trim"], target, rotation=(math.radians(25), 0, 0), bevel=0.004, segments=2)
    add_box("Copier output tray", (0.42, 0.30, 0.02), (cx - 0.50, cy, FLOOR_Z + 0.72), mats["copier_trim"], target, bevel=0.004, segments=2)
    for z in (0.22, 0.46):
        add_box("Copier paper drawer", (0.56, 0.02, 0.17), (cx, cy - 0.335, FLOOR_Z + z), mats["copier_trim"], target, bevel=0.004, segments=2)
        add_box("Copier drawer pull", (0.14, 0.012, 0.02), (cx, cy - 0.35, FLOOR_Z + z + 0.06), mats["frame"], target, bevel=0.003, segments=2)
    add_box("Copier plinth", (0.58, 0.60, 0.06), (cx, cy, FLOOR_Z + 0.03), mats["copier_trim"], target)

    clock_x, clock_z = 1.5, FLOOR_Z + 1.72
    add_cylinder("Clock rim", 0.16, 0.04, (clock_x, SHELL_BACK_Y - 0.02, clock_z), mats["clock_rim"], target, rotation=(math.pi / 2, 0, 0), vertices=48, bevel=0.006)
    add_cylinder("Clock face", 0.14, 0.006, (clock_x, SHELL_BACK_Y - 0.043, clock_z), mats["clock_face"], target, rotation=(math.pi / 2, 0, 0), vertices=48)
    add_box("Clock hour hand", (0.012, 0.004, 0.08), (clock_x + 0.02, SHELL_BACK_Y - 0.049, clock_z + 0.03), mats["clock_rim"], target, rotation=(0, math.radians(-30), 0))
    add_box("Clock minute hand", (0.008, 0.004, 0.12), (clock_x - 0.02, SHELL_BACK_Y - 0.051, clock_z + 0.04), mats["clock_rim"], target, rotation=(0, math.radians(20), 0))


# ── Lookdev ──────────────────────────────────────────────────────────────────


def build_lookdev_monitor(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    import_glb(
        MODEL_DIR / "crt-monitor.glb",
        "Hero CRT proxy",
        target,
        location=(0.0, -0.010, 0.017),
        material=mats["crt"],
    )
    add_box("Lookdev glass", (0.520, 0.008, 0.2925), (0, -0.004, 0), mats["screen_black"], target, bevel=0.020, segments=8)
    amber = mats["screen_amber"]
    dim = mats["screen_dim"]
    add_box("Screen title", (0.21, 0.002, 0.009), (-0.115, -0.0095, 0.092), amber, target, bevel=0.001)
    add_box("Screen subtitle", (0.15, 0.002, 0.004), (-0.145, -0.0095, 0.072), dim, target, bevel=0.001)
    for row, (width, z) in enumerate(((0.19, 0.022), (0.075, -0.055))):
        add_box(f"Screen label {row}", (0.12, 0.002, 0.004), (-0.145, -0.0095, z), dim, target, bevel=0.001)
        add_box(f"Screen bar {row}", (width, 0.002, 0.013), (0.055 - (0.19 - width) / 2, -0.0095, z), amber, target, bevel=0.002)


def build_lighting(target: bpy.types.Collection) -> None:
    """The deck's office rig (Stages.jsx OfficeLighting + Scene.jsx), at the
    same places, sizes, colours and aims, so a render predicts the talk."""
    # One source per lit troffer (the two driven rows), the size of its lens:
    # pools under the fixtures with dark intervals between them, instead of
    # one bar of light across the whole aisle.
    for row, drive in enumerate(FIXTURE_DRIVES):
        if drive < 0.5:
            continue
        for x in FIXTURE_XS:
            y = FIXTURE_YS[row]
            add_area_light(
                f"Troffer ({x:+.2f}, {y:+.2f})",
                (x, y, CEILING_Z - 0.02),
                (x, y, FLOOR_Z),
                23.0 * drive,
                "#e5efea",
                FIXTURE_SIZE[0] - 0.05,
                FIXTURE_SIZE[1] - 0.05,
                target,
            )
    # The shadow-casting spot over the hero bay.
    add_spot_light(
        "Office key spot",
        three_to_blender(6.0, 31.0, 10.0),
        three_to_blender(-8.0, -18.34, 2.0),
        320.0,
        "#e8f2ed",
        target,
        spot_size=1.1,
        blend=0.7,
        radius=0.25,
    )
    # The aisle-side return.
    add_area_light(
        "Office side return",
        three_to_blender(-40.0, 13.0, 24.0),
        three_to_blender(0.0, -5.0, -6.0),
        16.0,
        "#cbd9dc",
        units(30.0),
        units(42.0),
        target,
    )
    # The hero screen, coplanar with the glass.
    add_area_light(
        "Screen key",
        three_to_blender(0, 0, 0.02),
        three_to_blender(0, 0, 40),
        1.4,
        "#ffe4a8",
        0.520,
        0.2925,
        target,
    )


def configure_scene(scene: bpy.types.Scene) -> None:
    # The office's exposure preset is 1.08 against the home's 1.3, and its
    # environment is a bright office PMREM at 0.5 plus a 0.12 hemisphere.
    configure_eevee(
        scene,
        filepath=RENDER_DIR / "office-wide.png",
        world_color=(0.62, 0.68, 0.66, 1.0),
        world_strength=0.16,
        exposure=0.18,
        samples=64,
    )


def main() -> None:
    clean_scene()
    export = collection("OFFICE_EXPORT")
    lookdev = collection("LOOKDEV_ONLY")
    sources = collection("SOURCES")
    cameras = collection("CAMERAS")
    lights = collection("LIGHTS")
    sources.hide_render = True
    mats = build_materials()

    build_shell(export, mats)
    build_ceiling_system(export, mats)
    build_partitions(export, mats)
    build_workstations(export, lookdev, sources, mats)
    build_hero_props(export, mats)
    build_aisle_end(export, mats)
    build_lookdev_monitor(lookdev, mats)
    build_lighting(lights)

    wide_camera = deck_camera("Cubicle wide camera", (-24.0, 4.0, 118.0), (8.0, -2.0, -50.0), cameras)
    return_camera = deck_camera("Return cubicle camera", (-20.0, 3.5, 76.0), (6.0, -1.5, -26.0), cameras)
    bay_camera = make_camera(
        "Bay review camera",
        (-0.55, units(50.0), 0.35),
        (1.6, units(100.0), -0.25),
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

    render_still(scene, wide_camera, RENDER_DIR / "office-wide.png")
    render_still(scene, return_camera, RENDER_DIR / "office-return.png")
    render_still(scene, bay_camera, RENDER_DIR / "office-bay.png")

    scene.camera = wide_camera
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"OFFICE_BLEND={BLEND_PATH}")
    print(f"OFFICE_RENDERS={RENDER_DIR}")
    print(f"OFFICE_AGENT_SCREENS={json.dumps(AGENT_SCREENS)}")


if __name__ == "__main__":
    main()
