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
  • the four surfaces are MATERIAL SLOTS, exported as four glTF primitives
    that Monitor.jsx finishes by name: "CRT shell" (the rear cabinet behind
    the mould split), "CRT face" (the front bezel moulding — the front face,
    the fascia step, the chin and its control bay, and the sides forward of
    the split), "CRT stand" and "CRT inner return" (the pocket walls and
    floor). Until 2026-09-09 Monitor.jsx bucketed triangles by CENTROID
    instead — "stand below Y = −180" — and the chin, which runs from −170 to
    −242, was filled with 580 mm sliver triangles that straddled that line,
    so half of them wore the stand's lighter, shinier material: the "weird
    geometry and shadow on the front panel" Scott saw on every room slide.

It replaced the nurb CAD part on 2026-09-02: a five-station loft with a
stepped fascia, a chin, and an integrated base/turntable/pedestal/tilt-barrel
stand. Corners are tight (14 mm on the face, 6 mm at the opening): the first
pass at 38 / 12 read as a rounded 2000s appliance, not a 90s tube. The sides
are clean — no vents. Two manufactured cues remain: the mould split where the
front bezel moulding meets the rear cabinet, and the control bay on the chin.

Tessellation matters here because the deck shades per vertex (the weathering
mottle and the roughness it drives in lib/propSurface.js) and because the
office and wall copies are decimated from this mesh: every rounded loop
subdivides its straight runs, so loft and fascia quads are at most ~60 mm
long, and the front annulus is a constrained Delaunay fill over a 32 mm grid
rather than one `triangle_fill` fan whose slivers ran the width of the chin.
"""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = ROOT / "public" / "models" / "crt-monitor.glb"

CORNER_SEGMENTS = 12
# Straight runs of every bridged rounded loop are cut into this many segments
# (horizontal runs, vertical runs). Every loop in a bridge must share the
# count, or bridge_loops pairs vertices across the wrong edges.
RUNS = (9, 6)
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
BAY_RUNS = (3, 1)
# The front annulus fill: interior points on this pitch, kept this far from
# every boundary so no triangle is thinner than the rim it sits in.
FILL_PITCH = 32.0
FILL_MARGIN = 11.0
# The polish: every break sharper than this gets a 2.5 mm bevel.
POLISH_WIDTH = 2.5
POLISH_ANGLE = math.radians(40)

# Material slots, in the order Monitor.jsx expects to find them by name.
SURFACES = (
    ("CRT shell", (0.024, 0.026, 0.031), 0.62),
    ("CRT face", (0.019, 0.021, 0.024), 0.64),
    ("CRT stand", (0.034, 0.037, 0.043), 0.46),
    ("CRT inner return", (0.002, 0.003, 0.003), 0.96),
)
SHELL, FACE, STAND, INNER_RETURN = range(4)


def cad(x: float, y: float, z: float) -> Vector:
    """CAD (X width, Y up, Z toward the viewer) → Blender (X, −Z, Y)."""
    return Vector((x, -z, y))


def cad_xy(vertex: bmesh.types.BMVert) -> Vector:
    """A Blender vertex's CAD (X, Y) — its position in the front plane."""
    return Vector((vertex.co.x, vertex.co.z))


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


