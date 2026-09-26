/**
 * The assistant's mark: a taijitu, with a dragon and a phoenix around it.
 *
 * ── WHY THIS IS TWO DRAWINGS AND NOT ONE ────────────────────────────────────
 * A dragon and a phoenix cannot resolve in 44 pixels. Rendered small they stop
 * being creatures and become a ring of grit around the disc — measurably worse
 * than no creatures at all, because the grit also eats the disc's own contrast.
 * So there are two marks and a size at which each is used:
 *
 *   ORB_MARK       a shaded taijitu sphere, and nothing else. The launcher, the
 *                  menu row, the message avatars — everything at 16–34px.
 *   GUARDIAN_MARK  the same sphere with the dragon coiled down its left and the
 *                  phoenix down its right. Used once, large, as the hero of the
 *                  panel's empty state, where there is room for it to be looked at.
 *
 * ── THE TWO EYES ────────────────────────────────────────────────────────────
 * Each half carries a dot in the OTHER half's colour: light dot in the dark
 * lobe, dark dot in the light one. That is the whole point of the symbol — each
 * side contains the seed of its opposite — so both are drawn from the same two
 * paint servers as the halves, and neither is a decoration that can be dropped.
 *
 * ── AND WHY THE GRADIENTS LIVE IN ONE SHARED <defs> ─────────────────────────
 * The mark appears in several places at once (launcher, header, one avatar per
 * reply). `url(#id)` is document-global, so inlining the gradients per copy would
 * either duplicate a dozen identical paint servers or, worse, collide on the id
 * and leave whichever copy mounted last painting all of them. `mountEmblemDefs()`
 * puts them in the document once; every instance is then pure geometry.
 *
 * The gradients are in objectBoundingBox units, which is deliberate: the same
 * `luxOrbLight` shades the 23-unit disc AND the 1.85-unit eye, each relative to
 * its own box, so a tiny eye gets a tiny highlight instead of a flat crop of a
 * big one. It is also why the dark half's shading reads as a sphere and not as a
 * gradient that happens to cross it.
 */

/** Hard-coded rather than `var(--accent)`: these need a highlight and a shade of
 *  the accent, not the accent, and the pair has to stay a legible sphere on both
 *  the near-black and the bone-white background. */
const DEFS = `
<radialGradient id="luxOrbLight" cx="34%" cy="24%" r="80%">
  <stop offset="0" stop-color="#f4fffb"/>
  <stop offset=".4" stop-color="#2ae0a6"/>
  <stop offset="1" stop-color="#0a8f63"/>
</radialGradient>
<radialGradient id="luxOrbDark" cx="34%" cy="24%" r="84%">
  <stop offset="0" stop-color="#5d6880"/>
  <stop offset=".48" stop-color="#1c1b28"/>
  <stop offset="1" stop-color="#05050b"/>
</radialGradient>
<radialGradient id="luxOrbSpec" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#fff" stop-opacity=".92"/>
  <stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<linearGradient id="luxDragon" x1=".15" y1="0" x2=".85" y2="1">
  <stop offset="0" stop-color="#d8e6ff"/>
  <stop offset=".4" stop-color="#7ea6ff"/>
  <stop offset="1" stop-color="#3159c4"/>
</linearGradient>
<linearGradient id="luxPhoenix" x1=".85" y1="0" x2=".15" y2="1">
  <stop offset="0" stop-color="#e6fff5"/>
  <stop offset=".4" stop-color="#31e3a9"/>
  <stop offset="1" stop-color="#0c9a6b"/>
</linearGradient>`;

/**
 * Not `display: none`: a hidden subtree is a safe place for paint servers in every
 * browser that matters, but zero-size and clipped is the form with no history of
 * being optimised away, and it costs one attribute more.
 */
