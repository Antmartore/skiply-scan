#!/usr/bin/env python3
"""Generate Skiply PWA icons from the SVG wordmark checkmark.

The wordmark in index.html is the path M2 20 L16 6 L27 17 (viewBox 36x26),
stroke #0A64BC, round caps/joins, on the navy void #04070d. This renders it
as PNGs at the sizes PWA installs need. Run from repo root:

    python3 scripts/gen_icons.py

Requires: pip install Pillow
"""
from PIL import Image, ImageDraw
from pathlib import Path

VOID = (4, 7, 13, 255)        # --void #04070d
BLUE = (10, 100, 188, 255)    # --blue #0A64BC
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

# Wordmark path points in its 36x26 viewBox, stroke-width 5.5
PTS = [(2, 20), (16, 6), (27, 17)]
VBW, VBH = 36, 26
STROKE = 5.5


def draw_mark(size: int, content_frac: float, fname: str, rounded: bool):
    """Render the checkmark centered on a void background.

    content_frac: fraction of the canvas the mark spans (maskable icons
    need a smaller mark so the safe zone survives circular crops).
    """
    ss = 4  # supersample for clean edges
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=VOID)
    else:
        d.rectangle([0, 0, S - 1, S - 1], fill=VOID)

    # scale the 36x26 viewBox into the content box, centered
    box = S * content_frac
    scale = box / max(VBW, VBH)
    w, h = VBW * scale, VBH * scale
    ox, oy = (S - w) / 2, (S - h) / 2
    pts = [(ox + x * scale, oy + y * scale) for x, y in PTS]
    lw = max(1, int(round(STROKE * scale)))

    d.line(pts, fill=BLUE, width=lw, joint="curve")
    r = lw / 2
    for (x, y) in (pts[0], pts[-1]):  # round caps
        d.ellipse([x - r, y - r, x + r, y + r], fill=BLUE)

    img = img.resize((size, size), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / fname)
    print(f"  {fname}  {size}x{size}")


if __name__ == "__main__":
    print("Generating Skiply icons →", OUT)
    draw_mark(192, 0.62, "icon-192.png", rounded=False)
    draw_mark(512, 0.62, "icon-512.png", rounded=False)
    draw_mark(512, 0.46, "icon-512-maskable.png", rounded=False)
    draw_mark(180, 0.62, "apple-touch-icon.png", rounded=False)
