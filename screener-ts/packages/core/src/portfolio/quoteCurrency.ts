/**
 * The currency a symbol's quotes come in, read from its Yahoo exchange suffix.
 *
 * ── WHY THE SUFFIX, AND NOT THE FUNDAMENTALS ────────────────────────────────
 * Yahoo does report a currency per symbol, but only on a fundamentals call — and
 * every place that needs this (turning a close into account money, drawing a plan
 * in the box currency) has bars in hand, not fundamentals. The suffix is on the
 * symbol itself, so the answer is synchronous and cannot be missing.
 *
 * `null` means "a market this app has no rate for" (London in pence, Zurich in
 * francs, Tokyo…). Callers must refuse or flag that, never treat it as dollars:
 * a quote read in the wrong currency is off by the whole exchange rate, silently.
 */
export type QuoteCurrency = 'USD' | 'EUR' | 'VND';

/** Euro-area venues Yahoo serves: Xetra, Frankfurt and the German regionals, Euronext, Milan, Madrid, Vienna, Helsinki, Dublin. */
const EUR_SUFFIXES = new Set([
  'DE', 'F', 'BE', 'DU', 'MU', 'SG', 'HA',
  'PA', 'AS', 'BR', 'LS', 'MI', 'MC', 'VI', 'HE', 'IR',
]);
const VND_SUFFIXES = new Set(['VN', 'HN', 'HNX', 'UP', 'UPCOM']);
/** One-letter suffixes that ARE venues (London, Tokyo, TSX Venture), not US share classes. */
const ONE_LETTER_VENUES = new Set(['L', 'T', 'V']);

export function quoteCurrencyOf(symbol: string): QuoteCurrency | null {
  const s = symbol.trim().toUpperCase();
  const dot = s.lastIndexOf('.');
  if (dot < 0) return 'USD';
  const suffix = s.slice(dot + 1);
  // A one-letter "suffix" is a US share class (BRK.B, BF.B), not a venue.
  if (suffix.length === 1 && !EUR_SUFFIXES.has(suffix) && !ONE_LETTER_VENUES.has(suffix)) return 'USD';
  if (EUR_SUFFIXES.has(suffix)) return 'EUR';
  if (VND_SUFFIXES.has(suffix)) return 'VND';
  return null;
}
