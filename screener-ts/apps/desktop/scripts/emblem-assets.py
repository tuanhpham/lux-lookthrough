#!/usr/bin/env python3
"""Builds the two assistant-mark assets from the source painting.

    pip install Pillow numpy
    python scripts/emblem-assets.py

Reads  ../../../hinhamduong.jpg  (repo root)
Writes public/images/emblem.webp       640x667, the square plate, feathered edges
       public/images/emblem-orb.webp   192x192, a shaded taijitu sphere

Both outputs are committed, so nobody needs to run this to build the app. It
exists so the two assets are reproducible: every number below was measured off
the plate, and without them written down a future re-cut starts from scratch.

── THE HERO IS A CROP. THE ICON IS NOT ─────────────────────────────────────────
The first version of the icon WAS a crop: the painting's own disc, cut at its rim.
It looked ragged, and the reason is worth keeping. The painted disc is not a clean
circle and the dragons cross it, so a circular cut chops a horn off at the top
left and a mane off at the right, then slices through cloud everywhere else. A
tidy circle full of clipped debris. It was also flat, because the painting lights
the scene, not the disc.

So the icon is BUILT: exact taijitu geometry, lit as a sphere, and surfaced with
ink sampled from the painting so it still belongs to the same picture. That keeps
the one property the mark cannot lose — the S-curve and its two seed dots survive
down to 16px, where the whole plate is grey mud. See src/ui/emblem.ts.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent.parent.parent / "hinhamduong.jpg"
DST = HERE.parent / "public" / "images"

# ── hero ────────────────────────────────────────────────────────────────────
# The square plate: both heads, the disc, the pearl. Deliberately drops the top
# arc of the pale dragon's body and the tail swirl at the bottom — keeping them
# makes the crop portrait, which shrinks the heads to nothing in a square slot.
PLATE = (20, 200, 730, 940)
# Where the feather starts and ends, as a fraction of the crop's half-width.
FEATHER_IN, FEATHER_OUT = 0.74, 1.0

# ── icon ────────────────────────────────────────────────────────────────────
# Two patches of the plate to surface the lobes with, chosen by scanning it in
# 180px blocks for the brightest and the darkest with LOW variance: a patch with
# a dragon edge or a cloud rim in it tiles as a visible seam. These two are the
# smoke below the pale dragon's tail, and the deep lobe at the top right.
PALE_PATCH = (60, 600, 240, 840)
DARK_PATCH = (540, 30, 720, 240)
# Where each lobe must land. Pinned as absolute levels, not nudged with contrast
# knobs, because lobe-against-lobe contrast is the entire mark at 16px.
PALE_LEVEL, PALE_SPREAD = 0.945, 0.042
DARK_LEVEL, DARK_SPREAD = 0.085, 0.038
SEED_R = 0.115  # each seed dot, as a fraction of the disc radius
ICON, SUPER = 192, 4  # output size, and the factor it is built at


def feather(img: Image.Image) -> Image.Image:
    """Opaque in the middle, transparent at the corners.

    Built at quarter scale and then blurred: drawing 40 concentric ellipses at
    full size leaves visible steps, and downsampling a small mask is cheaper than
    any amount of anti-aliasing on a big one.
    """
    w, h = img.size
    small = (w // 4, h // 4)
    mask = Image.new("L", small, 0)
    d = ImageDraw.Draw(mask)
    cx, cy = small[0] / 2, small[1] / 2
    rad = min(cx, cy)
    for i in range(40, 0, -1):
        t = i / 40
        r = rad * (FEATHER_IN + (FEATHER_OUT - FEATHER_IN) * t)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(255 * (1 - t) ** 0.8))
    r = rad * FEATHER_IN
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    mask = mask.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(w / 90))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def build_hero(plate: Image.Image) -> Image.Image:
    im = ImageEnhance.Contrast(plate.crop(PLATE)).enhance(1.07)
    w, h = im.size
    return feather(im).resize((640, round(640 * h / w)), Image.LANCZOS)


def _tex(plate: Image.Image, box, level: float, spread: float, n: int) -> np.ndarray:
    """A patch of the plate, renormalised to an exact mean and a gentle spread."""
    im = plate.crop(box).resize((n, n), Image.LANCZOS)
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(n * 0.0022)), np.float32) / 255.0
    return np.clip((a - a.mean()) / max(a.std(), 1e-6) * spread + level, 0, 1)


def _regions(n: int):
    """Dark-region and the two seed dots, as coverage maps in 0..1.

    The classic construction: dark is the right half, PLUS the small circle below
    centre, MINUS the small circle above it. Drawn at 3x and box-filtered down —
    the S-curve is the symbol, and a jagged one is the first thing the eye finds.
    """
    s = n * 3
    c = r = s / 2
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)
    d.pieslice([0, 0, s, s], -90, 90, fill=255)
    d.ellipse([c - r / 2, c, c + r / 2, c + r], fill=255)
    d.ellipse([c - r / 2, c - r, c + r / 2, c], fill=0)
    dark = np.asarray(m.resize((n, n), Image.BOX), np.float32) / 255.0

    def dot(cy: float) -> np.ndarray:
        k = Image.new("L", (s, s), 0)
        rr = r * SEED_R
        ImageDraw.Draw(k).ellipse([c - rr, cy - rr, c + rr, cy + rr], fill=255)
        return np.asarray(k.resize((n, n), Image.BOX), np.float32) / 255.0

    return dark, dot(c - r / 2), dot(c + r / 2)


def _light(n: int):
    """Sphere lighting: diffuse, a specular, a bounce rim, and edge falloff."""
    t = (np.arange(n, dtype=np.float32) + 0.5) / n * 2 - 1
    x, y = np.meshgrid(t, t)
    rr = x * x + y * y
    z = np.sqrt(np.clip(1 - rr, 0, 1))

    def toward(v):
        v = np.array(v, np.float32) / np.linalg.norm(v)
        return x * v[0] + y * v[1] + z * v[2]

    # Shallow on purpose. A full 0..1 Lambert ramp darkens the pale lobe's lower
    # right past the dark lobe's lit upper left, and then the S stops reading —
    # which matters more here than any amount of physical correctness.
    diffuse = 0.62 + 0.46 * np.clip(toward((-0.52, -0.58, 0.63)), 0, 1) ** 1.2
    # Halfway vector for a view down -z: specular where the key reflects at us.
    spec = np.clip(toward((-0.34, -0.40, 0.85)), 0, 1) ** 72
    # A bounce off the lower right, so the dark lobe keeps an edge on a dark theme.
    rim = np.clip(toward((0.68, 0.58, 0.45)), 0, 1) ** 10
    # Two falloffs: a broad turn-away, and a tight ring that gives the pale lobe
    # an edge on the bone-white theme, where nothing else would draw one.
    q = np.clip(rr, 0, 1)
    return diffuse * (1 - 0.26 * q ** 9 - 0.34 * q ** 44), spec, rim


def build_icon(plate: Image.Image) -> Image.Image:
    n = ICON * SUPER
    pale = _tex(plate, PALE_PATCH, PALE_LEVEL, PALE_SPREAD, n)
    dark = _tex(plate, DARK_PATCH, DARK_LEVEL, DARK_SPREAD, n)
    dmask, seed_dark, seed_pale = _regions(n)

    rgb = pale * (1 - dmask[..., None]) + dark * dmask[..., None]
    rgb = rgb * (1 - seed_dark[..., None]) + dark * seed_dark[..., None]
    rgb = rgb * (1 - seed_pale[..., None]) + pale * seed_pale[..., None]

    diffuse, spec, rim = _light(n)
    rgb = rgb * diffuse[..., None] + spec[..., None] * 0.55 + rim[..., None] * 0.13
    # The pale seed is the pearl in the painting: it glows rather than just sits.
    glow = np.asarray(
        Image.fromarray((seed_pale * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(n * 0.038)), np.float32) / 255.0
    rgb = np.clip(rgb + glow[..., None] * np.array([0.30, 0.27, 0.20], np.float32), 0, 1)

    img = Image.fromarray((rgb * 255).astype(np.uint8), "RGB").convert("RGBA")
    alpha = Image.new("L", (n, n), 0)
    ImageDraw.Draw(alpha).ellipse([1, 1, n - 2, n - 2], fill=255)
    img.putalpha(alpha.filter(ImageFilter.GaussianBlur(n / 300)))
    return img.resize((ICON, ICON), Image.LANCZOS)


def main() -> None:
    plate = Image.open(SRC).convert("RGB")
    DST.mkdir(parents=True, exist_ok=True)
    hero = build_hero(plate)
    hero.save(DST / "emblem.webp", "WEBP", quality=80, method=6)
    build_icon(plate).save(DST / "emblem-orb.webp", "WEBP", quality=92, method=6)
    print(f"emblem.webp {hero.size}  emblem-orb.webp ({ICON}, {ICON})")


if __name__ == "__main__":
    main()