def rounded_loop(
    bm: bmesh.types.BMesh,
    half_w: float,
    half_h: float,
    cy: float,
    r: float,
    z: float,
    cx: float = 0.0,
    runs: tuple[int, int] = RUNS,
):
    """A rounded rectangle at depth `z`: four corner arcs joined by straight
    runs, the runs subdivided so no edge is longer than a fraction of a side.
    Every loop built with the same `runs` has the same vertex count and order,
    which is what lets `bridge_loops` pair them cleanly."""
    corners = (
        (cx + half_w - r, cy + half_h - r, 0.0),
        (cx - half_w + r, cy + half_h - r, 90.0),
        (cx - half_w + r, cy - half_h + r, 180.0),
        (cx + half_w - r, cy - half_h + r, 270.0),
    )
    points: list[Vector] = []
    arcs = []
    for ccx, ccy, start in corners:
        arc = []
        for step in range(CORNER_SEGMENTS + 1):
            angle = math.radians(start + 90.0 * step / CORNER_SEGMENTS)
            arc.append(Vector((ccx + r * math.cos(angle), ccy + r * math.sin(angle))))
        arcs.append(arc)
    for index, arc in enumerate(arcs):
        points.extend(arc)
        following = arcs[(index + 1) % 4][0]
        # Runs after the first and third arcs are horizontal, the others vertical.
        segments = runs[0] if index % 2 == 0 else runs[1]
        for step in range(1, segments):
            points.append(arc[-1].lerp(following, step / segments))
    verts = [bm.verts.new(cad(point.x, point.y, z)) for point in points]
    edges = [bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts))]
    return verts, edges


def bridge(bm: bmesh.types.BMesh, a_edges, b_edges) -> None:
    bmesh.ops.bridge_loops(bm, edges=a_edges + b_edges)


def rounded_rect_distance(point: Vector, half_w: float, half_h: float, cy: float, r: float, cx: float = 0.0) -> float:
    """Signed distance from a point in the front plane to a rounded rectangle's
    boundary: negative inside."""
    dx = abs(point.x - cx) - (half_w - r)
    dy = abs(point.y - cy) - (half_h - r)
    outside = Vector((max(dx, 0.0), max(dy, 0.0))).length
    inside = min(max(dx, dy), 0.0)
    return outside + inside - r


