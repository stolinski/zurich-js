"""The desk props every workstation in the talk carries: keyboard, mouse, mug.

The same objects sit on the home desk and on the office worktops — that is
the corporate-recursion argument made literal — so they are built once here.
Each builder takes the material dict its set assembled (keys: keyboard,
keycap, keycap_mod, keyboard_plate, rubber, mouse, black, ceramic, coffee) and
the surface it stands on.
"""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Vector

from lib.setkit import add_box, add_curve, add_cylinder, mesh_from_bmesh, move_to_collection, smoothstep

KEY_UNIT = 0.01905
# A 60% board: 61 keys in five rows at the standard pitch, with the real
# widths for Backspace, Tab, Caps, Enter, both Shifts and the bottom row.
KEY_ROWS = (
    (1,) * 13 + (2,),
    (1.5,) + (1,) * 12 + (1.5,),
    (1.75,) + (1,) * 11 + (2.25,),
    (2.25,) + (1,) * 10 + (2.75,),
    (1.25,) * 3 + (6.25,) + (1.25,) * 4,
)
# OEM profile: the number row is tallest, the home row lowest.
KEY_ROW_HEIGHTS = (0.0116, 0.0106, 0.0098, 0.0102, 0.0094)
KEYBOARD_BEZEL = 0.0055
KEYBOARD_WIDTH = 15 * KEY_UNIT + 2 * KEYBOARD_BEZEL
KEYBOARD_DEPTH = 5 * KEY_UNIT + 2 * KEYBOARD_BEZEL
KEYBOARD_CASE_HEIGHT = 0.0135
KEYBOARD_RECESS = 0.0045


def build_keyboard(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float],
    name: str = "Keyboard",
    cable: bool = True,
) -> bpy.types.Object:
    """A compact mechanical keyboard, modelled.

    A keyboard is a specific object: a 60% layout at 19.05 mm pitch with the
    right modifier widths, tapered caps in a row profile, a dark plate showing
    in the gaps, a low case at a typing angle with a recess the caps sit in.
    Everything hangs off one rig empty pivoted at the front edge on the desk,
    so the tilt raises the back; the exporter bakes the world transforms.
    Returns the rig.
    """
    bezel = KEYBOARD_BEZEL
    width = KEYBOARD_WIDTH
    depth = KEYBOARD_DEPTH
    case_height = KEYBOARD_CASE_HEIGHT
    recess = KEYBOARD_RECESS
    rig = bpy.data.objects.new(name, None)
    target.objects.link(rig)
    rig.location = location
    rig.rotation_mode = "XYZ"
    rig.rotation_euler = rotation

    # The case: a bevelled block whose top is inset by the bezel and pushed
    # down into a recess, so the plate and the cap bases sit inside it.
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            vertex.co.x * width,
            (vertex.co.y + 0.5) * depth,
            (vertex.co.z + 0.5) * case_height,
        ))
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.0025, segments=4, affect="EDGES")
    bm.faces.ensure_lookup_table()

    def face_height(face: bmesh.types.BMFace) -> float:
        return face.calc_center_median().z

    top = max(bm.faces, key=face_height)
    bmesh.ops.inset_individual(bm, faces=[top], thickness=bezel - 0.0025, depth=0.0)
    for vertex in top.verts:
        vertex.co.z -= recess
    mesh_from_bmesh(f"{name} case", bm, mats["keyboard"], target, parent=rig)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            vertex.co.x * (width - 2 * bezel + 0.002),
            bezel - 0.001 + (vertex.co.y + 0.5) * (depth - 2 * bezel + 0.002),
            case_height - recess + (vertex.co.z + 0.5) * 0.003,
        ))
    mesh_from_bmesh(f"{name} plate", bm, mats["keyboard_plate"], target, parent=rig)

    for row, widths in enumerate(KEY_ROWS):
        cy = depth - bezel - (row + 0.5) * KEY_UNIT
        x = -15 * KEY_UNIT / 2
        for column, units in enumerate(widths):
            cap_w = units * KEY_UNIT - 0.0032
            cap_d = KEY_UNIT - 0.0032
            cap_h = KEY_ROW_HEIGHTS[row]
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for vertex in bm.verts:
                top_face = vertex.co.z > 0
                sx, sy = (0.80, 0.74) if top_face else (1.0, 1.0)
                vertex.co = Vector((
                    vertex.co.x * cap_w * sx,
                    vertex.co.y * cap_d * sy + (0.0009 if top_face else 0.0),
                    (vertex.co.z + 0.5) * cap_h,
                ))
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.0011, segments=3, affect="EDGES")
            mesh_from_bmesh(
                f"{name} keycap {row + 1:02d}-{column + 1:02d}",
                bm,
                mats["keycap"] if units == 1 else mats["keycap_mod"],
                target,
                location=(x + units * KEY_UNIT / 2, cy, case_height - recess + 0.003),
                parent=rig,
            )
            x += units * KEY_UNIT

    if cable:
        lead = add_curve(
            f"{name} cable",
            [
                (0.0, depth + 0.001, 0.008),
                (0.03, depth + 0.10, -0.002),
                (0.10, depth + 0.30, -0.03),
                (0.16, depth + 0.55, -0.11),
            ],
            0.0022,
            mats["rubber"],
            target,
        )
        lead.parent = rig
    return rig


