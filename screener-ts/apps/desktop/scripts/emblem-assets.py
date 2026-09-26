#!/usr/bin/env python3
"""Cuts the two assistant-mark assets out of the source painting.

    pip install Pillow
    python scripts/emblem-assets.py

Reads  ../../../hinhamduong.jpg  (repo root)
Writes public/images/emblem-orb.webp   192x192, the disc alone, circular alpha
       public/images/emblem.webp       640x667, the square plate, feathered edges

Both outputs are committed, so nobody needs to run this to build the app. It
exists so the crop is reproducible: the numbers below were read off the plate by
eye, and without them written down a future re-crop starts from scratch.

WHY TWO CROPS and not one image scaled twice: the whole plate at 20px is grey
mud. The disc on its own still reads at 16px, because it is three high-contrast
shapes - two lobes and two seed dots - and the dragons enter it only where they
already cross the disc. See src/ui/emblem.ts.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent.parent.parent / "hinhamduong.jpg"
DST = HERE.parent / "public" / "images"

# The taijitu on the source plate. Found from its two seed dots, which sit at
# +/- r/2 on the vertical centre line: the dark seed at (368, 437) and the glowing
# pearl at (372, 765). Their midpoint is the centre, and half their separation is
# r/2, which is a far steadier way to measure it than guessing at the smoky rim.
DISC_C = (370, 602)
DISC_R = 328

# The square plate: both heads, the disc, the pearl. Deliberately drops the top
# arc of the pale dragon's body and the tail swirl at the bottom - keeping them
# makes the crop portrait, which shrinks the heads to nothing in a square slot.
PLATE = (20, 200, 730, 940)

# Where the feather starts and ends, as a fraction of the crop's half-width.
FEATHER_IN, FEATHER_OUT = 0.74, 1.0


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


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    DST.mkdir(parents=True, exist_ok=True)

    plate = ImageEnhance.Contrast(im.crop(PLATE)).enhance(1.07)
    w, h = plate.size
    hero = feather(plate).resize((640, round(640 * h / w)), Image.LANCZOS)
    hero.save(DST / "emblem.webp", "WEBP", quality=80, method=6)

    # Cut at 4x and shrink, so the circular edge and the scale texture both stay
    # clean; cutting at 192 directly gives a stepped rim.
    size, up = 192, 192 * 4
    cx, cy = DISC_C
    disc = im.crop((cx - DISC_R, cy - DISC_R, cx + DISC_R, cy + DISC_R))
    disc = disc.resize((up, up), Image.LANCZOS)
    # The painting's pale lobe is warm grey, not white. Left alone it goes flat at
    # 16px, where the only thing carrying the symbol is lobe-against-lobe contrast.
    disc = ImageEnhance.Contrast(disc).enhance(1.18)
    disc = ImageEnhance.Brightness(disc).enhance(1.05)
    mask = Image.new("L", (up, up), 0)
    ImageDraw.Draw(mask).ellipse([2, 2, up - 3, up - 3], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(up / 260))
    disc = disc.convert("RGBA")
    disc.putalpha(mask)
    disc.resize((size, size), Image.LANCZOS).save(
        DST / "emblem-orb.webp", "WEBP", quality=90, method=6
    )

    print(f"emblem.webp {hero.size}  emblem-orb.webp ({size}, {size})")


if __name__ == "__main__":
    main()
