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
  return `<span class="badge" style="background:color-mix(in srgb,${c} 16%,transparent);color:${c}">${label}</span>`;
}

const STAGE_COLORS: Record<number, string> = {
  1: 'var(--blue)', 2: 'var(--accent)', 3: 'var(--warn)', 4: 'var(--danger)', 0: 'var(--faint)',
};
export function stageBadge(stage: number, label: string): string {
  const c = STAGE_COLORS[stage] ?? 'var(--faint)';
  return `<span class="badge" style="background:color-mix(in srgb,${c} 16%,transparent);color:${c}">${label}</span>`;
}
