#!/usr/bin/env python3
"""Build the cinematic home-office source scene for The True Cost of AI Coding.

The scene is authored at true metric scale in Blender. The live talk uses a
520 mm glass width as 16 Three.js scene units, so exported metric assets are
scaled by 30.7692307692 at the R3F boundary.

Run:
    blender --background --factory-startup --python blender/home-office/build_scene.py

The script saves ``home-office.blend`` beside itself and writes look-development
renders under ``quality-artifacts/blender-home/lookdev``.

Primitives, materials, imports, seating, lights, cameras and the desk props
(keyboard, mouse, mug) come from ``blender/lib``; this file is the home room
itself.
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.deskprops import KEYBOARD_DEPTH, build_keyboard, build_mouse, build_mug  # noqa: E402
from lib.setkit import (  # noqa: E402
    METRES_PER_SCENE_UNIT,
    SCENE_UNITS_PER_METRE,
    add_area_light,
    add_box,
    add_curve,
    add_cylinder,
    aim_at,
    clean_scene,
    collection,
    import_glb,
    import_glb_group,
    make_camera,
    mapped_surface_material,
    move_to_collection,
    pbr_image_material,
    principled_material,
    rgba,
    seat_on,
    set_input,
    textured_material,
    three_to_blender,
    world_bounds,
)

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "public" / "models"
ASSET_DIR = SOURCE_DIR / "assets"
RENDER_DIR = ROOT / "quality-artifacts" / "blender-home" / "lookdev"
BLEND_PATH = SOURCE_DIR / "home-office.blend"
FLOOR_Z = -34.34 * METRES_PER_SCENE_UNIT
CEILING_Z = 42.0 * METRES_PER_SCENE_UNIT
DESK_TOP_Z = -8.34 * METRES_PER_SCENE_UNIT
# The wool desk mat (build_desk) is 6 mm thick and sits 1 mm proud of the top;
# anything on the mat is seated here, not on the desk.
DESK_MAT_TOP_Z = DESK_TOP_Z + 0.007
BACK_WALL_Y = 64.0 * METRES_PER_SCENE_UNIT
FRONT_Y = -35.0 * METRES_PER_SCENE_UNIT
ROOM_HALF_WIDTH = 78.0 * METRES_PER_SCENE_UNIT

random.seed(0x3A0F11CE)


def build_floor(target: bpy.types.Collection, material: bpy.types.Material) -> None:
    width = ROOM_HALF_WIDTH * 2
    depth = BACK_WALL_Y - FRONT_Y
    add_box(
        "Dark oak plank floor",
        (width, depth, 0.04),
        (0, (FRONT_Y + BACK_WALL_Y) / 2, FLOOR_Z - 0.0215),
        material,
        target,
        bevel=0.002,
        segments=2,
    )


def build_architecture(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    wall_thickness = 0.12
    wall_height = CEILING_Z - FLOOR_Z
    wall_mid = (CEILING_Z + FLOOR_Z) / 2

    # Side walls and ceiling are complete physical returns rather than infinite planes.
    add_box(
        "Left wall",
        (wall_thickness, BACK_WALL_Y - FRONT_Y, wall_height),
        (-ROOM_HALF_WIDTH - wall_thickness / 2, (BACK_WALL_Y + FRONT_Y) / 2, wall_mid),
        mats["wall"],
        target,
        bevel=0.006,
    )
    add_box(
        "Right wall",
        (wall_thickness, BACK_WALL_Y - FRONT_Y, wall_height),
        (ROOM_HALF_WIDTH + wall_thickness / 2, (BACK_WALL_Y + FRONT_Y) / 2, wall_mid),
        mats["wall"],
        target,
        bevel=0.006,
    )
    add_box(
        "Ceiling",
        (ROOM_HALF_WIDTH * 2 + wall_thickness * 2, BACK_WALL_Y - FRONT_Y, 0.09),
        (0, (BACK_WALL_Y + FRONT_Y) / 2, CEILING_Z + 0.045),
        mats["ceiling"],
        target,
        bevel=0.004,
    )

    door_cx, door_w = -1.67, 0.86
    door_left, door_right = door_cx - door_w / 2, door_cx + door_w / 2
    door_top = FLOOR_Z + 2.08
    window_cx, window_w = 1.36, 1.24
    window_left, window_right = window_cx - window_w / 2, window_cx + window_w / 2
    window_bottom, window_top = FLOOR_Z + 0.88, FLOOR_Z + 2.08

    spans = [
        (-ROOM_HALF_WIDTH, door_left, FLOOR_Z, CEILING_Z),
        (door_right, window_left, FLOOR_Z, CEILING_Z),
        (window_right, ROOM_HALF_WIDTH, FLOOR_Z, CEILING_Z),
        (door_left, door_right, door_top, CEILING_Z),
        (window_left, window_right, FLOOR_Z, window_bottom),
        (window_left, window_right, window_top, CEILING_Z),
    ]
    for index, (left, right, bottom, top) in enumerate(spans):
        add_box(
            f"Back wall {index + 1}",
            (right - left, wall_thickness, top - bottom),
            ((left + right) / 2, BACK_WALL_Y + wall_thickness / 2, (bottom + top) / 2),
            mats["wall"],
            target,
            bevel=0.004,
        )

    # Doorway casing and a finite hall beyond it create a real third depth plane.
    trim = 0.055
    for x in (door_left, door_right):
        add_box(
            "Door casing",
            (trim, 0.09, door_top - FLOOR_Z + 0.08),
            (x, BACK_WALL_Y - 0.045, (door_top + FLOOR_Z) / 2),
            mats["trim"],
            target,
            bevel=0.006,
        )
    add_box(
        "Door casing header",
        (door_w + trim * 2, 0.09, trim),
        (door_cx, BACK_WALL_Y - 0.045, door_top),
        mats["trim"],
        target,
        bevel=0.006,
    )
    hall_y = BACK_WALL_Y + 0.82
    add_box(
        "Hall termination",
        (door_w, 0.08, door_top - FLOOR_Z),
        (door_cx, hall_y, (door_top + FLOOR_Z) / 2),
        mats["hall"],
        target,
    )
    for x in (door_left - 0.035, door_right + 0.035):
        add_box(
            "Hall return",
            (0.07, hall_y - BACK_WALL_Y, door_top - FLOOR_Z),
            (x, (hall_y + BACK_WALL_Y) / 2, (door_top + FLOOR_Z) / 2),
            mats["hall"],
            target,
        )
    add_box(
        "Hall floor",
        (door_w, hall_y - BACK_WALL_Y, 0.025),
        (door_cx, (hall_y + BACK_WALL_Y) / 2, FLOOR_Z),
        mats["hall_floor"],
        target,
    )
    # An almost-closed door turns the hall illumination into a narrow, motivated
    # spill instead of the first pass's abstract full-height white wedge.
    add_box(
        "Partly open door",
        (door_w - 0.08, 0.045, door_top - FLOOR_Z - 0.07),
        (door_cx - 0.10, BACK_WALL_Y - 0.02, (door_top + FLOOR_Z) / 2),
        mats["door"],
        target,
        rotation=(0, 0, math.radians(-7)),
        bevel=0.009,
        segments=4,
    )
    add_cylinder(
        "Door handle",
        0.018,
        0.075,
        (door_cx + 0.24, BACK_WALL_Y - 0.075, FLOOR_Z + 1.02),
        mats["chrome"],
        target,
        rotation=(math.pi / 2, 0, 0),
        vertices=32,
        bevel=0.003,
    )

    # Deep window reveal, mullions, glass, and a partially lowered linen blind.
    add_box(
        "Night window",
        (window_w - 0.07, 0.025, window_top - window_bottom - 0.07),
        (window_cx, BACK_WALL_Y + 0.075, (window_top + window_bottom) / 2),
        mats["glass"],
        target,
    )
    for x in (window_left, window_right, window_cx):
        width = 0.052 if x != window_cx else 0.035
        add_box(
            "Window vertical frame",
            (width, 0.115, window_top - window_bottom + 0.08),
            (x, BACK_WALL_Y - 0.015, (window_top + window_bottom) / 2),
            mats["window_frame"],
            target,
            bevel=0.004,
        )
    for z in (window_bottom, window_top, (window_top + window_bottom) / 2):
        add_box(
            "Window horizontal frame",
            (window_w + 0.08, 0.115, 0.052),
            (window_cx, BACK_WALL_Y - 0.015, z),
            mats["window_frame"],
            target,
            bevel=0.004,
        )
    add_box(
        "Roller blind",
        (window_w - 0.09, 0.018, 0.63),
        (window_cx, BACK_WALL_Y - 0.085, window_top - 0.315),
        mats["blind"],
        target,
        bevel=0.003,
    )
    add_cylinder(
        "Blind lower bar",
        0.012,
        window_w - 0.08,
        (window_cx, BACK_WALL_Y - 0.11, window_top - 0.64),
        mats["window_frame"],
        target,
        rotation=(0, math.pi / 2, 0),
        vertices=32,
    )

    # Continuous baseboards establish contact and scale. The back one stops
    # either side of the acoustic panel, which runs floor to ceiling in front
    # of the wall.
    base_z = FLOOR_Z + 0.045
    panel_left, panel_right = -0.77, 0.81
    for x0, x1 in ((-ROOM_HALF_WIDTH, panel_left), (panel_right, ROOM_HALF_WIDTH)):
        add_box(
            "Back baseboard",
            (x1 - x0, 0.026, 0.09),
            ((x0 + x1) / 2, BACK_WALL_Y - 0.07, base_z),
            mats["trim"],
            target,
            bevel=0.004,
        )
    for x in (-ROOM_HALF_WIDTH + 0.02, ROOM_HALF_WIDTH - 0.02):
        add_box(
            "Side baseboard",
            (0.026, BACK_WALL_Y - FRONT_Y, 0.09),
            (x, (BACK_WALL_Y + FRONT_Y) / 2, base_z),
            mats["trim"],
            target,
            bevel=0.004,
        )

    # Contemporary slatted acoustic field behind the monitor — floor to
    # ceiling, dark, not decorative glow.
    panel_y = BACK_WALL_Y - 0.072
    panel_bottom = FLOOR_Z - 0.002
    panel_top = CEILING_Z + 0.002
    panel_height = panel_top - panel_bottom
    panel_z = (panel_top + panel_bottom) / 2
    add_box(
        "Acoustic felt backing",
        (1.52, 0.025, panel_height),
        (0.02, panel_y + 0.018, panel_z),
        mats["felt"],
        target,
        bevel=0.006,
    )
    for index in range(19):
        x = -0.69 + index * 0.078
        add_box(
            f"Acoustic walnut slat {index + 1:02d}",
            (0.036, 0.035, panel_height - 0.012),
            (x, panel_y - 0.014, panel_z),
            mats["slat"],
            target,
            bevel=0.0035,
            segments=2,
        )

    # Two simple recessed downlights remain visibly switched off.
    for x in (-0.85, 0.85):
        add_cylinder(
            "Unlit ceiling aperture",
            0.062,
            0.018,
            (x, 0.45, CEILING_Z - 0.035),
            mats["black"],
            target,
            vertices=48,
        )


def build_desk(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    add_box(
        "Walnut desk top",
        (2.20, 0.95, 0.045),
        (0, 0.065, DESK_TOP_Z - 0.0225),
        mats["desk"],
        target,
        bevel=0.018,
        segments=5,
    )
    # Powder-coated trestles and rear stretcher are actual load-bearing construction.
    leg_x = 0.88
    for side in (-1, 1):
        x = side * leg_x
        add_box(
            "Desk leg upright",
            (0.055, 0.055, DESK_TOP_Z - FLOOR_Z - 0.08),
            (x, 0.15, FLOOR_Z + (DESK_TOP_Z - FLOOR_Z) / 2),
            mats["steel"],
            target,
            bevel=0.006,
        )
        add_box(
            "Desk leg foot",
            (0.54, 0.065, 0.045),
            (x, 0.15, FLOOR_Z + 0.024),
            mats["steel"],
            target,
            bevel=0.012,
        )
    add_box(
        "Desk rear stretcher",
        (1.82, 0.045, 0.065),
        (0, 0.42, FLOOR_Z + 0.30),
        mats["steel"],
        target,
        bevel=0.006,
    )
    add_box(
        "Cable tray",
        (1.32, 0.16, 0.055),
        (0.05, 0.38, DESK_TOP_Z - 0.12),
        mats["steel"],
        target,
        bevel=0.008,
    )
    add_box(
        "Desk mat",
        (1.18, 0.48, 0.006),
        (0.12, -0.13, DESK_TOP_Z + 0.004),
        mats["desk_mat"],
        target,
        bevel=0.018,
        segments=5,
    )

    # Low right-side credenza is background furniture, not an isolated prop.
    # Held off the back wall far enough that the plant on it clears the wall.
    credenza_x, credenza_y = 1.76, 1.57
    add_box(
        "Credenza carcass",
        (1.20, 0.36, 0.54),
        (credenza_x, credenza_y, FLOOR_Z + 0.31),
        mats["credenza"],
        target,
        bevel=0.014,
        segments=4,
    )
    for index in range(3):
        x = credenza_x - 0.38 + index * 0.38
        add_box(
            "Credenza door",
            (0.355, 0.018, 0.43),
            (x, credenza_y - 0.19, FLOOR_Z + 0.32),
            mats["credenza_front"],
            target,
            bevel=0.008,
        )
        add_box(
            "Credenza pull",
            (0.075, 0.018, 0.012),
            (x, credenza_y - 0.207, FLOOR_Z + 0.48),
            mats["steel"],
            target,
            bevel=0.004,
        )
    for x in (credenza_x - 0.48, credenza_x + 0.48):
        add_cylinder(
            "Credenza leg",
            0.018,
            0.10,
            (x, credenza_y, FLOOR_Z + 0.05),
            mats["steel"],
            target,
            vertices=24,
        )


def build_shelving(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # Side-wall bookcase catches the oblique return camera and supplies a near edge.
    x = ROOM_HALF_WIDTH - 0.23
    add_box(
        "Side bookcase back",
        (0.035, 1.05, 1.72),
        (x + 0.10, 0.92, FLOOR_Z + 0.95),
        mats["bookcase"],
        target,
        bevel=0.006,
    )
    for z in (FLOOR_Z + 0.12, FLOOR_Z + 0.54, FLOOR_Z + 0.96, FLOOR_Z + 1.38, FLOOR_Z + 1.78):
        add_box(
            "Bookcase shelf",
            (0.42, 1.05, 0.035),
            (x, 0.92, z),
            mats["bookcase"],
            target,
            bevel=0.005,
        )
    for y in (0.405, 1.435):
        add_box(
            "Bookcase side",
            (0.035, 0.035, 1.69),
            (x, y, FLOOR_Z + 0.95),
            mats["bookcase"],
            target,
            bevel=0.005,
        )

    muted_book_mats = [mats["book_warm"], mats["book_cool"], mats["book_paper"]]
    # Books stand upright and packed: a lean about the wrong axis lifted one
    # bottom edge off the shelf, which reads as a modelling error, not a book.
    for shelf in range(4):
        cursor = 0.47
        count = (5, 7, 4, 6)[shelf]
        shelf_top = FLOOR_Z + 0.12 + shelf * 0.42 + 0.0175
        for index in range(count):
            width = random.uniform(0.025, 0.055)
            height = random.uniform(0.19, 0.31)
            add_box(
                f"Book {shelf + 1:02d}-{index + 1:02d}",
                (0.20, width, height),
                (x - 0.03, cursor + width / 2, shelf_top + 0.001 + height / 2),
                muted_book_mats[(shelf + index) % len(muted_book_mats)],
                target,
                bevel=0.003,
                segments=2,
            )
            cursor += width + 0.005

    # Floating shelves on the back wall hold a sparse, believable history. They
    # fit the wall between the door casing and the acoustic panel; the books
    # stand ON the lower shelf, packed from its left end and set back from its
    # front edge, and the upper shelf clears the tallest of them.
    # Low enough that the books are in frame on the reveal and boundaries
    # cameras rather than cut by the top of it.
    shelf_y = BACK_WALL_Y - 0.14
    lower_shelf_z = FLOOR_Z + 1.63
    upper_shelf_z = FLOOR_Z + 1.95
    for z in (lower_shelf_z, upper_shelf_z):
        add_box(
            "Floating walnut shelf",
            (0.40, 0.17, 0.035),
            (-0.97, shelf_y, z),
            mats["slat"],
            target,
            bevel=0.007,
        )
    cursor = -1.15
    for index in range(7):
        width = random.uniform(0.026, 0.047)
        height = random.uniform(0.16, 0.23)
        add_box(
            f"Shelf book {index + 1:02d}",
            (width, 0.13, height),
            (cursor + width / 2, shelf_y + 0.01, lower_shelf_z + 0.0175 + 0.001 + height / 2),
            muted_book_mats[index % len(muted_book_mats)],
            target,
            bevel=0.003,
            segments=2,
        )
        cursor += width + 0.004


def build_plant(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    pot_x, pot_y = 1.76, 1.46
    add_cylinder(
        "Plant pot",
        0.145,
        0.29,
        (pot_x, pot_y, FLOOR_Z + 0.15),
        mats["pot"],
        target,
        vertices=64,
        bevel=0.008,
    )
    branch_points = [
        [(pot_x, pot_y, FLOOR_Z + 0.28), (pot_x - 0.08, pot_y, FLOOR_Z + 0.78), (pot_x - 0.20, pot_y + 0.02, FLOOR_Z + 1.22)],
        [(pot_x, pot_y, FLOOR_Z + 0.28), (pot_x + 0.09, pot_y, FLOOR_Z + 0.86), (pot_x + 0.22, pot_y - 0.03, FLOOR_Z + 1.35)],
        [(pot_x, pot_y, FLOOR_Z + 0.31), (pot_x + 0.02, pot_y, FLOOR_Z + 0.94), (pot_x - 0.02, pot_y + 0.02, FLOOR_Z + 1.52)],
    ]
    for index, points in enumerate(branch_points):
        add_curve(f"Plant branch {index + 1}", points, 0.011, mats["stem"], target)
    for index in range(34):
        height = FLOOR_Z + random.uniform(0.58, 1.50)
        angle = random.uniform(0, math.tau)
        radius = random.uniform(0.08, 0.34)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        leaf = bpy.context.object
        leaf.name = f"Plant leaf {index + 1:02d}"
        leaf.location = (
            pot_x + math.cos(angle) * radius,
            pot_y + math.sin(angle) * radius * 0.35,
            height,
        )
        leaf.scale = (random.uniform(0.055, 0.10), random.uniform(0.018, 0.032), random.uniform(0.11, 0.18))
        leaf.rotation_euler = (random.uniform(-0.35, 0.35), random.uniform(-0.45, 0.45), angle)
        leaf.data.materials.append(mats["leaf_a"] if index % 3 else mats["leaf_b"])
        move_to_collection(leaf, target)


def build_chair(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # Reuse the approved production task-chair silhouette rather than dressing up
    # a stack of rounded boxes. Blender owns the broad upholstery/frame/metal
    # separation that the original UV-less CAD export could not carry itself.
    # Pushed back from the desk's front edge: any closer and the backrest
    # passes through the top.
    imported = import_glb(
        MODEL_DIR / "office-chair.glb",
        "Home task chair",
        target,
        location=(-0.98, -0.80, FLOOR_Z),
        rotation=(-math.pi / 2, 0, math.radians(8)),
    )
    for obj in imported:
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)
        obj.data.materials.clear()
        for material in (mats["chair_fabric"], mats["chair_frame"], mats["chrome"]):
            obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            center = polygon.center
            radial = math.hypot(center.x, center.y)
            polygon.material_index = 0 if center.z > 0.43 else 2 if 0.18 < center.z < 0.42 and radial < 0.075 else 1


def build_props(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # Centred under the glass, which also keeps it clear of the binder.
    build_keyboard(
        target,
        mats,
        location=(0.0, -0.235 - KEYBOARD_DEPTH / 2, DESK_MAT_TOP_Z),
        rotation=(math.radians(4.5), 0, math.radians(-1.5)),
    )
    # Every imported prop is seated on the measured surface it stands on (see
    # seat_on): the stationery set's origin sat 26 mm below its own base,
    # which sank its pencil cup into the desk.
    build_mouse(target, mats, (0.52, -0.24, DESK_MAT_TOP_Z), math.radians(172), desk_top_z=DESK_TOP_Z)
    build_mug(target, mats, (0.83, 0.01, DESK_TOP_Z), math.radians(18))
    # The notebook and the lamp are Poly Haven (CC0) models in place of the
    # CAD parts, which read as extruded blocks at any distance. The binder
    # keeps its leather and paper maps; the lamp is exported as the dark
    # painted metal the old lamp was, because its stock orange enamel would be
    # the one saturated colour in an amber room.
    # On the mat, left of the keyboard, seated on the mat's top.
    binder = import_glb_group(
        ASSET_DIR / "binder_notebook" / "binder_notebook_1k.gltf",
        "Binder notebook",
        target,
        location=(-0.695, -0.18, DESK_MAT_TOP_Z),
        rotation=(0, 0, math.radians(-11)),
    )
    # The asset ships a closed and an open copy on top of each other; a desk
    # gets the closed one.
    open_copies = [obj for obj in binder if obj.type == "MESH" and "closed" not in obj.name]
    binder = [obj for obj in binder if obj not in open_copies]
    for obj in open_copies:
        bpy.data.objects.remove(obj, do_unlink=True)
    seat_on(binder, DESK_MAT_TOP_Z)
    # The lamp's own mount is a 4 cm stem, so it stands on a weighted disc;
    # yawed so the head reaches over the desk toward the keyboard rather than
    # the wall (measured: at −110° the head sits 13 cm toward +x of the base).
    lamp_x, lamp_y = -0.97, 0.20
    add_cylinder(
        "Lamp base weight",
        0.085,
        0.014,
        (lamp_x, lamp_y, DESK_TOP_Z + 0.007),
        mats["lamp"],
        target,
        vertices=64,
        bevel=0.003,
    )
    lamp = import_glb_group(
        ASSET_DIR / "desk_lamp_arm_01" / "desk_lamp_arm_01_1k.gltf",
        "Arm lamp",
        target,
        location=(lamp_x, lamp_y, DESK_TOP_Z),
        rotation=(0, 0, math.radians(-110)),
    )
    seat_on(lamp, DESK_TOP_Z + 0.014)
    for obj in lamp:
        if obj.type != "MESH":
            continue
        for material in obj.data.materials:
            if material is None:
                continue
            material["export_base_color"] = rgba("#36413f")
            material["export_roughness"] = 0.36
            material["export_metallic"] = 0.56
            # The asset ships with its bulb lit. At 3am the monitor is the only
            # light in the room, so the lamp is off.
            bsdf = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
            if bsdf is not None:
                strength = bsdf.inputs.get("Emission Strength")
                if strength is not None:
                    for link in list(strength.links):
                        material.node_tree.links.remove(link)
                    strength.default_value = 0.0
    # Contemporary details: phone face-down, pencil, and a small interface box.
    add_box(
        "Phone face down",
        (0.075, 0.155, 0.009),
        (0.94, -0.31, DESK_TOP_Z + 0.011),
        mats["phone"],
        target,
        rotation=(0, 0, math.radians(12)),
        bevel=0.012,
        segments=5,
    )
    # The set is Blender-authored and imports upright; the 90° roll it used to
    # be given laid the cup on its side with its mouth toward the camera.
    stationery = import_glb_group(
        ASSET_DIR / "stationery_supplies.glb",
        "Poly Haven stationery",
        target,
        location=(-0.61, 0.15, DESK_TOP_Z),
        rotation=(0, 0, math.radians(-6)),
        scale=0.9,
    )
    # The set's pieces sit at different heights above its own origin (the
    # pencils 35 mm above the cup's base), so each one is seated on its own.
    for obj in stationery:
        if obj.type == "MESH":
            seat_on([obj], DESK_TOP_Z)
    # The pens and pencils stand in the cup, which is what the cup is for;
    # loose on the desk beside an empty cup, the cup read as a stray mug. Each
    # is measured, reparented to the world, stood on its long axis with a
    # small lean, ringed inside the cup, and its point set on the cup's floor.
    # The eraser stays on the desk.
    bpy.context.view_layer.update()
    cup = next(obj for obj in stationery if obj.type == "MESH" and obj.name.endswith("pencilcup"))
    cup_box = world_bounds(cup)
    cup_centre = Vector(((cup_box[0] + cup_box[1]) / 2, (cup_box[2] + cup_box[3]) / 2, 0.0))
    cup_floor = cup_box[4] + 0.006
    writing = [
        obj
        for obj in stationery
        if obj.type == "MESH" and ("pen" in obj.name or "pencil" in obj.name) and "cup" not in obj.name
    ]
    for index, obj in enumerate(writing):
        placed = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = placed
        bpy.context.view_layer.update()
        box = world_bounds(obj)
        centre = Vector(((box[0] + box[1]) / 2, (box[2] + box[3]) / 2, (box[4] + box[5]) / 2))
        extents = (box[1] - box[0], box[3] - box[2], box[5] - box[4])
        long_axis = extents.index(max(extents))
        upright = (
            Matrix.Rotation(math.radians(-90), 4, "Y")
            if long_axis == 0
            else Matrix.Rotation(math.radians(90), 4, "X")
            if long_axis == 1
            else Matrix.Identity(4)
        )
        angle = index * math.tau / len(writing)
        lean = Matrix.Rotation(
            math.radians(9), 4, Vector((math.cos(angle + math.pi / 2), math.sin(angle + math.pi / 2), 0.0))
        )
        obj.matrix_world = Matrix.Translation(cup_centre) @ lean @ upright @ Matrix.Translation(-centre) @ obj.matrix_world
        bpy.context.view_layer.update()
        box = world_bounds(obj)
        ring = Vector((math.cos(angle) * 0.013, math.sin(angle) * 0.013, cup_floor - box[4]))
        obj.matrix_world = Matrix.Translation(ring) @ obj.matrix_world
    add_box(
        "Audio interface",
        (0.19, 0.13, 0.045),
        (0.78, 0.29, DESK_TOP_Z + 0.024),
        mats["interface"],
        target,
        rotation=(0, 0, math.radians(-3)),
        bevel=0.012,
        segments=4,
    )
    for index in range(2):
        add_cylinder(
            f"Interface knob {index + 1}",
            0.018 if index == 0 else 0.012,
            0.012,
            (0.73 + index * 0.065, 0.22, DESK_TOP_Z + 0.056),
            mats["black"],
            target,
            rotation=(math.pi / 2, 0, 0),
            vertices=32,
        )

    add_curve(
        "Monitor power cable",
        [
            (0.20, 0.20, DESK_TOP_Z + 0.33),
            (0.31, 0.38, DESK_TOP_Z + 0.02),
            (0.48, 0.43, DESK_TOP_Z - 0.20),
            (0.52, 0.46, FLOOR_Z + 0.12),
        ],
        0.006,
        mats["rubber"],
        target,
    )


def build_lookdev_monitor(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    import_glb(
        MODEL_DIR / "crt-monitor.glb",
        "Hero CRT proxy",
        target,
        location=(0.0, -0.010, 0.017),
        material=mats["crt"],
    )
    # Placeholder glass and terminal marks exist only for Blender lighting and
    # rendering. They sit where the live glass does: inside the pocket, 2 mm
    # behind the deck's screen plane, not proud of the fascia.
    add_box(
        "Lookdev glass",
        (0.520, 0.008, 0.2925),
        (0, -0.004, 0),
        mats["screen_black"],
        target,
        bevel=0.020,
        segments=8,
    )
    amber = mats["screen_amber"]
    dim = mats["screen_dim"]
    # A restrained facsimile of the held chart supplies realistic emissive distribution.
    add_box("Screen title", (0.21, 0.002, 0.009), (-0.115, -0.0095, 0.092), amber, target, bevel=0.001)
    add_box("Screen subtitle", (0.15, 0.002, 0.004), (-0.145, -0.0095, 0.072), dim, target, bevel=0.001)
    for row, (width, z) in enumerate(((0.19, 0.022), (0.075, -0.055))):
        add_box(f"Screen label {row}", (0.12, 0.002, 0.004), (-0.145, -0.0095, z), dim, target, bevel=0.001)
        add_box(f"Screen bar {row}", (width, 0.002, 0.013), (0.055 - (0.19 - width) / 2, -0.0095, z), amber, target, bevel=0.002)
    for index in range(5):
        x = -0.03 + index * 0.047
        add_box(f"Screen grid {index}", (0.0015, 0.002, 0.13), (x, -0.0090, -0.002), dim, target)


def build_lighting(target: bpy.types.Collection) -> None:
    """The deck's home rig, not a lookdev invention.

    Every source here is one of the five in `src/scene/Scene.jsx` at the
    same place, size, colour and aim, so a render from this file predicts
    what the talk shows. Powers were calibrated by rendering the boundaries
    camera against the deck's own boundaries capture (2026-09-02). The old
    rig had a 48 W key 5 cm from the glass and three returns the deck does
    not have; under it every dark shell rendered beige.
    """
    # The screen itself: a rectangle the size of the glass, coplanar with it.
    add_area_light(
        "Screen key",
        three_to_blender(0, 0, 0.02),
        three_to_blender(0, 0, 40),
        32.0,
        "#ffe4a8",
        0.520,
        0.2925,
        target,
    )
    fill = bpy.data.lights.new("Local fill", "POINT")
    fill.energy = 1.2
    fill.color = rgba("#ffdf9e")[:3]
    fill.shadow_soft_size = 0.03
    fill_object = bpy.data.objects.new("Local fill", fill)
    target.objects.link(fill_object)
    fill_object.location = three_to_blender(0, 0.4, 1.15)
    # The doorway: a cold spot raking across the room; the only caster.
    doorway = bpy.data.lights.new("Doorway", "SPOT")
    doorway.energy = 420.0
    doorway.color = rgba("#b3c0bd")[:3]
    doorway.spot_size = 1.24
    doorway.spot_blend = 0.85
    doorway.shadow_soft_size = 0.08
    doorway_object = bpy.data.objects.new("Doorway", doorway)
    target.objects.link(doorway_object)
    doorway_object.location = three_to_blender(-46, 40, -30)
    aim_at(doorway_object, three_to_blender(4, -8.34, 4))
    add_area_light(
        "Opposite rim",
        three_to_blender(34, 17, -18),
        three_to_blender(2, -2, -5),
        10.0,
        "#909b98",
        18 * METRES_PER_SCENE_UNIT,
        28 * METRES_PER_SCENE_UNIT,
        target,
    )
    add_area_light(
        "Back wall",
        three_to_blender(-8, 10, -44),
        three_to_blender(-8, 10, -62),
        14.0,
        "#6c7671",
        50 * METRES_PER_SCENE_UNIT,
        32 * METRES_PER_SCENE_UNIT,
        target,
    )


def build_materials() -> dict[str, bpy.types.Material]:
    texture_root = ROOT / "public" / "textures"
    plaster = texture_root / "painted-plaster"
    linen = texture_root / "rough-linen"
    wood = texture_root / "wood-table"
    materials = {
        "wall": mapped_surface_material("Warm mineral paint", "#3d4540", 0.92, plaster, repeats=(3.8, 2.2, 1.0), normal_strength=0.42),
        "ceiling": mapped_surface_material("Ceiling mineral paint", "#3c433f", 0.96, plaster, repeats=(4.6, 2.8, 1.0), normal_strength=0.30),
        "hall": mapped_surface_material("Hall wall", "#313836", 0.93, plaster, repeats=(2.2, 2.2, 1.0), normal_strength=0.36),
        "hall_floor": principled_material("Hall floor", "#242927", 0.86),
        "trim": principled_material("Painted trim", "#59615c", 0.58, coat=0.10),
        "door": mapped_surface_material("Smoked oak door", "#594334", 0.58, wood, repeats=(1.2, 2.6, 1.0), normal_strength=0.38),
        "glass": principled_material("Night glass", "#071013", 0.19, metallic=0.04, coat=0.32),
        "window_frame": principled_material("Window frame", "#202623", 0.42, metallic=0.28),
        "blind": mapped_surface_material("Linen blind", "#8a887f", 0.97, linen, repeats=(3.4, 1.2, 1.0), normal_strength=0.24, use_diffuse=True),
        "felt": mapped_surface_material("Acoustic felt", "#171a18", 0.99, linen, repeats=(5.0, 4.0, 1.0), normal_strength=0.28),
        "slat": mapped_surface_material("Smoked walnut slats", "#5b3e2b", 0.60, wood, repeats=(0.55, 5.0, 1.0), normal_strength=0.34),
        "desk": mapped_surface_material("Oiled black walnut", "#76513a", 0.46, wood, repeats=(1.15, 0.58, 1.0), normal_strength=0.42, use_diffuse=True, coat=0.08),
        "steel": principled_material("Powder coated steel", "#1f2524", 0.39, metallic=0.58),
        "black": principled_material("Dead black", "#080b0a", 0.84),
        "desk_mat": mapped_surface_material("Wool desk mat", "#171b18", 0.98, linen, repeats=(4.0, 2.0, 1.0), normal_strength=0.26),
        "credenza": mapped_surface_material("Credenza walnut", "#60432f", 0.55, wood, repeats=(1.8, 1.0, 1.0), normal_strength=0.32),
        "credenza_front": principled_material("Credenza lacquer", "#303633", 0.48, coat=0.12),
        "bookcase": principled_material("Bookcase charcoal", "#262c29", 0.73),
        "book_warm": principled_material("Muted ochre book", "#6d5d45", 0.86),
        "book_cool": principled_material("Muted slate book", "#465654", 0.88),
        "book_paper": principled_material("Bone book", "#8d887a", 0.92),
        "pot": principled_material("Stoneware pot", "#70685b", 0.76, coat=0.08),
        "stem": principled_material("Plant stem", "#29352c", 0.88),
        "leaf_a": textured_material("Plant leaf dark", "#1e2d24", "#33483a", 0.78, scale=8.0, detail=3.0, bump_strength=0.06, bump_distance=0.001),
        "leaf_b": principled_material("Plant leaf light", "#35483a", 0.74, coat=0.04),
        "chair_frame": principled_material("Chair frame", "#171c1c", 0.39, metallic=0.38),
        "chair_fabric": textured_material("Chair wool", "#3b3b37", "#54544e", 0.96, scale=115.0, detail=2.0, bump_strength=0.10, bump_distance=0.0013),
        "chrome": principled_material("Chair mechanism", "#646d6b", 0.25, metallic=0.92),
        "rubber": principled_material("Soft rubber", "#111514", 0.82),
        "keyboard": principled_material("Keyboard case", "#242a28", 0.54, coat=0.08),
        "keycap": textured_material("PBT keycaps", "#303530", "#555b52", 0.72, scale=140.0, detail=2.0, bump_strength=0.04, bump_distance=0.0005),
        # Two-tone set: the modifiers and the spacebar sit a rung darker than
        # the alphas, which is most of what makes a keyboard read at a glance.
        "keycap_mod": principled_material("PBT modifier keycaps", "#1e2224", 0.7),
        "keyboard_plate": principled_material("Keyboard plate", "#0b0d0d", 0.8),
        # Matte and dark: under the screen key a satin shell was one broad
        # highlight and read as an egg.
        "mouse": principled_material("Mouse shell", "#2b302d", 0.62, coat=0.10),
        "ceramic": principled_material("Bone ceramic", "#a39a86", 0.29, coat=0.56),
        "coffee": principled_material("Black coffee", "#120a04", 0.12, coat=0.4),
        "leather": textured_material("Worn leather", "#554335", "#79624e", 0.59, scale=18.0, detail=6.0, bump_strength=0.12, bump_distance=0.0015),
        "lamp": principled_material("Lamp painted metal", "#36413f", 0.36, metallic=0.56),
        "phone": principled_material("Phone graphite", "#181d1c", 0.28, metallic=0.52, coat=0.26),
        "pencil": principled_material("Pencil cedar", "#9b7a49", 0.72),
        "interface": principled_material("Audio interface", "#45504e", 0.31, metallic=0.72),
        "crt": textured_material("CRT graphite ABS", "#111514", "#272c29", 0.61, scale=52.0, detail=3.0, bump_strength=0.035, bump_distance=0.0007, metallic=0.012),
        "screen_black": principled_material("CRT glass black", "#050705", 0.34, coat=0.06, emission="#090b07", emission_strength=0.16),
        "screen_amber": principled_material("Amber phosphor hot", "#ffd54a", 0.34, emission="#ffd54a", emission_strength=6.0),
        "screen_dim": principled_material("Amber phosphor dim", "#8f6c22", 0.44, emission="#b68a2c", emission_strength=2.2),
    }
    set_input(
        materials["screen_black"].node_tree.nodes.get("Principled BSDF"),
        "Specular IOR Level",
        0.10,
    )
    materials["glass"].surface_render_method = "DITHERED"
    return materials


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 128
    scene.eevee.use_raytracing = True
    scene.eevee.shadow_ray_count = 4
    scene.eevee.shadow_step_count = 8
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True

    # A faint cool wash standing in for the deck's dark-room environment map,
    # which is what keeps its shadows from going to absolute black.
    scene.world.color = rgba("#030403")[:3]
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.55, 0.62, 0.62, 1.0)
    background.inputs["Strength"].default_value = 0.035

    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.45
    scene.view_settings.gamma = 1.0
    scene.camera.data.lens = scene.camera.data.lens

    scene.render.use_stamp = False
    scene.render.filepath = str(RENDER_DIR / "home-office-reveal.png")


def main() -> None:
    clean_scene()
    export = collection("HOME_EXPORT")
    lookdev = collection("LOOKDEV_ONLY")
    cameras = collection("CAMERAS")
    lights = collection("LIGHTS")
    mats = build_materials()

    floor_material = pbr_image_material(
        "Poly Haven dark wooden planks",
        ASSET_DIR / "textures" / "dark-wooden-planks",
        repeats=(1.25, 2.2, 1.0),
        normal_strength=0.62,
    )

    build_floor(export, floor_material)
    build_architecture(export, mats)
    build_desk(export, mats)
    build_shelving(export, mats)
    # On the credenza, seated on its top, and scaled so its leaves clear the
    # back wall and the window frame (at full size they ran 16 cm into both).
    seat_on(
        import_glb_group(
            ASSET_DIR / "potted_plant_02.glb",
            "Poly Haven potted plant",
            export,
            location=(1.76, 1.56, FLOOR_Z + 0.59),
            rotation=(0, 0, math.radians(-18)),
            scale=0.78,
        ),
        FLOOR_Z + 0.58,
    )
    build_chair(export, mats)
    build_props(export, mats)
    build_lookdev_monitor(lookdev, mats)
    build_lighting(lights)

    reveal_camera = make_camera(
        "Reveal camera",
        (0.0, -44.0 * METRES_PER_SCENE_UNIT, 2.5 * METRES_PER_SCENE_UNIT),
        (0.0, 0.0, -0.5 * METRES_PER_SCENE_UNIT),
        cameras,
    )
    boundaries_camera = make_camera(
        "Boundaries camera",
        (15.0 * METRES_PER_SCENE_UNIT, -46.0 * METRES_PER_SCENE_UNIT, 3.0 * METRES_PER_SCENE_UNIT),
        (-2.0 * METRES_PER_SCENE_UNIT, 2.0 * METRES_PER_SCENE_UNIT, -1.0 * METRES_PER_SCENE_UNIT),
        cameras,
    )
    room_camera = make_camera(
        "Room review camera",
        (1.75, -3.15, 0.28),
        (0.0, 0.38, -0.22),
        cameras,
        fov_degrees=40.0,
    )

    scene = bpy.context.scene
    scene.camera = reveal_camera
    configure_scene()
    scene["r3f_scene_units_per_metre"] = SCENE_UNITS_PER_METRE
    scene["live_glass_width_m"] = 0.520
    scene["live_glass_height_m"] = 0.2925
    scene["coordinate_contract"] = "Blender X -> Three X; Blender Z -> Three Y; Blender -Y -> Three Z"

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    scene.render.filepath = str(RENDER_DIR / "home-office-reveal.png")
    scene.camera = reveal_camera
    bpy.ops.render.render(write_still=True)

    scene.render.filepath = str(RENDER_DIR / "home-office-boundaries.png")
    scene.camera = boundaries_camera
    bpy.ops.render.render(write_still=True)

    scene.render.filepath = str(RENDER_DIR / "home-office-room.png")
    scene.camera = room_camera
    bpy.ops.render.render(write_still=True)

    scene.camera = reveal_camera
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"HOME_OFFICE_BLEND={BLEND_PATH}")
    print(f"HOME_OFFICE_RENDERS={RENDER_DIR}")


if __name__ == "__main__":
    main()
