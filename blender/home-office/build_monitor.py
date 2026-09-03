#!/usr/bin/env python3
"""Build the hero CRT housing and export it as the deck's `crt-monitor.glb`.

Run:
    blender --background --factory-startup --python blender/home-office/build_monitor.py

The housing is modelled at true scale in MILLIMETRES in the frame
`src/scene/Monitor.jsx` consumes — X width, Y up, screen facing +Z — so the
runtime keeps applying one uniform scale (16 / 520) and one shift. Blender is
Z-up, so geometry is authored here as (x, −z, y) and the glTF exporter's
Y-up conversion hands the CAD frame back unchanged.

The contract this must keep (see parts/crt_monitor.md and Monitor.jsx):
  • the opening is 523 × 295 mm, centred at X = 0 / Y = −17;
  • the pocket floors at Z = −12 (the live glass sits 10 mm in front of it);
  • the stand's underside is at Y = −288 (the desk-contact math);
  • the controls sit in a recessed bay on the chin, centred at Y = −206,
    X = −222 / −194 / −161, the bay floor at Z = −3 (the deck supplies the
    inserts and the status light);
  • Monitor.jsx buckets materials by position: stand below Y = −180, face
    in front of Z = −36, the rest is shell.

It replaced the nurb CAD part on 2026-09-02: a five-station loft with a
stepped fascia, a chin, and an integrated base/turntable/pedestal/tilt-barrel
stand. Corners are tight (14 mm on the face, 6 mm at the opening): the first
pass at 38 / 12 read as a rounded 2000s appliance, not a 90s tube. The sides
are clean — no vents. Two manufactured cues remain: the mould split where the
front bezel moulding meets the rear cabinet, and the control bay on the chin.
"""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = ROOT / "public" / "models" / "crt-monitor.glb"

CORNER_SEGMENTS = 12
# Shell loft stations, front to rear: (depth Z, half width, half height, centre Y, corner radius).
# Tight corners at the front: a 90s housing is crisp, and softening it past
# ~15 mm read as a 2000s appliance. The radii open up only as the tube
# gathers toward the neck.
STATIONS = (
    (0, 304.5, 208, -34.5, 14),
    (-116, 302, 206, -34.5, 18),
    (-230, 250, 176, -30, 30),
    (-360, 186, 142, -22, 44),
    (-470, 132, 106, -14, 48),
    (-500, 112, 92, -12, 44),
)
OPENING = (261.5, 147.5, -17, 6)  # half width, half height, centre Y, corner radius
FASCIA = (287.5, 163.5, -7, 10)
FASCIA_DEPTH = 10
POCKET_FLOOR = -12
STAND_DEPTH = -240
# Mould split: a V-groove where the front bezel moulding meets the rear
# cabinet, just before the shoulder gathers. Its walls are 45°, so the deck's
# 40° normal crease keeps it a line rather than smearing it into a band.
SEAM_DEPTH = -110
SEAM_HALF_WIDTH = 1.5
SEAM_INSET = 1.5
# Chin control bay: a shallow rounded well centred on the chin band. The
# deck's three button inserts and the status light sit in it.
BAY = (46, 11, -206, 5)  # half width, half height, centre Y, corner radius
BAY_CENTRE_X = -191.5
BAY_FLOOR = -3
# The polish: every break sharper than this gets a 2.5 mm bevel.
POLISH_WIDTH = 2.5
POLISH_ANGLE = math.radians(40)


def cad(x: float, y: float, z: float) -> Vector:
    """CAD (X width, Y up, Z toward the viewer) → Blender (X, −Z, Y)."""
    return Vector((x, -z, y))


def station_at(z: float) -> tuple[float, float, float, float]:
    """The shell section at depth `z`, interpolated between the authored stations."""
    for (z_front, *front), (z_back, *back) in zip(STATIONS, STATIONS[1:]):
        if z_back <= z <= z_front:
            t = (z_front - z) / (z_front - z_back)
            return tuple(a + (b - a) * t for a, b in zip(front, back))
    raise ValueError(f"depth {z} is outside the loft")


