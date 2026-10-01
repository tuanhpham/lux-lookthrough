/**
 * The page hero for the market pages (Top Picks, Screener, Sectors, Scanner).
 *
 * The same material as the Learn cover and the Settings tiles: a glass band with a
 * tinted icon badge, a small kicker line saying which group the page belongs to, the
 * real title and one sentence. `--c` is the page's own colour — it tints the badge
 * and the glow in the corner, so four pages that share a layout still read apart.
 *
 * Every string is trusted HTML from the caller (i18n text and flag SVGs); nothing a
 * user typed goes through here.
 */
export interface HeroOpts {
  icon: string;
  kicker: string;
  title: string;
  sub: string;
  /** A CSS colour, e.g. `var(--blue)`. */
  tone?: string;
  /** Right-hand slot on the title row (a status strip, a button). */
  side?: string;
  /** Under the title row, inside the band (overview tiles). */
  foot?: string;
}

export function pageHero(o: HeroOpts): string {
  return `<header class="pg-hero"${o.tone ? ` style="--c:${o.tone}"` : ''}>
    <div class="pg-hero-row">
      <span class="pg-hero-ic" aria-hidden="true">${o.icon}</span>
      <div class="pg-hero-text">
        <span class="pg-hero-kicker">${o.kicker}</span>
        <h1>${o.title}</h1>
        <p class="subtitle">${o.sub}</p>
      </div>
      ${o.side ? `<div class="pg-hero-side">${o.side}</div>` : ''}
    </div>
    ${o.foot ?? ''}
  </header>`;
}

/**
 * A numbered label for a control row: `01  Strategy`. The number gives a long
 * filter panel the same spine the Learn chapters and the playbook dialog have.
 */
export const stepLabel = (n: number, label: string): string =>
  `<span class="pg-step"><i>${String(n).padStart(2, '0')}</i>${label}</span>`;
