/**
 * The assistant's mark: the taijitu with its two dragons.
 *
 * ── WHY THIS IS A PICTURE AND NOT A DRAWING IN CODE ─────────────────────────
 * This was built as hand-written SVG first, twice: polar spines whose radius
 * varies so the body coils instead of tracing a ring, tapered ribbons, manes,
 * antlers, barbels, clawed legs, the lot. It got as far as "recognisably a
 * dragon" and stopped there, because what makes an Asian dragon beautiful is
 * brushwork — scale texture, ink density, the way smoke dissolves — and paths
 * with gradients have none of it. Side by side with the painting this is cut
 * from, it was not a close call.
 *
 * So the artwork IS the mark. `hinhamduong.jpg` at the repo root is the source
 * plate, and `scripts/emblem-assets.py` builds both files below from it, so they
 * are build artefacts and not mysteries that arrived from an image editor.
 *
 * ── TWO MARKS, NOT ONE IMAGE AT TWO SIZES ───────────────────────────────────
 *   emblem-orb.webp  the disc, for every small use — launcher, menu row, panel
 *                    header, message avatars, all 16–34px. NOT a crop of the
 *                    painting: the painted disc is not a true circle and the
 *                    dragons cross it, so cutting a circle out of it lopped off a
 *                    horn and a mane and left a tidy ring full of clipped debris.
 *                    It is drawn instead — exact taijitu geometry, lit as a
 *                    sphere, surfaced with ink sampled from the plate so it still
 *                    belongs to the same picture. The whole plate at 20px is grey
 *                    mud; this keeps the S-curve and its two dots down to 16.
 *   emblem.webp      the square plate: both heads, the disc, the pearl. Feathered
 *                    to transparent at the edges, so the smoke sits on the
 *                    near-black theme and the bone-white one alike instead of
 *                    being a photo pasted into a panel. Used once, large, as the
 *                    hero of the empty state, where there is room to look at it.
 *
 * ── THE TWO EYES ────────────────────────────────────────────────────────────
 * Each half carries a dot in the other's colour — the dark seed high in the pale
 * lobe, the pale one low in the dark. That is the whole point of the symbol, and
 * the reason the disc had to be the small mark rather than a monogram: at 16px it
 * is still three shapes that mean something.
 *
 * ── WHY <img> AND NOT A CSS BACKGROUND ──────────────────────────────────────
 * Both keep the `.yy` / `.lux-emblem` class the inline SVG used, so every size
 * rule in styles.css carries over untouched. `width`/`height` are stated on the
 * element so the intrinsic ratio is known before the bytes arrive and the empty
 * state does not reflow when the hero lands; CSS still decides the drawn size.
 * `decoding="async"` keeps a 640px plate off the main thread — the panel opens on
 * a click, and a synchronous decode there is a visible hitch.
 */

/** The disc, for everything small. */
export const ORB_MARK =
  '<img class="yy" src="/images/emblem-orb.webp" width="192" height="192"' +
  ' alt="" aria-hidden="true" draggable="false" decoding="async">';

/** The full plate, for the one place with room for it. */
export const GUARDIAN_MARK =
  '<img class="lux-emblem" src="/images/emblem.webp" width="640" height="667"' +
  ' alt="" aria-hidden="true" draggable="false" decoding="async">';