def shell_sections() -> list[tuple[float, float, float, float, float]]:
    """The loft stations plus the three sections that cut the mould split."""
    seam = []
    for dz, inset in ((SEAM_HALF_WIDTH, 0.0), (0.0, SEAM_INSET), (-SEAM_HALF_WIDTH, 0.0)):
        z = SEAM_DEPTH + dz
        half_w, half_h, cy, r = station_at(z)
        seam.append((z, half_w - inset, half_h - inset, cy, r))
    return sorted(STATIONS + tuple(seam), key=lambda section: -section[0])


def rounded_loop(bm: bmesh.types.BMesh, half_w: float, half_h: float, cy: float, r: float, z: float, cx: float = 0.0):
    verts = []
    corners = (
        (cx + half_w - r, cy + half_h - r, 0.0),
        (cx - half_w + r, cy + half_h - r, 90.0),
        (cx - half_w + r, cy - half_h + r, 180.0),
        (cx + half_w - r, cy - half_h + r, 270.0),
    )
    for ccx, ccy, start in corners:
        for step in range(CORNER_SEGMENTS + 1):
            angle = math.radians(start + 90.0 * step / CORNER_SEGMENTS)
            verts.append(bm.verts.new(cad(ccx + r * math.cos(angle), ccy + r * math.sin(angle), z)))
    edges = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    return verts, edges


def bridge(bm: bmesh.types.BMesh, a_edges, b_edges) -> None:
    bmesh.ops.bridge_loops(bm, edges=a_edges + b_edges)


def box(bm: bmesh.types.BMesh, sx: float, sz_depth: float, sy: float, cx: float, cz: float, cy: float, r: float = 0.0):
    """A block in CAD terms: `sy` is its height (Y up), `sz_depth` its depth.

    `r` rounds the four vertical corner edges only. Rounding every edge of a
    plate thinner than the radius lets the bevel spill past the plate — the
    first export put the stand's underside 40 mm below its contract.
    """
    created = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    for vertex in created:
        local = vertex.co.copy()
        vertex.co = cad(cx + local.x * sx, cy + local.z * sy, cz + local.y * sz_depth)
    if r > 0:
        edges = {edge for vertex in created for edge in vertex.link_edges}
        vertical = [
            edge
            for edge in edges
            if abs(edge.verts[0].co.z - edge.verts[1].co.z) > 1e-6
            and (edge.verts[0].co.xy - edge.verts[1].co.xy).length < 1e-6
        ]
        bmesh.ops.bevel(bm, geom=vertical, offset=r, segments=6, affect="EDGES")
    return created


def cylinder(bm: bmesh.types.BMesh, radius: float, length: float, cx: float, cz: float, cy: float, axis: str = "Y", segments: int = 48):
    created = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=length)["verts"]
    for vertex in created:
        local = vertex.co.copy()  # cone axis is local Z
        if axis == "Y":
            point = cad(cx + local.x, cy + local.z, cz + local.y)
        else:  # transverse, along X
            point = cad(cx + local.z, cy + local.y, cz + local.x)
        vertex.co = point
    return created


