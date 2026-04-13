"""
Remove edge-connected background from PWA PNGs (flood-fill from borders).
Uses average corner RGB as reference; only pixels connected to image border are cleared.
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image


def strip_edge_background(im: Image.Image, tolerance: float = 42) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    r0 = sum(c[0] for c in corners) / 4
    g0 = sum(c[1] for c in corners) / 4
    b0 = sum(c[2] for c in corners) / 4

    def is_bg(r: int, g: int, b: int, a: int) -> bool:
        if a < 40:
            return True
        dr, dg, db = r - r0, g - g0, b - b0
        return (dr * dr + dg * dg + db * db) ** 0.5 <= tolerance

    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if visited[x][y]:
            return
        r, g, b, a = px[x, y][:4]
        if not is_bg(r, g, b, a):
            return
        visited[x][y] = True
        q.append((x, y))

    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y][:4]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                r2, g2, b2, a2 = px[nx, ny][:4]
                if is_bg(r2, g2, b2, a2):
                    visited[nx][ny] = True
                    q.append((nx, ny))

    return im


def main() -> int:
    root = Path(__file__).resolve().parent.parent / "icons"
    names = [
        "apple-touch-icon.png",
        "favicon-32.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-192.png",
        "icon-maskable-512.png",
    ]
    tol = float(sys.argv[1]) if len(sys.argv) > 1 else 42
    for name in names:
        path = root / name
        if not path.is_file():
            print(f"skip missing {path}", file=sys.stderr)
            continue
        im = Image.open(path)
        out = strip_edge_background(im, tolerance=tol)
        out.save(path, optimize=True)
        print(f"ok {name} {im.size[0]}x{im.size[1]} tolerance={tol}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