def build_bay_keyboard(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float],
    name: str,
) -> bpy.types.Object:
    """The same board for a workstation seen from the aisle: the case, the
    plate, and one tapered bar per key row instead of sixty-one caps. From
    two bays away the row stagger is what says keyboard; the caps are below
    a pixel, and sixty-one bevelled blocks per bay would spend the frame's
    triangle budget on nothing the room can see."""
    bezel = KEYBOARD_BEZEL
    width = KEYBOARD_WIDTH
    depth = KEYBOARD_DEPTH
    case_height = KEYBOARD_CASE_HEIGHT
    recess = KEYBOARD_RECESS
    rig = bpy.data.objects.new(name, None)
    target.objects.link(rig)
    rig.location = location
    rig.rotation_mode = "XYZ"
    rig.rotation_euler = rotation

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            vertex.co.x * width,
            (vertex.co.y + 0.5) * depth,
            (vertex.co.z + 0.5) * case_height,
        ))
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.0025, segments=2, affect="EDGES")
    mesh_from_bmesh(f"{name} case", bm, mats["keyboard"], target, parent=rig)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            vertex.co.x * (width - 2 * bezel),
            bezel + (vertex.co.y + 0.5) * (depth - 2 * bezel),
            case_height - recess + (vertex.co.z + 0.5) * 0.003,
        ))
    mesh_from_bmesh(f"{name} plate", bm, mats["keyboard_plate"], target, parent=rig)

    for row, widths in enumerate(KEY_ROWS):
        cy = depth - bezel - (row + 0.5) * KEY_UNIT
        # The row's real extent: the rows do not all start at the same x.
        row_width = sum(widths) * KEY_UNIT - 0.0032
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for vertex in bm.verts:
            top_face = vertex.co.z > 0
            sx, sy = (0.96, 0.74) if top_face else (1.0, 1.0)
            vertex.co = Vector((
                vertex.co.x * row_width * sx,
                vertex.co.y * (KEY_UNIT - 0.0032) * sy,
                (vertex.co.z + 0.5) * KEY_ROW_HEIGHTS[row],
            ))
        mesh_from_bmesh(
            f"{name} row {row + 1}",
            bm,
            mats["keycap"],
            target,
            location=(0.0, cy, case_height - recess + 0.003),
            parent=rig,
        )
    return rig


