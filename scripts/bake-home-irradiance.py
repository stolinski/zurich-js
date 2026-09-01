#!/usr/bin/env python3
"""Bake the home room's screen/doorway indirect irradiance fields."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

WIDTH, HEIGHT = 312, 198
X_MIN, X_MAX = -78.0, 78.0
Z_MIN, Z_MAX = -64.0, 35.0
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public/textures/lightmaps"


def gaussian(dx: float, dz: float, sx: float, sz: float) -> float:
    return math.exp(-0.5 * ((dx / sx) ** 2 + (dz / sz) ** 2))


def smooth_box(x: float, z: float, width: float, depth: float) -> float:
    edge = 7.0
    dx = width * 0.5 - abs(x)
    dz = depth * 0.5 - abs(z + 1.5)
    return max(0.0, min(1.0, min(dx, dz) / edge))


def linear_to_srgb(value: float) -> int:
    value = max(0.0, min(1.0, value))
    encoded = value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
    return round(encoded * 255)


def sample(x: float, z: float, floor: bool) -> tuple[float, float, float]:
    # Screen bounce spreads across the desk and lower room envelope. A smaller
    # broad lobe behind the CRT represents the desk returning light to the wall.
    screen = 0.055 * gaussian(x, z - 6.0, 35.0, 27.0)
    wall_return = 0.016 * gaussian(x, z + 50.0, 48.0, 24.0)

    # The open doorway is neutral, finite, and localized to the left rear. It
    # separates silhouettes without turning into ambient fill.
    doorway = 0.03 * gaussian(x + 50.0, z + 58.0, 19.0, 22.0)
    window = 0.009 * gaussian(x - 36.0, z + 60.0, 23.0, 16.0)
    neutral = 0.003 + doorway + window
    green = screen + wall_return

    if floor:
        under_desk = smooth_box(x, z, 132.0, 43.0)
        neutral *= 1.0 - 0.4 * under_desk
        green *= 1.0 - 0.3 * under_desk

    return (
        neutral * 0.91 + green * 0.3,
        neutral * 0.95 + green,
        neutral * 0.92 + green * 0.46,
    )


def chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def bake(path: Path, floor: bool) -> None:
    rows = []
    for py in range(HEIGHT):
        z = Z_MAX - (py + 0.5) / HEIGHT * (Z_MAX - Z_MIN)
        row = bytearray([0])
        for px in range(WIDTH):
            x = X_MIN + (px + 0.5) / WIDTH * (X_MAX - X_MIN)
            r, g, b = sample(x, z, floor)
            row.extend((linear_to_srgb(r), linear_to_srgb(g), linear_to_srgb(b), 255))
        rows.append(bytes(row))
    signature = b"\x89PNG\r\n\x1a\n"
    header = struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        signature
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )
    print(f"wrote {path} ({WIDTH}x{HEIGHT}, {path.stat().st_size} bytes)")


if __name__ == "__main__":
    bake(OUTPUT_DIR / "home-irradiance.png", floor=False)
    bake(OUTPUT_DIR / "home-floor-irradiance.png", floor=True)
