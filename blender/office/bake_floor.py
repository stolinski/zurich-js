#!/usr/bin/env python3
"""Bake the real office's diffuse floor illumination, not analytical pools.

    blender --background blender/office/office.blend --python blender/office/bake_floor.py

Reads the authored set without saving it. Cycles traces direct + indirect light
against the actual furniture, partitions and sources. Albedo is excluded: R3F
keeps its filtered carpet maps and live specular response, but REPLACES diffuse
lighting on this one receiver instead of adding a second lighting solution.

The floor already has fitted UVs; no extra geometry or UV channel is needed.
PNG stores scene-linear radiance / RANGE encoded as sRGB (NOT AgX/ACES). The
runtime decodes sRGB and restores RANGE before its normal finishing chain.
"""
from __future__ import annotations

import array
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.setkit import apply_surface_profiles, world_bounds

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'public/textures/lightmaps/office-floor-cycles.png'
RANGE = 8.0
WIDTH = 1024
SAMPLES = 256


def chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)


def encode(value: float) -> int:
    value = min(1.0, max(0.0, value / RANGE))
    srgb = value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
    return round(srgb * 255)


def save_radiance(image: bpy.types.Image, output: Path) -> dict:
    width, height = image.size
    pixels = array.array('f', [0.0]) * (width * height * 4)
    image.pixels.foreach_get(pixels)
    rows = []
    maximum = 0.0
    clipped = 0
    # Blender pixels are bottom-up. PNG is top-down; GLB V is flipped, and
    # the runtime uses flipY=false just like the floor's fitted carpet map.
    for y in range(height - 1, -1, -1):
        row = bytearray([0])
        for x in range(width):
            start = (y * width + x) * 4
            rgb = pixels[start:start + 3]
            if not all(math.isfinite(v) for v in rgb):
                raise ValueError('Non-finite radiance in Cycles bake')
            maximum = max(maximum, *rgb)
            clipped += int(max(rgb) > RANGE)
            row.extend(encode(v) for v in rgb)
        rows.append(bytes(row))
    if clipped:
        raise ValueError(f'{clipped} texels exceed the fixed radiance range {RANGE}: max={maximum}')
    data = b'\x89PNG\r\n\x1a\n'
    data += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    data += chunk(b'sRGB', b'\x00')
    data += chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
    data += chunk(b'IEND', b'')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    return {'width': width, 'height': height, 'range': RANGE, 'maximumRadiance': maximum,
            'clippedTexels': clipped, 'sha256': hashlib.sha256(data).hexdigest()}


def main() -> None:
    source_path = Path(bpy.data.filepath)
    scene = bpy.context.scene
    floor = bpy.data.objects.get('Carpet floor')
    if floor is None or not floor.data.uv_layers:
        raise RuntimeError('Open the authored office.blend; fitted Carpet floor UVs are required')
    apply_surface_profiles()
    bpy.context.view_layer.update()
    bounds = world_bounds(floor)
    height = round(WIDTH * (bounds[3] - bounds[2]) / (bounds[1] - bounds[0]))

    # Only the top receives this map. The fitted slab UVs deliberately overlap
    # its top/bottom; baking both would overwrite the lit floor with its underside.
    floor.data = floor.data.copy()
    bm = bmesh.new()
    bm.from_mesh(floor.data)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.9], context='FACES')
    bm.to_mesh(floor.data)
    bm.free()
    floor.data.update()

    image = bpy.data.images.new('Office floor diffuse radiance', width=WIDTH, height=height,
                                alpha=False, float_buffer=True)
    image.colorspace_settings.name = 'Linear Rec.709'
    # A broad illumination bake should not contain the high-frequency normal
    # map; the runtime carpet provides that relief at its own filtered scale.
    for source in list(floor.data.materials):
        material = source.copy()
        floor.data.materials.clear()
        floor.data.materials.append(material)
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes.get('Principled BSDF')
        for link in list(bsdf.inputs['Normal'].links):
            links.remove(link)
        target = nodes.new('ShaderNodeTexImage')
        target.image = image
        nodes.active = target

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.seed = 0xC0B1C1E
    scene.cycles.use_animated_seed = False
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 2
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 8
    bpy.ops.object.select_all(action='DESELECT')
    floor.hide_set(False)
    floor.select_set(True)
    bpy.context.view_layer.objects.active = floor
    bpy.ops.object.bake(type='DIFFUSE')

    metadata = save_radiance(image, OUTPUT)
    metadata.update({'source': str(source_path.relative_to(ROOT)),
                     'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
                     'surfaceContractSha256': hashlib.sha256((ROOT / 'src/scene/surfaceProfiles.json').read_bytes()).hexdigest(),
                     'engine': 'Cycles', 'samples': SAMPLES, 'seed': scene.cycles.seed,
                     'passes': ['direct', 'indirect'], 'albedo': False,
                     'encoding': 'sRGB-encoded linear radiance divided by range',
                     'uv': 'fitted floor UV0; runtime flipY=false', 'boundsMetres': bounds})
    OUTPUT.with_suffix('.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('FLOOR_BAKE=' + json.dumps(metadata))


if __name__ == '__main__':
    main()