def build_mouse(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    location: tuple[float, float, float],
    yaw: float,
    *,
    desk_top_z: float,
    name: str = "Mouse",
    cable: bool = True,
) -> bpy.types.Object:
    """A modern mouse, modelled rather than imported.

    The CAD mouse read as a lump and a squashed sphere read as an egg. This
    is a bevelled block with a palm hump two-thirds back, a lower and
    narrower nose, and a flat base: the block's soft shoulders and flatter
    top are what make it read as a product. The button split, the seam
    across, and the wheel are ray-cast onto the finished surface, so they sit
    on it whatever the profile does. The nose points away from the sitter
    (local −y), toward the glass. `desk_top_z` is where the cable lands.
    """
    length, width, height = 0.118, 0.064, 0.037

    def profile(t: float) -> float:  # height along the length, 0 nose … 1 back
        return 0.50 + 0.50 * math.exp(-(((t - 0.66) / 0.32) ** 2))

    def taper(t: float) -> float:  # width along the length
        return 0.76 + 0.24 * smoothstep(0.05, 0.72, t) - 0.14 * smoothstep(0.86, 1.0, t)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.42, segments=12, affect="EDGES", profile=0.62)
    for vertex in bm.verts:
        x, y, z = vertex.co
        t = y + 0.5
        vertex.co = Vector((x * width * taper(t), y * length, (z + 0.5) * height * profile(t)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    body = mesh_from_bmesh(
        f"{name} body", bm, mats["mouse"], target, location=location, rotation=(0, 0, yaw)
    )
    bpy.context.view_layer.update()

    def surface_z(local_x: float, local_y: float) -> float:
        hit, point, _normal, _index = body.ray_cast(
            Vector((local_x, local_y, height * 2)), Vector((0, 0, -1))
        )
        return point.z if hit else 0.0

    def world(local_x: float, local_y: float, local_z: float) -> tuple[float, float, float]:
        return tuple(body.matrix_world @ Vector((local_x, local_y, local_z)))

    nose = -length / 2
    split_end = nose + 0.46 * length
    add_curve(
        f"{name} button split",
        [
            world(0.0, y, surface_z(0.0, y) + 0.0003)
            for y in (nose + 0.004 + (split_end - nose - 0.004) * i / 12 for i in range(13))
        ],
        0.0011,
        mats["black"],
        target,
    )
    half_width = (width / 2) * taper(0.46) * 0.96
    add_curve(
        f"{name} button seam",
        [
            world(x, split_end, surface_z(x, split_end) + 0.0003)
            for x in (-half_width + 2 * half_width * i / 14 for i in range(15))
        ],
        0.0011,
        mats["black"],
        target,
    )
    wheel_y = nose + 0.26 * length
    wheel_top = surface_z(0.0, wheel_y)
    add_box(
        f"{name} wheel slot",
        (0.011, 0.025, 0.012),
        world(0.0, wheel_y, wheel_top - 0.0065),
        mats["black"],
        target,
        rotation=(0, 0, yaw),
    )
    add_cylinder(
        f"{name} wheel",
        0.009,
        0.0045,
        world(0.0, wheel_y, wheel_top - 0.006),
        mats["rubber"],
        target,
        rotation=(0, math.pi / 2, yaw),
        vertices=48,
    )
    x, y, z = location
    if cable:
        add_curve(
            f"{name} cable",
            [
                world(0.0, nose - 0.001, 0.005),
                world(0.05, nose - 0.16, 0.002),
                world(0.09, nose - 0.45, desk_top_z - z + 0.002),
                world(0.13, nose - 0.70, desk_top_z - z - 0.12),
            ],
            0.0022,
            mats["rubber"],
            target,
        )
    return body


def build_simple_mouse(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    location: tuple[float, float, float],
    yaw: float,
    *,
    name: str,
) -> bpy.types.Object:
    """The mouse shell alone, for a workstation seen from the aisle."""
    length, width, height = 0.118, 0.064, 0.037

    def profile(t: float) -> float:
        return 0.50 + 0.50 * math.exp(-(((t - 0.66) / 0.32) ** 2))

    def taper(t: float) -> float:
        return 0.76 + 0.24 * smoothstep(0.05, 0.72, t) - 0.14 * smoothstep(0.86, 1.0, t)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.42, segments=5, affect="EDGES", profile=0.62)
    for vertex in bm.verts:
        x, y, z = vertex.co
        t = y + 0.5
        vertex.co = Vector((x * width * taper(t), y * length, (z + 0.5) * height * profile(t)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return mesh_from_bmesh(name, bm, mats["mouse"], target, location=location, rotation=(0, 0, yaw))


def build_mug(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    location: tuple[float, float, float],
    yaw: float,
    *,
    name: str = "Ceramic mug",
    steps: int = 64,
) -> bpy.types.Object:
    """A lathed mug: a slight taper, a rolled lip, a thick base, coffee 14 mm
    below the rim, and a handle that plunges into the wall. Replaces a
    49k-triangle CAD lathe with straight sides and a pipe for a handle.
    """
    x, y, z = location
    profile = [
        (0.0, 0.0), (0.030, 0.0), (0.037, 0.004), (0.039, 0.030), (0.040, 0.060),
        (0.0415, 0.092), (0.0405, 0.096), (0.037, 0.096), (0.036, 0.090),
        (0.0355, 0.040), (0.033, 0.012), (0.0, 0.010),
    ]
    bm = bmesh.new()
    verts = [bm.verts.new((radius, 0.0, height)) for radius, height in profile]
    edges = [bm.edges.new((verts[index], verts[index + 1])) for index in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    body = mesh_from_bmesh(
        name, bm, mats["ceramic"], target, location=(x, y, z + 0.001), rotation=(0, 0, yaw)
    )

    bpy.ops.mesh.primitive_circle_add(vertices=steps, radius=0.0352, fill_type="NGON", location=(x, y, z + 0.001 + 0.082))
    coffee = bpy.context.object
    coffee.name = f"{name} coffee"
    coffee.data.materials.append(mats["coffee"])
    move_to_collection(coffee, target)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.027, minor_radius=0.0065, major_segments=steps * 3 // 4, minor_segments=max(8, steps // 4))
    handle = bpy.context.object
    handle.name = f"{name} handle"
    bm = bmesh.new()
    bm.from_mesh(handle.data)
    # Keep the outer half of the ring, cut at its centre plane so both ends
    # terminate inside the wall's thickness rather than a visible 2 mm short.
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if vertex.co.x < 0.0], context="VERTS")
    bm.to_mesh(handle.data)
    bm.free()
    for polygon in handle.data.polygons:
        polygon.use_smooth = True
    handle.data.materials.append(mats["ceramic"])
    handle.parent = body
    handle.location = (0.036, 0.0, 0.052)
    handle.rotation_euler = (math.pi / 2, 0, 0)
    move_to_collection(handle, target)
    return body
