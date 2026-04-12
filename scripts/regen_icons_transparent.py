"""
Regenerera app-ikoner från icon-master-1024.png: gör yttre vit kanvas transparent
(flood fill från kanter via nästan-vita pixlar) och exportera samma storlekar som tidigare.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ICONS_DIR = Path(__file__).resolve().parent.parent / "icons"
MASTER = ICONS_DIR / "icon-master-1024.png"

# Endast mycket ljusa pixlar räknas som "bakgrund" så flödet inte läcker in i ikonen.
WHITE_MIN = 252


def flood_transparent_edge_rgba(arr: np.ndarray) -> np.ndarray:
    """RGBA uint8. Sätter alpha=0 för pixlar som nås från bildkanten via ljusa pixlar."""
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.int16)
    light = (rgb[:, :, 0] >= WHITE_MIN) & (rgb[:, :, 1] >= WHITE_MIN) & (rgb[:, :, 2] >= WHITE_MIN)

    out = arr.copy()
    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        out[y, x, 3] = 0
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and light[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    return out


def alpha_bbox(arr: np.ndarray) -> tuple[int, int, int, int]:
    a = arr[:, :, 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return 0, 0, arr.shape[1], arr.shape[0]
    pad = max(2, int(0.01 * max(arr.shape[0], arr.shape[1])))
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    y0 = max(0, y0 - pad)
    x0 = max(0, x0 - pad)
    y1 = min(arr.shape[0] - 1, y1 + pad)
    x1 = min(arr.shape[1] - 1, x1 + pad)
    return x0, y0, x1 + 1, y1 + 1


def main() -> None:
    if not MASTER.is_file():
        raise SystemExit(f"Saknas master: {MASTER}")

    base = np.array(Image.open(MASTER).convert("RGBA"))
    rgba = flood_transparent_edge_rgba(base)
    x0, y0, x1, y1 = alpha_bbox(rgba)
    cropped = rgba[y0:y1, x0:x1]
    src = Image.fromarray(cropped, "RGBA")

    outputs = [
        ("favicon-32.png", 32),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("apple-touch-icon.png", 180),
        ("icon-maskable-192.png", 192),
        ("icon-maskable-512.png", 512),
    ]

    for name, size in outputs:
        out_path = ICONS_DIR / name
        resized = src.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(out_path, "PNG", optimize=True)
        print("Wrote", out_path, resized.size)

    print("Klar.")


if __name__ == "__main__":
    main()
