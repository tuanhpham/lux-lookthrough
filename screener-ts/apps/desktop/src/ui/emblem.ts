/**
 * The assistant's mark: the taijitu disc.
 *
 * ── WHY THIS IS A PICTURE AND NOT A DRAWING IN CODE ─────────────────────────
 * This was built as hand-written SVG first, twice: polar spines whose radius
 * varies so the body coils instead of tracing a ring, tapered ribbons, manes,
 * antlers, barbels, clawed legs, the lot. It got as far as "recognisably a
 * dragon" and stopped there, because what makes an Asian dragon beautiful is
 * brushwork — scale texture, ink density, the way smoke dissolves — and paths
 * with gradients have none of it. Side by side with the painting it was cut
 * from, it was not a close call.
 *
 * So the artwork IS the mark. The source plates sit at the repo root and
 * `scripts/emblem-assets.py` builds the files below from them, so they are build
 * artefacts and not mysteries that arrived from an image editor.
 *
 * ── THE ICON IS A CROP AGAIN ────────────────────────────────────────────────
 * `emblem-orb.webp` is used everywhere small — launcher, menu row, panel header,
 * message avatars, all 16–34px. It went through three versions:
 *   1. a circle cut from `hinhamduong.jpg`. Failed: that painted disc is not a
 *      true circle and the dragons cross it, so the cut lopped off a horn and a
 *      mane and left a tidy ring full of clipped debris.
 *   2. drawn — exact taijitu geometry, lit as a sphere, ink sampled from the
 *      painting. Recognisable, and flat next to the real thing.
 *   3. what it is now: a circle cut from `hinhnenamduong2.jpg`, a sculpted disc
 *      photographed on flat grey with nothing crossing its rim. It has the
 *      relief, the cloud detail and the two moons that no gradient produced.
 * Each half carries a dot in the other's colour — the dark seed high in the pale
 * lobe, the pale one low in the dark. That is the whole point of the symbol, and
 * the reason the disc is the small mark rather than a monogram: at 16px it is
 * still three shapes that mean something.
 *
 * ── THE PLATE IS NO LONGER MOUNTED ──────────────────────────────────────────
 * `emblem.webp` (the square painting: both heads, the disc, the pearl) is still
 * built and committed, but nothing renders it. It was the chat panel's empty
 * state, and that panel's top is a photograph now (`.chat-shell::before`), so the
 * plate ended up as a second taijitu inside the picture's ring. Putting it back
 * anywhere with room is one `<img>`; the numbers that cut it are in the script.
 *
 * ── WHY <img> AND NOT A CSS BACKGROUND ──────────────────────────────────────
 * It keeps the `.yy` class the inline SVG used, so every size rule in styles.css
 * carries over untouched. `width`/`height` are stated on the element so the
 * intrinsic ratio is known before the bytes arrive, and nothing reflows when the
 * image lands. `decoding="async"` keeps the decode off the main thread — the
 * panel opens on a click, and a synchronous decode there is a visible hitch.
 */

/**
 * The disc, for everything.
 *
 * `?v=` because the filename is stable while its bytes are not: Pages serves it
 * `cache-control: max-age=86400`, so re-cutting the art and pushing leaves every
 * browser that has already seen the old one showing it for another day. Bump the
 * number whenever `emblem-assets.py` produces different bytes — v3 is the crop of
 * the sculpted disc, v2 was the drawn sphere.
 */
export const ORB_MARK =
  '<img class="yy" src="/images/emblem-orb.webp?v=3" width="192" height="192"' +
  ' alt="" aria-hidden="true" draggable="false" decoding="async">';
