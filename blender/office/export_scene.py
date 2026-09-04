#!/usr/bin/env python3
"""Export the authored office set as one optimized, runtime-ready GLB.

Run after ``build_scene.py``:
    blender --background blender/office/office.blend \
      --python blender/office/export_scene.py

The source remains metric. React Three Fiber scales the exported root by
``16 / 0.520`` so the Blender glass contract lands exactly on the live screen.
Nothing in the office carries its own image maps: every visible surface is
re-materialed by name at runtime (CubicleOffice.jsx) with the talk's shared
maps and painted fields. The eight agent-screen placements ride along as the
scene's ``agent_screens`` extra.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.export import export_collection  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = ROOT / "public" / "models" / "office.glb"


if __name__ == "__main__":
    export_collection(
        "OFFICE_EXPORT",
        OUTPUT_PATH,
        label="Office",
        embedded_materials=set(),
        print_prefix="OFFICE",
    )