def fill_front_annulus(bm: bmesh.types.BMesh, outer, fascia, bay) -> list[bmesh.types.BMFace]:
    """Triangulate the front face — the region inside the shell's front loop,
    outside the fascia and outside the control bay — with a constrained
    Delaunay triangulation over a grid of interior points. The loops stay the
    boundary exactly (their edges are constraints), and the interior points
    keep every triangle short, so per-vertex shading has vertices to land on
    and the material seam at the fascia is a line rather than a fan."""
    outer_verts, fascia_verts, bay_verts = outer[0], fascia[0], bay[0]
    boundary = outer_verts + fascia_verts + bay_verts
    coords = [cad_xy(vertex) for vertex in boundary]
    edges = []
    offset = 0
    for loop in (outer_verts, fascia_verts, bay_verts):
        count = len(loop)
        edges.extend((offset + i, offset + (i + 1) % count) for i in range(count))
        offset += count

    outer_rr = (STATIONS[0][1], STATIONS[0][2], STATIONS[0][3], STATIONS[0][4])
    fascia_rr = FASCIA
    bay_rr = (*BAY, BAY_CENTRE_X)
    interior = []
    half_w, half_h, cy, r = outer_rr
    x = -half_w + FILL_PITCH / 2
    while x < half_w:
        y = cy - half_h + FILL_PITCH / 2
        while y < cy + half_h:
            point = Vector((x, y))
            if (
                rounded_rect_distance(point, *outer_rr) < -FILL_MARGIN
                and rounded_rect_distance(point, *fascia_rr) > FILL_MARGIN
                and rounded_rect_distance(point, *bay_rr) > FILL_MARGIN
            ):
                interior.append(point)
            y += FILL_PITCH
        x += FILL_PITCH
    coords.extend(interior)

    out_coords, _, out_faces, orig_verts, _, _ = delaunay_2d_cdt(
        coords, edges, [list(range(len(outer_verts)))], 1, 1e-5
    )
    verts = []
    for index, coord in enumerate(out_coords):
        origins = orig_verts[index]
        boundary_origin = next((o for o in origins if o < len(boundary)), None)
        if boundary_origin is not None:
            verts.append(boundary[boundary_origin])
        else:
            verts.append(bm.verts.new(cad(coord.x, coord.y, 0.0)))

    faces = []
    for face in out_faces:
        centroid = sum((out_coords[i] for i in face), Vector((0.0, 0.0))) / len(face)
        if rounded_rect_distance(centroid, *fascia_rr) < 0 or rounded_rect_distance(centroid, *bay_rr) < 0:
            continue
        faces.append(bm.faces.new([verts[i] for i in face]))
    return faces


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
    loft_faces = set(bm.faces)

    # The front: the annulus from the shell's front section in to the fascia,
    # with the control bay's rim as a hole in it, filled by constrained
    # Delaunay; then the bay sinks, the fascia steps forward, its front
    # annulus goes in to the opening, the pocket walls back, the floor.
    fascia_back = rounded_loop(bm, *FASCIA, 0)
    bay_rim = rounded_loop(bm, *BAY, 0, cx=BAY_CENTRE_X, runs=BAY_RUNS)
    fill_front_annulus(bm, loops[0], fascia_back, bay_rim)
    bay_floor = rounded_loop(bm, *BAY, BAY_FLOOR, cx=BAY_CENTRE_X, runs=BAY_RUNS)
    bridge(bm, bay_rim[1], bay_floor[1])
    bm.faces.new(bay_floor[0])
    fascia_front = rounded_loop(bm, *FASCIA, FASCIA_DEPTH)
    bridge(bm, fascia_back[1], fascia_front[1])
    opening_front = rounded_loop(bm, *OPENING, FASCIA_DEPTH)
    bridge(bm, fascia_front[1], opening_front[1])
    face_faces = set(bm.faces) - loft_faces
    opening_floor = rounded_loop(bm, *OPENING, POCKET_FLOOR)
    bridge(bm, opening_front[1], opening_floor[1])
    bm.faces.new(opening_floor[0])
    pocket_faces = set(bm.faces) - loft_faces - face_faces
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

    # Surfaces. The bezel moulding is one part: the front, the fascia, the chin
    # and the sides forward of the mould split all wear the face material; the
    # cabinet behind the split is the shell. The bevel below inherits from the
    # faces it splits, so the seams stay exactly on the authored breaks.
    for face in bm.faces:
        if face in pocket_faces:
            face.material_index = INNER_RETURN
        elif face in face_faces:
            face.material_index = FACE
        elif face in loft_faces:
            depth = -face.calc_center_median().y  # CAD Z
            face.material_index = FACE if depth > SEAM_DEPTH + SEAM_HALF_WIDTH else SHELL
        else:
            face.material_index = STAND

    # The polish, in bmesh rather than a modifier so the seam can opt out: a
    # 2.5 mm bevel would swallow a groove 3 mm wide.
    sharp = [
        edge
        for edge in bm.edges
        if edge not in seam_edges and edge.is_manifold and edge.calc_face_angle(0.0) > POLISH_ANGLE
    ]
    bmesh.ops.bevel(bm, geom=sharp, offset=POLISH_WIDTH, segments=2, affect="EDGES", clamp_overlap=True, material=-1)
    # Mark every break sharper than the polish angle as a hard edge, the seam
    # included, so the lookdev proxy shades the way the deck does (Monitor.jsx
    # creases normals at the same 40°).
    for edge in bm.edges:
        if edge.is_manifold and edge.calc_face_angle(0.0) > POLISH_ANGLE:
            edge.smooth = False

    mesh = bpy.data.meshes.new("crt_monitor")
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    for name, colour, roughness in SURFACES:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
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
    counts = {name: 0 for name, *_ in SURFACES}
    for polygon in housing.data.polygons:
        counts[SURFACES[polygon.material_index][0]] += len(polygon.vertices) - 2
    print(f"CRT_MONITOR_GLB={OUTPUT_PATH}")
    print(f"CRT_MONITOR_TRIANGLES={sum(counts.values())}")
    for name, count in counts.items():
        print(f"CRT_MONITOR_SURFACE {name}: {count} triangles")


if __name__ == "__main__":
    main()
