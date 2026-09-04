#!/usr/bin/env python3
"""Export the authored home-office set as one optimized, runtime-ready GLB.

Run after ``build_scene.py``:
    blender --background blender/home-office/home-office.blend \
      --python blender/home-office/export_scene.py

The source remains metric. React Three Fiber scales the exported root by
``16 / 0.520`` so the Blender glass contract lands exactly on the live screen.
The pipeline itself (modifiers applied, transforms baked, meshes merged by
material, procedural nodes replaced by their physical fallbacks) is
``blender/lib/export.py``, shared with the office and the wall.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.export import export_collection  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = ROOT / "public" / "models" / "home-office.glb"

# Materials whose own image maps ship in the GLB; every other surface takes
# the talk's shared plaster/linen/wood maps at runtime (HomeOffice.jsx).
EMBEDDED_MATERIALS = {
    "Poly Haven dark wooden planks",
    "potted_plant_02_leaves",
    "potted_plant_02_pot",
    "stationery_supplies",
    "binder_notebook",
}


if __name__ == "__main__":
    export_collection(
        "HOME_EXPORT",
        OUTPUT_PATH,
        label="Home office",
        embedded_materials=EMBEDDED_MATERIALS,
        print_prefix="HOME_OFFICE",
    )
