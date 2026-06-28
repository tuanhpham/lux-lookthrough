export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel));

export function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export const num = (v: number | null | undefined, d = 2): string =>
  v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d);

export function fmtBig(v: number | null | undefined): string {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

export const pct = (v: number | null | undefined, d = 1): string =>
  v == null ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(d) + '%';

export const money = (v: number | null | undefined, ccy = '€'): string =>
  v == null ? '—' : ccy + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A Vietnamese (HOSE) ticker — Yahoo serves these as `<TICKER>.VN`, priced in VND. */
export const isVnSymbol = (symbol: string | null | undefined): boolean =>
  !!symbol && symbol.toUpperCase().endsWith('.VN');

/**
 * Format a share price for display, picking the unit from the symbol: VND for
 * `.VN` tickers (whole đồng, grouped — e.g. `58,600 ₫`) and USD otherwise
 * (`$58.60`). Centralizes the currency choice that the tables/modal hardcoded.
 */
export function fmtPrice(v: number | null | undefined, symbol?: string): string {
  if (v == null) return '—';
  if (isVnSymbol(symbol)) return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ₫';
  return '$' + num(v);
}

/** Inline SVG country flag, 16×12px. Renders on all platforms (no emoji). */
export function flagSvg(country: 'us' | 'vn'): string {
  if (country === 'us') {
    // 13 stripes (7 red, 6 white) + blue canton with simplified star block
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" width="16" height="12" style="vertical-align:middle;border-radius:2px;flex-shrink:0" aria-hidden="true">
      <rect width="16" height="12" fill="#B22234"/>
      <rect y="0.923" width="16" height="0.923" fill="#fff"/>
      <rect y="2.769" width="16" height="0.923" fill="#fff"/>
      <rect y="4.615" width="16" height="0.923" fill="#fff"/>
      <rect y="6.462" width="16" height="0.923" fill="#fff"/>
      <rect y="8.308" width="16" height="0.923" fill="#fff"/>
      <rect y="10.154" width="16" height="0.923" fill="#fff"/>
      <rect width="7" height="6.462" fill="#3C3B6E"/>
      <text x="0.4" y="5.8" font-size="4.5" fill="#fff" font-family="serif" letter-spacing="0.3">★★★★★★</text>
      <text x="0.4" y="3.6" font-size="4.5" fill="#fff" font-family="serif" letter-spacing="0.3">★★★★★★</text>
      <text x="0.4" y="1.6" font-size="4.5" fill="#fff" font-family="serif" letter-spacing="0.3">★★★★★</text>
    </svg>`;
  }
  // Vietnam: red background, central yellow 5-pointed star
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 12" width="16" height="12" style="vertical-align:middle;border-radius:2px;flex-shrink:0" aria-hidden="true">
    <rect width="16" height="12" fill="#DA251D"/>
    <polygon points="8,1.5 9.1,4.7 12.5,4.7 9.8,6.7 10.8,9.9 8,7.9 5.2,9.9 6.2,6.7 3.5,4.7 6.9,4.7" fill="#FFFF00"/>
  </svg>`;
}

export function scoreColor(s: number): string {
  return s >= 70 ? 'var(--accent)' : s >= 40 ? 'var(--warn)' : 'var(--faint)';
}

const SIGNAL_COLORS: Record<string, string> = {
  BREAKOUT_IMMINENT: 'var(--accent)',
  CONSOLIDATING: 'var(--warn)',
  NO_SIGNAL: 'var(--faint)',
};
export function signalBadge(signal: string): string {
  const c = SIGNAL_COLORS[signal] ?? 'var(--faint)';
  const label = signal === 'BREAKOUT_IMMINENT' ? 'BREAKOUT' : signal.replace('_', ' ');
  return `<span class="badge" style="background:color-mix(in srgb,${c} 14%,transparent);color:${c};border-color:color-mix(in srgb,${c} 35%,transparent)">${label}</span>`;
}

const STAGE_COLORS: Record<number, string> = {
  1: 'var(--blue)', 2: 'var(--accent)', 3: 'var(--warn)', 4: 'var(--danger)', 0: 'var(--faint)',
};
export function stageBadge(stage: number, label: string): string {
  const c = STAGE_COLORS[stage] ?? 'var(--faint)';
  return `<span class="badge" style="background:color-mix(in srgb,${c} 14%,transparent);color:${c};border-color:color-mix(in srgb,${c} 35%,transparent)">${label}</span>`;
}
