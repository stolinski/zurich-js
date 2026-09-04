#!/usr/bin/env python3
"""Measure a built set: world bounds of named objects and an AABB clip sweep.

    blender --background blender/office/office.blend \
      --python blender/tools/inspect_set.py -- OFFICE_EXPORT "Hero task chair" "Hero pedestal"

Prints every object's world bounds whose name matches one of the given
substrings, then every overlapping pair in the collection (skipping pairs
that share a name root, and architecture against architecture), the way the
home set's clipping was enumerated before its fixes.
"""

from __future__ import annotations

import sys
from itertools import combinations
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.setkit import world_bounds  # noqa: E402

ARCHITECTURE = ("wall", "floor", "ceiling", "tee", "base", "door", "panel", "post", "cap", "raceway", "beltline", "fabric", "shell", "troffer", "grille")


def name_root(name: str) -> str:
    return name.split(" ")[0].lower()


def is_architecture(name: str) -> bool:
    lowered = name.lower()
    return any(token in lowered for token in ARCHITECTURE)


def overlap(a: tuple[float, ...], b: tuple[float, ...], tolerance: float = 0.002) -> tuple[float, float, float] | None:
    dx = min(a[1], b[1]) - max(a[0], b[0])
    dy = min(a[3], b[3]) - max(a[2], b[2])
    dz = min(a[5], b[5]) - max(a[4], b[4])
    if dx > tolerance and dy > tolerance and dz > tolerance:
        return (dx, dy, dz)
    return None


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    collection_name = argv[0] if argv else "OFFICE_EXPORT"
    watch = argv[1:]
    source = bpy.data.collections.get(collection_name)
    if source is None:
        raise RuntimeError(f"Missing collection: {collection_name}")
    bpy.context.view_layer.update()

    meshes = [obj for obj in source.all_objects if obj.type == "MESH"]
    bounds = {obj.name: world_bounds(obj) for obj in meshes}
    for obj in meshes:
        if any(token.lower() in obj.name.lower() for token in watch):
            b = bounds[obj.name]
            print(
                f"BOUNDS {obj.name}: x {b[0]:.3f}..{b[1]:.3f}  y {b[2]:.3f}..{b[3]:.3f}  z {b[4]:.3f}..{b[5]:.3f}"
                f"  scale {tuple(round(s, 4) for s in obj.scale)}  rot {tuple(round(r, 3) for r in obj.rotation_euler)}"
                f"  polys {len(obj.data.polygons)}"
            )

    triangles = 0
    for obj in meshes:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        triangles += sum(max(0, len(polygon.vertices) - 2) for polygon in mesh.polygons)
        evaluated.to_mesh_clear()
    print(f"TRIANGLES {triangles} in {len(meshes)} meshes")

    reported = 0
    for a, b in combinations(meshes, 2):
        if name_root(a.name) == name_root(b.name):
            continue
        if is_architecture(a.name) and is_architecture(b.name):
            continue
        hit = overlap(bounds[a.name], bounds[b.name])
        if hit is None:
            continue
        reported += 1
        print(f"OVERLAP {a.name} × {b.name}: {hit[0] * 1000:.0f} × {hit[1] * 1000:.0f} × {hit[2] * 1000:.0f} mm")
    print(f"OVERLAPS {reported}")


if __name__ == "__main__":
    main()