def build_housing() -> bpy.types.Object:
    bm = bmesh.new()

    # The shell: one loft through the sections (three of them are the mould
    # split), capped at the rear.
    sections = shell_sections()
    loops = [rounded_loop(bm, hw, hh, cy, r, z) for z, hw, hh, cy, r in sections]
    for a, b in zip(loops, loops[1:]):
        bridge(bm, a[1], b[1])
    bm.faces.new(loops[-1][0])
    seam_edges = {
        edge
        for section, loop in zip(sections, loops)
        if abs(section[0] - SEAM_DEPTH) <= SEAM_HALF_WIDTH + 1e-6
        for edge in loop[1]
    }

    # The front: the annulus from the shell's front section in to the fascia
    # is FILLED rather than bridged so the control bay's rim can be a third
    # loop in it; then the bay sinks, the fascia steps forward, its front
    # annulus goes in to the opening, the pocket walls back, the floor.
    fascia_back = rounded_loop(bm, *FASCIA, 0)
    bay_rim = rounded_loop(bm, *BAY, 0, cx=BAY_CENTRE_X)
    bmesh.ops.triangle_fill(
        bm, use_beauty=True, use_dissolve=False, edges=loops[0][1] + fascia_back[1] + bay_rim[1]
    )
    bay_floor = rounded_loop(bm, *BAY, BAY_FLOOR, cx=BAY_CENTRE_X)
    bridge(bm, bay_rim[1], bay_floor[1])
    bm.faces.new(bay_floor[0])
    fascia_front = rounded_loop(bm, *FASCIA, FASCIA_DEPTH)
    bridge(bm, fascia_back[1], fascia_front[1])
    opening_front = rounded_loop(bm, *OPENING, FASCIA_DEPTH)
    bridge(bm, fascia_front[1], opening_front[1])
    opening_floor = rounded_loop(bm, *OPENING, POCKET_FLOOR)
    bridge(bm, opening_front[1], opening_floor[1])
    bm.faces.new(opening_floor[0])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    shell_faces = set(bm.faces)

    # The stand: base plate with its underside at −288, turntable, pedestal
    # up into the shell, a transverse tilt barrel and its pivot caps.
    box(bm, 440, 360, 22, 0, STAND_DEPTH, -277, r=40)
    cylinder(bm, 150, 12, 0, STAND_DEPTH, -260)
    box(bm, 210, 150, 60, 0, STAND_DEPTH, -224, r=14)
    cylinder(bm, 40, 300, 0, STAND_DEPTH, -214, axis="X")
    for side in (-1, 1):
        cylinder(bm, 48, 10, side * 155, STAND_DEPTH, -214, axis="X", segments=40)
    bmesh.ops.recalc_face_normals(bm, faces=[face for face in bm.faces if face not in shell_faces])

    # No side vents: proud strips read as stickers and cuts read as torn rims.
    # The shell's sides stay clean, the way the FW900's do.

    # The polish, in bmesh rather than a modifier so the seam can opt out: a
    # 2.5 mm bevel would swallow a groove 3 mm wide.
    sharp = [
        edge
        for edge in bm.edges
        if edge not in seam_edges and edge.is_manifold and edge.calc_face_angle(0.0) > POLISH_ANGLE
    ]
    bmesh.ops.bevel(bm, geom=sharp, offset=POLISH_WIDTH, segments=2, affect="EDGES", clamp_overlap=True)
    # Mark every break sharper than the polish angle as a hard edge, the seam
    # included, so the lookdev proxy shades the way the deck does (Monitor.jsx
    # creases normals at the same 40°). Without it the flat front face
    # borrows the bevel's tilt at its rim and the fill's long triangles smear
    # that across the chin as wedges.
    for edge in bm.edges:
        if edge.is_manifold and edge.calc_face_angle(0.0) > POLISH_ANGLE:
            edge.smooth = False

    mesh = bpy.data.meshes.new("crt_monitor")
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    material = bpy.data.materials.new("CRT graphite ABS")
    material.use_nodes = True
    bsdf = material.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.024, 0.026, 0.031, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.62
    mesh.materials.append(material)
    housing = bpy.data.objects.new("crt_monitor", mesh)
    bpy.context.scene.collection.objects.link(housing)
    return housing


def main() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    housing = build_housing()
    bpy.context.view_layer.objects.active = housing
    housing.select_set(True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
    )
    print(f"CRT_MONITOR_GLB={OUTPUT_PATH}")
    print(f"CRT_MONITOR_TRIANGLES={sum(len(p.vertices) - 2 for p in housing.data.polygons)}")


if __name__ == "__main__":
    main()
