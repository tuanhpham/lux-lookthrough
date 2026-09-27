/**
 * "Which trading day's closing prices should we already have?"
 *
 * The portfolio only ever needed a manual Update because nothing knew when a new
 * closing price existed. Answering that is the whole of this module: a pure
 * function of the clock, so the auto-refresh can be tested without a market.
 *
 * Everything here is New York time, because every ticker in the portfolio is a US
 * listing priced by Yahoo in USD — the user's own wall clock (Europe) is a red
 * herring, and using it would refresh at 16:00 CET, hours before the close.
 */

/** Regular-session close, New York time. */
const CLOSE_HOUR = 16;

/**
 * Hours after the close before the day's bar is treated as final.
 *
 * Yahoo serves a bar for the CURRENT day while the session is still running — the
 * last trade so far, not a close. Fetching at 16:05 would therefore cache an
 * almost-right number under today's date and, because the cache is keyed by date,
 * never correct it. One hour is well past the settle and still the same evening
 * in every timezone the app is used from.
 */
const SETTLE_HOURS = 1;

/** New York calendar date + hour for an instant, without pulling in a date library. */
function nyParts(at: Date): { y: number; m: number; d: number; hour: number } {
  // `en-CA` gives YYYY-MM-DD; h23 avoids the "24" that h24 produces at midnight.
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const got: Record<string, string> = {};
  for (const p of f.formatToParts(at)) got[p.type] = p.value;
  return {
    y: Number(got.year),
    m: Number(got.month),
    d: Number(got.day),
    hour: Number(got.hour),
  };
}

/**
 * The most recent trading day whose close has settled, as `YYYY-MM-DD`.
 *
 * Weekends are stepped over; market holidays are NOT, because there is no holiday
 * calendar here and getting it wrong in this direction is harmless — the fetch
 * finds no new bar, the cache stays where it was, and the caller's once-per-day
 * marker stops it retrying. Claiming a session that did not happen costs one
 * wasted request a year; MISSING one would leave a stale price on screen, which
 * is the bug this exists to fix.
 */
export function lastSettledSession(at: Date = new Date()): string {
  const { y, m, d, hour } = nyParts(at);
  // Step in UTC on the NY calendar date: the arithmetic is DST-free because the
  // date has already been converted, and only the day-of-week is read back.
  const day = new Date(Date.UTC(y, m - 1, d));
  if (hour < CLOSE_HOUR + SETTLE_HOURS) day.setUTCDate(day.getUTCDate() - 1);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return day.toISOString().slice(0, 10);
}
