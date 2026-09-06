#!/usr/bin/env python3
"""Render a saved set at the EXACT camera from a talk-quality snapshot.

    blender --background blender/office/office.blend --threads 8 \
      --python blender/tools/render_reference.py -- \
      --snapshot /tmp/cubicle-wide-snapshot.json --output /tmp/cubicle-reference.png

A separate process: never saves the .blend or touches the interactive session.
Reads the shared mapped-surface contract. Cycles/AgX is a lighting reference,
NOT a pixel-parity oracle for the browser's realtime lighting and ACES chain.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.setkit import ROOT, apply_surface_profiles, three_to_blender


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    snapshot = json.loads(args.snapshot.read_text())
    source = snapshot['camera']
    if source['status'] != 'available':
        raise ValueError('A captured runtime camera is required, not a guessed waypoint')
    apply_surface_profiles()
    scene = bpy.context.scene
    data = bpy.data.cameras.new('Matched runtime camera')
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 32.0
    data.lens = data.sensor_height * source['zoom'] / (2 * math.tan(math.radians(source['fov']) / 2))
    data.clip_start, data.clip_end = 0.01, 100.0
    camera = bpy.data.objects.new('Matched runtime camera', data)
    scene.collection.objects.link(camera)
    camera.location = three_to_blender(*source['position'])
    x, y, z, w = source['quaternion']
    basis = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_quaternion()
    camera.rotation_mode = 'QUATERNION'
    camera.rotation_quaternion = basis @ Quaternion((w, x, y, z))
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 128
    scene.cycles.seed = 202054686
    scene.cycles.use_animated_seed = False
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(args.output)
    bpy.ops.render.render(write_still=True)
    args.output.with_suffix('.json').write_text(json.dumps({
        'sourceBlend': bpy.data.filepath, 'camera': source,
        'surfaceContract': str(ROOT / 'src/scene/surfaceProfiles.json'),
        'viewTransform': scene.view_settings.view_transform,
        'look': scene.view_settings.look, 'exposure': scene.view_settings.exposure,
        'engine': 'Cycles', 'samples': 128, 'denoised': True,
        'note': 'Matched framing and material inputs; not identical lighting or display transforms.'
    }, indent=2) + '\n')


if __name__ == '__main__':
    main()
