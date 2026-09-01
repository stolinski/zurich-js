#!/usr/bin/env python3
"""Bake the cubicle's low-frequency indirect irradiance into one world-space map.

The renderer supplies direct troffer/screen lights and static cast shadows. This
map stores only the broad light returned by floor, worktops, and nearby screens,
plus large-scale occlusion beneath desks. It is deterministic, local, and
regenerated offline rather than accumulated during a presentation.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

WIDTH = 260
HEIGHT = 360
X_MIN, X_MAX = -130.0, 130.0
Z_MIN, Z_MAX = -260.0, 100.0
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public/textures/lightmaps"
OUTPUTS = {
    "volume": OUTPUT_DIR / "cubicle-irradiance.png",
    "floor": OUTPUT_DIR / "cubicle-floor-irradiance.png",
}

FIXTURES = [
    (side * 22.0, z)
    for side in (-1.0, 1.0)
    for z in (8.0, -34.0, -76.0, -118.0, -160.0)
]
SCREENS = [(0.0, 0.0, 1.0)] + [
    (side * 33.5, z - 2.5, 0.55)
    for z in (-41.0, -83.0, -125.0, -167.0)
    for side in (-1.0, 1.0)
]
DESKS = [(0.0, 0.2, 52.0, 38.0)] + [
    (side * 51.5, z, 40.0, 38.0)
    for z in (-41.0, -83.0, -125.0, -167.0)
    for side in (-1.0, 1.0)
]


def gaussian(dx: float, dz: float, sx: float, sz: float) -> float:
    return math.exp(-0.5 * ((dx / sx) ** 2 + (dz / sz) ** 2))


def smooth_box(x: float, z: float, cx: float, cz: float, width: float, depth: float) -> float:
    """Soft 0..1 mask with a five-unit penumbra inside an axis-aligned box."""
    edge = 5.0
    dx = width * 0.5 - abs(x - cx)
    dz = depth * 0.5 - abs(z - cz)
    return max(0.0, min(1.0, min(dx, dz) / edge))


def linear_to_srgb(value: float) -> int:
    value = max(0.0, min(1.0, value))
    if value <= 0.0031308:
        encoded = value * 12.92
    else:
        encoded = 1.055 * (value ** (1.0 / 2.4)) - 0.055
    return round(encoded * 255.0)


def irradiance(x: float, z: float, floor_occlusion: bool) -> tuple[float, float, float]:
    # Neutral fluorescent energy returned by the pale carpet and HPL. Distinct
    # pools preserve the negative intervals between visible fixture rows.
    neutral = 0.009
    for fx, fz in FIXTURES:
        neutral += 0.042 * gaussian(x - fx, z - fz, 31.0, 23.0)

    # A low broad aisle return keeps vertical fabric readable without turning
    # into uniform ambient fill. It weakens toward the terminated far wall.
    aisle = gaussian(x, 0.0, 58.0, 1_000.0)
    depth_falloff = 0.72 + 0.28 * max(0.0, min(1.0, (z - Z_MIN) / (Z_MAX - Z_MIN)))
    neutral += 0.012 * aisle * depth_falloff

    # Screen bounce is the only chromatic component and remains much weaker
    # than the neutral troffers. The hero receives the largest local return.
    green = 0.0
    for sx, sz, drive in SCREENS:
        green += 0.026 * drive * gaussian(x - sx, z - sz, 13.0, 17.0)

    # Desk slabs occlude ceiling return from the floor. This low-frequency mask
    # is intentionally broader than a contact shadow; the authored contact map
    # supplies the final centimetres around feet, casters, and pedestals.
    if floor_occlusion:
        occlusion = 0.0
        for dx, dz, width, depth in DESKS:
            occlusion = max(occlusion, smooth_box(x, z, dx, dz, width, depth))
        neutral *= 1.0 - 0.48 * occlusion
        green *= 1.0 - 0.2 * occlusion

    # Linear-light RGB. Green remains one hue, while neutral energy is kept
    # slightly warm-gray so the office does not drift back toward blue sci-fi.
    return (
        neutral * 0.88 + green * 0.28,
        neutral * 0.92 + green,
        neutral * 0.89 + green * 0.42,
    )


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def bake_map(output: Path, floor_occlusion: bool) -> None:
    rows = []
    for py in range(HEIGHT):
        z = Z_MAX - (py + 0.5) / HEIGHT * (Z_MAX - Z_MIN)
        row = bytearray([0])  # PNG filter type: none
        for px in range(WIDTH):
            x = X_MIN + (px + 0.5) / WIDTH * (X_MAX - X_MIN)
            red, green, blue = irradiance(x, z, floor_occlusion)
            row.extend((linear_to_srgb(red), linear_to_srgb(green), linear_to_srgb(blue), 255))
        rows.append(bytes(row))

    signature = b"\x89PNG\r\n\x1a\n"
    header = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0)
    image = zlib.compress(b"".join(rows), level=9)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(
        signature
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", image)
        + png_chunk(b"IEND", b"")
    )
    print(f"wrote {output} ({WIDTH}x{HEIGHT}, {output.stat().st_size} bytes)")


def bake() -> None:
    bake_map(OUTPUTS["volume"], floor_occlusion=False)
    bake_map(OUTPUTS["floor"], floor_occlusion=True)


if __name__ == "__main__":
    bake()
