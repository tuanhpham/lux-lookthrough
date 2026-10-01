/**
 * The page head every working page opens with (Calendar, the market pages, the
 * trading and money pages).
 *
 * The Event Calendar's head — the title and one sentence straight on the canvas, no
 * band — with one piece of the glass kept: a small tinted pill above the title, the
 * page's icon and the group it belongs to. `--c` is the page's own colour and only
 * tints that pill, so pages that share a layout still read apart.
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
  /** Under the title row (overview tiles). */
  foot?: string;
}

export function pageHero(o: HeroOpts): string {
  return `<header class="pg-hero"${o.tone ? ` style="--c:${o.tone}"` : ''}>
    <div class="pg-hero-row">
      <div class="pg-hero-text">
        <span class="pg-hero-kicker"><i class="pg-hero-ic" aria-hidden="true">${o.icon}</i>${o.kicker}</span>
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