export function mountEmblemDefs(): void {
  if (document.getElementById('lux-emblem-defs')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'lux-emblem-defs';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  svg.innerHTML = `<defs>${DEFS}</defs>`;
  document.body.appendChild(svg);
}

/**
 * The sphere alone, in a 24 box.
 *
 * The classic four-arc construction, filled rather than stroked — a stroked
 * yin-yang goes muddy at 16px. The specular ellipse and the rim stroke are what
 * turn a two-tone disc into something with a light source: the highlight sits up
 * and to the left on both halves, so they read as one object rather than as two
 * shapes that share an edge.
 */
export const ORB_MARK =
  '<svg class="yy" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">' +
  '<circle cx="12" cy="12" r="11.5" fill="url(#luxOrbLight)"/>' +
  '<path fill="url(#luxOrbDark)" d="M12 .5A11.5 11.5 0 0 1 12 23.5A5.75 5.75 0 0 1 12 12A5.75 5.75 0 0 0 12 .5Z"/>' +
  '<circle cx="12" cy="6.25" r="1.85" fill="url(#luxOrbLight)"/>' +
  '<circle cx="12" cy="17.75" r="1.85" fill="url(#luxOrbDark)"/>' +
  '<ellipse cx="9.9" cy="8.9" rx="4.5" ry="3.2" fill="url(#luxOrbSpec)" transform="rotate(-28 9.9 8.9)"/>' +
  '<circle cx="12" cy="12" r="11.5" fill="none" stroke="#fff" stroke-opacity=".18"/>' +
  '</svg>';

/**
 * The full emblem, in a 96 box with room at the edges for what leaves it.
 *
 * ── HOW THE CREATURES ARE POSED ─────────────────────────────────────────────
 * Both bodies run along a spine whose RADIUS changes: wide at the head, tight at
 * the belly, flaring again at the tail. That is the whole trick. A body at
 * constant radius traces a circle, and no amount of head detail stops a circle
 * from reading as a broken ring drawn around the disc — which is exactly what the
 * first four attempts at this looked like.
 *
 * They are also deliberately different MASSES, not the same animal with different
 * heads: the dragon is lean and spined (mane, horns, barbel, clawed leg), the
 * phoenix is a smooth crescent wing and three long tail plumes. At a glance the
 * silhouettes are told apart before any detail is; give the phoenix flight
 * feathers and it turns into a second dragon.
 *
 * Azure for the dragon and jade for the phoenix, which is both the traditional
 * pairing and the app's own two accents, so the mark needs no third hue.
 */
export const GUARDIAN_MARK = `<svg class="lux-emblem" viewBox="-4 -6 104 104" aria-hidden="true" focusable="false">
  <g fill="url(#luxDragon)">
    <path d="M25.8 10.1C24.2 11.9 18.6 16.6 16.2 20.9C13.8 25.2 12.2 30.9 11.6 35.7C11 40.5 11.6 45.4 12.3 49.6C13.1 53.8 14.6 57.1 16 60.7C17.5 64.3 19.1 68 21.2 71.3C23.2 74.6 25.9 77.8 28.4 80.6C30.9 83.5 34.6 87.2 36 88.3C37.5 89.5 37.9 89.1 37.1 87.4C36.3 85.8 33 81.7 31.1 78.6C29.2 75.5 27.2 72.2 25.8 68.9C24.3 65.5 23.3 61.9 22.5 58.5C21.6 55.2 20.9 52.1 20.7 48.6C20.5 45.1 20.6 41.1 21.4 37.4C22.3 33.7 23.5 29.7 25.6 26.3C27.6 22.9 32.3 18.5 33.6 17Z"/>
    <path d="M21.4 22.3Q16.1 22.2 11.9 25.4Q17.2 25.5 21.4 22.3ZM15.6 30.1Q10.7 31.5 7.8 35.7Q12.7 34.3 15.6 30.1ZM12.1 39Q8.2 41.9 7 46.6Q11 43.8 12.1 39Z"/>
    <path d="M18.4 60.6C15.4 63.4 13.8 67.2 13.6 71.4C15.4 68 17.8 65.4 20.8 63.6ZM14.8 68.4C12.2 70 10.4 72.6 9.8 75.6C11.8 73.6 14 72.2 16.4 71.6Z"/>
    <path d="M38.4 84.4C42.8 85.8 46.2 88.8 47.8 92.8C43.8 90.2 39.6 88.4 35.2 87.6Z"/>
    <g transform="translate(36 12) scale(1.2) translate(-36 -12)">
      <path d="M31.2 7C27.8 4.4 24.2 3 20.4 2.8C23.8 4.4 26.8 6.6 29 9.6ZM35.4 4.6C34 2.2 31.8 .6 29.2 0C31.2 1.8 32.6 4 33.4 6.4Z"/>
      <path d="M32.4 18C29.8 20 28 22.8 27.4 26C28.8 23.4 30.8 21.4 33.4 20.2Z"/>
      <path d="M29.6 18.4C25.8 14.8 26.4 9.4 30.6 6.6C34.4 4 39.4 4.4 43.8 6.2C46.4 7.3 48.4 8.6 49.6 10.2C50.4 11.3 50 12.2 48.6 12C46.4 11.7 43.8 10.9 41.8 11C39.6 11.1 39 12.6 40 14.2C40.8 15.5 42.4 16.8 41.6 18.2C40.6 19.9 36.4 19.6 33 18.8Z"/>
      <path d="M48.8 12.4C51.6 13.6 53.8 15.6 54.6 18.2C52 16.8 48.8 15.4 45.6 14.8C44.2 14.5 44.2 13 45.6 12.8Z"/>
      <circle cx="34.4" cy="11.2" r="1.5" fill="#0b1226"/>
    </g>
  </g>
  <g fill="url(#luxPhoenix)">
    <path d="M62.4 17C63.7 18.5 68.4 22.9 70.4 26.3C72.5 29.7 73.7 33.7 74.6 37.4C75.4 41.1 75.5 45.1 75.3 48.6C75.1 52.1 74.4 55.2 73.5 58.5C72.7 61.9 71.7 65.5 70.2 68.9C68.8 72.2 66.8 75.5 64.9 78.6C63 81.7 59.7 85.8 58.9 87.4C58.1 89.1 58.5 89.5 60 88.3C61.4 87.2 65.1 83.5 67.6 80.6C70.1 77.8 72.8 74.6 74.8 71.3C76.9 68 78.5 64.3 80 60.7C81.4 57.1 82.9 53.8 83.7 49.6C84.4 45.4 85 40.5 84.4 35.7C83.8 30.9 82.2 25.2 79.8 20.9C77.4 16.6 71.8 11.9 70.2 10.1Z"/>
    <path d="M73.3 69.2Q73.3 78 78.9 84.8Q78.8 76 73.3 69.2ZM67.4 74.7Q65.8 84.2 69.9 92.9Q71.5 83.4 67.4 74.7ZM60.4 78.6Q56.1 85.2 57.6 93Q61.8 86.3 60.4 78.6Z"/>
    <path d="M76.7 25.8C77.7 27.1 81.2 31.1 82.8 33.7C84.3 36.4 85.3 38.9 86 41.6C86.6 44.2 86.8 47 86.5 49.7C86.2 52.5 84.1 56.5 83.9 58C83.7 59.5 83.6 59.9 85.2 58.9C86.7 58 91.5 55.4 93.3 52.1C95.1 48.9 96.6 43.2 95.7 39.3C94.9 35.5 91.2 31.4 88.1 28.9C85.1 26.5 79.3 25.4 77.6 24.7Z"/>
    <g transform="translate(66 11) scale(1.2) translate(-66 -11)">
      <path d="M71.3 10.7Q78 13.2 85 12.2Q78.4 9.7 71.3 10.7ZM77.4 15.3Q84.1 18.7 91.5 18.6Q84.9 15.2 77.4 15.3Z"/>
      <path d="M64.2 7.2L52 2.4L62.9 12.9Z"/>
      <path d="M68.4 5.2C71.6 5.2 74.2 7.8 74.2 11C74.2 14.4 71.6 17 68.4 17C65.2 17 62.6 14.4 62.6 11C62.6 7.8 65.2 5.2 68.4 5.2Z"/>
      <circle cx="69.4" cy="11" r="1.5" fill="#07231a"/>
    </g>
  </g>
  <circle cx="48" cy="48" r="23" fill="url(#luxOrbLight)"/>
  <path fill="url(#luxOrbDark)" d="M48 25A23 23 0 0 1 48 71A11.5 11.5 0 0 1 48 48A11.5 11.5 0 0 0 48 25Z"/>
  <circle cx="48" cy="36.5" r="3.7" fill="url(#luxOrbLight)"/>
  <circle cx="48" cy="59.5" r="3.7" fill="url(#luxOrbDark)"/>
  <ellipse cx="39.6" cy="35.6" rx="9" ry="6.4" fill="url(#luxOrbSpec)" transform="rotate(-28 39.6 35.6)"/>
  <circle cx="48" cy="48" r="23" fill="none" stroke="#fff" stroke-opacity=".18"/>
</svg>`;
