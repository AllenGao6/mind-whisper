"""
Convert master.png into a macOS-standard app-icon master at 1024x1024:
  - Apple-style superellipse ("squircle") alpha mask so corners are transparent
  - 80% safe-area inside the 1024 canvas (centered, ~100px padding on each side)
Outputs build/icon.png. Run iconutil afterwards to refresh build/icon.icns.
"""
from PIL import Image
import os, sys

SRC = "master.png"
OUT = "build/icon.png"
CANVAS = 1024
ICON_AREA = 824                  # ~80.5% of canvas — matches Apple macOS template
SUPERELLIPSE_N = 5.0             # ~Apple "continuous corners"; 4–6 looks most native

def superellipse_mask(size, n=SUPERELLIPSE_N):
    """Return an L-mode alpha mask (255 inside the squircle, 0 outside)."""
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    a = size / 2
    inv_n = 1.0 / n
    for y in range(size):
        ny = (y - a + 0.5) / a
        ay = abs(ny) ** n
        for x in range(size):
            nx = (x - a + 0.5) / a
            v = ay + abs(nx) ** n
            # 1 inside the shape, >1 outside; soft 1-px edge for antialiasing.
            if v <= 0.985:
                px[x, y] = 255
            elif v >= 1.015:
                px[x, y] = 0
            else:
                # linear ramp across the boundary
                t = (1.015 - v) / 0.030
                px[x, y] = int(255 * max(0.0, min(1.0, t)))
    return mask

def main():
    if not os.path.exists(SRC):
        sys.exit(f"missing {SRC}")
    os.makedirs("build", exist_ok=True)

    src = Image.open(SRC).convert("RGBA")
    # 1) Resize source to the inner icon area (preserve square aspect).
    inner = src.resize((ICON_AREA, ICON_AREA), Image.LANCZOS)

    # 2) Build a squircle mask at the inner size and apply it as alpha.
    mask = superellipse_mask(ICON_AREA)
    # Combine with whatever alpha the source already had (intersect).
    src_alpha = inner.split()[3]
    combined_alpha = Image.eval(
        Image.merge("L", (Image.eval(mask, lambda v: v),)).split()[0], lambda v: v
    )
    # Multiply: final_alpha = mask * src_alpha / 255
    final_alpha = Image.eval(combined_alpha, lambda v: v)
    final_alpha = Image.merge("L", (final_alpha,)).split()[0]
    final_alpha = Image.eval(
        Image.merge("L", (final_alpha,)).split()[0],
        lambda v: v
    )
    # Cleaner: just compute multiply directly.
    from PIL import ImageChops
    final_alpha = ImageChops.multiply(mask, src_alpha)

    inner.putalpha(final_alpha)

    # 3) Paste onto a transparent 1024 canvas, centered.
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pad = (CANVAS - ICON_AREA) // 2
    canvas.paste(inner, (pad, pad), inner)

    canvas.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT}  ({CANVAS}x{CANVAS}, {os.path.getsize(OUT)} bytes)")

    # Sanity report.
    tl = canvas.getpixel((0, 0))
    center = canvas.getpixel((CANVAS // 2, CANVAS // 2))
    edge = canvas.getpixel((pad - 1, CANVAS // 2))
    print(f"  top-left   alpha={tl[3]}    (should be 0)")
    print(f"  inner edge alpha={edge[3]}  (should be 0 — outside icon area)")
    print(f"  center     alpha={center[3]} (should be 255 — visible artwork)")

if __name__ == "__main__":
    main()
