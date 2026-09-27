#!/usr/bin/env python3
"""Builds the assistant's three image assets from the three source plates.

    pip install Pillow numpy
    python scripts/emblem-assets.py

Reads  ../../../hinhamduong.jpg        the dragon/phoenix painting
       ../../../hinhnenamduong2.jpg    a sculpted taijitu disc on flat grey
       ../../../hinhnenamduong3.jpg    a neon taijitu ring around a tree
Writes public/images/emblem.webp       640x667  the square plate, feathered edges
       public/images/emblem-orb.webp   192x192  the disc, for every small use
       public/images/chat-top.webp     880x528  the chat panel's top background

All three outputs are committed, so nobody needs to run this to build the app. It
exists so the assets are reproducible: every number below was measured off a
plate, and without them written down a future re-cut starts from scratch.

── WHY THE ICON IS A CROP AGAIN ────────────────────────────────────────────────
It was a crop of the painting first, and that failed: the painted disc is not a
true circle and the dragons cross it, so a circular cut chopped off a horn and a
mane and left a tidy ring full of clipped debris. So it was BUILT instead —
taijitu geometry, lit as a sphere, surfaced with ink sampled from the painting.

`hinhnenamduong2.jpg` makes the drawn version pointless. It is already what the
drawing was imitating: one sculpted disc, a true circle, centred on flat grey with
nothing crossing its rim — so the circle can simply be cut out, and the result has
the relief, the cloud detail and the two moons that no amount of gradient work
produced. The geometry code is gone; git remembers it.

── WHY THE NEW BACKGROUND IS TREATED SO HARD ───────────────────────────────────
`hinhnenamduong3.jpg` is gorgeous and completely foreign to this app: saturated
magenta and cyan against a UI of near-black, hairline borders and ONE mint accent.
Dropped in as-is it looks like someone else's wallpaper showing through. So it is
pushed through a duotone (ink → mint-tinted highlight) with a little of its own
chroma left in, dimmed, and faded to nothing at the bottom and sides. What
survives is the shape — the ring, the tree, the moon — as atmosphere behind the
top of the panel rather than a picture pasted into it.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent.parent
SRC_PAINTING = ROOT / "hinhamduong.jpg"
SRC_DISC = ROOT / "hinhnenamduong2.jpg"
SRC_SCENE = ROOT / "hinhnenamduong3.jpg"
DST = HERE.parent / "public" / "images"

# ── hero plate ──────────────────────────────────────────────────────────────
# The square plate: both heads, the disc, the pearl. Deliberately drops the top
# arc of the pale dragon's body and the tail swirl at the bottom — keeping them
# makes the crop portrait, which shrinks the heads to nothing in a square slot.
PLATE = (20, 200, 730, 940)
# Where the feather starts and ends, as a fraction of the crop's half-width.
FEATHER_IN, FEATHER_OUT = 0.74, 1.0

# ── icon ────────────────────────────────────────────────────────────────────
# The disc in `hinhnenamduong2.jpg`, measured by masking the flat grey ground
# (luminance > 72, or blue-over-red > 10 for the dark lobe, which is nearly as
# dark as the ground but not as neutral) and taking the widest row as the
# diameter: centre (399, 830), radius 394.
DISC_CX, DISC_CY, DISC_R = 399, 830, 394
# A hair inside the measured rim, so the crop cannot catch a pixel of grey ground
# on the outside of the black edge.
DISC_INSET = 4
ICON, ICON_SUPER = 192, 3
# The source is a photograph of relief and reads slightly soft at 22px. A gentle
# lift, applied before the downsample: enough that the S-curve holds at 16px,
# not enough to crush the cloud detail into white.
ICON_CONTRAST, ICON_SHARPEN = 1.10, 1.18

# ── chat background ─────────────────────────────────────────────────────────
# A landscape band: the ring, the tree and the moon, with the blossom corners
# kept (they are what makes it not-a-circle) and the bottom quarter of water
# dropped, because that part of the frame is under the panel's text.
BAND_CROP = (0, 0, 800, 480)
# Same 5:3 as the crop. Deliberately checked: an 8% vertical stretch turned the
# ring into an egg, which is the one thing this image cannot afford.
BAND_W, BAND_H = 880, 528
# How much of the original colour survives the duotone. 0 = grey, 1 = untouched.
BAND_CHROMA = 0.30
# The duotone ends: the app's own near-black, and a mint-tinted paper white.
BAND_INK = np.array([0.043, 0.055, 0.070], np.float32)
BAND_LIT = np.array([0.807, 0.933, 0.878], np.float32)
# Overall dim, and the gamma that decides how much of the frame stays dark. > 1
# pushes the midtones down, which is what keeps the sky reading as a night sky.
BAND_DIM, BAND_GAMMA = 0.88, 1.22


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


def build_orb(disc: Image.Image) -> Image.Image:
    """Cut the sculpted disc out of its grey ground, as a circle.

    Worked at 3x and downsampled, for the same reason as everything else here:
    the rim is a hard edge against transparency, and a 192px ellipse mask drawn
    directly has visible stair-steps on the shoulders.
    """
    n = ICON * ICON_SUPER
    r = DISC_R - DISC_INSET
    box = (DISC_CX - r, DISC_CY - r, DISC_CX + r, DISC_CY + r)
    im = disc.crop(box).resize((n, n), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(ICON_CONTRAST)
    im = ImageEnhance.Sharpness(im).enhance(ICON_SHARPEN)

    img = im.convert("RGBA")
    alpha = Image.new("L", (n, n), 0)
    ImageDraw.Draw(alpha).ellipse([1, 1, n - 2, n - 2], fill=255)
    # One pixel of softness at the output size, no more: any blurrier and the
    # 16px copy loses its edge against a dark panel.
    img.putalpha(alpha.filter(ImageFilter.GaussianBlur(ICON_SUPER * 0.9)))
    return img.resize((ICON, ICON), Image.LANCZOS)


def _duotone(a: np.ndarray) -> np.ndarray:
    """Luminance → ink..lit, with a fraction of the original chroma mixed back."""
    lum = (a * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(axis=2, keepdims=True)
    lum = np.clip(lum, 0, 1) ** BAND_GAMMA
    duo = BAND_INK + (BAND_LIT - BAND_INK) * lum
    # The chroma is added as a DEVIATION from the source's own luminance, so a
    # pale pink blossom stays pale and only the hue leaks through.
    return np.clip(duo + (a - lum) * BAND_CHROMA, 0, 1) * BAND_DIM


def _band_alpha(w: int, h: int) -> Image.Image:
    """Opaque at the top, gone at the bottom, soft at both sides.

    The bottom fade is the whole trick: it is what makes the image the panel's
    BACKGROUND rather than a picture with an edge. The top stays solid because it
    runs under the panel header, where an edge would be visible as a band.
    """
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    # Flat for the first third, then a long ease to zero.
    vert = np.clip((1 - np.clip((y - 0.30) / 0.70, 0, 1)) ** 1.35, 0, 1)
    x = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
    side = np.clip(1 - np.clip((np.abs(x) - 0.62) / 0.38, 0, 1) ** 1.6, 0, 1)
    return Image.fromarray((np.clip(vert * side, 0, 1) * 255).astype(np.uint8), "L")


def build_band(scene: Image.Image) -> Image.Image:
    im = scene.crop(BAND_CROP).resize((BAND_W, BAND_H), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    out = Image.fromarray((_duotone(a) * 255).astype(np.uint8), "RGB").convert("RGBA")
    out.putalpha(_band_alpha(BAND_W, BAND_H))
    return out


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    hero = build_hero(Image.open(SRC_PAINTING).convert("RGB"))
    hero.save(DST / "emblem.webp", "WEBP", quality=80, method=6)
    build_orb(Image.open(SRC_DISC).convert("RGB")).save(
        DST / "emblem-orb.webp", "WEBP", quality=92, method=6
    )
    band = build_band(Image.open(SRC_SCENE).convert("RGB"))
    band.save(DST / "chat-top.webp", "WEBP", quality=82, method=6)
    print(f"emblem.webp {hero.size}  emblem-orb.webp ({ICON}, {ICON})  chat-top.webp {band.size}")


if __name__ == "__main__":
    main()
