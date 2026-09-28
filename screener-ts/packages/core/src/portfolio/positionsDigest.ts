/**
 * The digest of open positions that the scanner's intraday side reads
 * (`scanner:positions`). Pure: accounts in, plain object out.
 *
 * Lives in core, not in the app, because the three things it has to get right are
 * portfolio logic and want tests around them:
 *
 *  1. `Position.stop` from metrics.ts is the stop of the OLDEST open lot — a
 *     "representative" number for a table. The first stop a falling price
 *     breaches is the HIGHEST one. Publishing the representative stop would put
 *     the alert at the wrong level for any ticker bought in more than one lot, so
 *     this publishes every distinct level, highest first.
 *  2. Pending STOP_LOSS orders are stops too. A stop entered as an order rather
 *     than on the lot is invisible to `lot.stop`, and the user has no reason to
 *     think of those as two different things.
 *  3. Currency. A US quote is in USD; the stored numbers may not be. This does NOT
 *     copy metrics.ts's habit of comparing the two directly: it tags each row with
 *     the currency the published numbers are ACTUALLY in, so the reader can refuse
 *     to fire a confident level it cannot convert. A wrong stop alert is worse than
 *     a flagged one.
 *
 *     ⚠️ `priceCurrency` IS NOT THAT CURRENCY. It records what the user TYPED, and
 *     the Portfolio tab converts before storing: a USD price entered into a EUR
 *     account is divided by `fxRateAtBuy`, so `buyPrice`/`stop` hold euros while
 *     `priceCurrency` still says 'USD' (see `normalizeLotPrice` there, and
 *     `applyApprovedWrite` in the app's chat write path, which stores the same
 *     shape). Reading the tag off `priceCurrency` published a euro stop level
 *     labelled USD — the VM then compared €132 against a $232 quote, found no
 *     breach, and stayed silent for the whole session. `lotCurrency()` below is
 *     the same condition as that conversion, which is why it has to stay in step
 *     with it.
 *
 * WHAT IS DELIBERATELY ABSENT: cash, equity, total or realized P&L, account ids,
 * lot ids, dates. Whoever holds the scanner VM's token can read this key (the
 * bridge gates writes, not reads), so it carries what an alert needs to name a
 * level and nothing that would reconstruct the portfolio.
 */
import type { AccountState } from '../types/index.js';

export interface PositionsRow {
  /** Ticker as entered. The VM upper-cases before matching. */
  sym: string;
  /** Total open shares across every account. */
  shares: number;
  /** Weighted average cost of the open shares, in `cur`. */
  avgCost: number;
  /** Currency the prices in this row are expressed in: 'USD' | 'EUR' | 'MIXED'. */
  cur: string;
  /** Every distinct stop level, highest first. Highest = first one breached. */
  stops: number[];
  /** Shares that have a stop, and shares that do not. */
  withStop: number;
  noStop: number;
  /** Account names holding it — so an alert can say where. */
  accts: string[];
}

export interface PositionsDigest {
  /** ISO UTC, browser clock. The VM treats anything older than its own
   *  threshold as UNKNOWN rather than as "no positions". */
  ts: string;
  /** Number of rows. Present so `0` can be told apart from a truncated payload. */
  n: number;
  rows: PositionsRow[];
  /** Data-quality notes, already phrased for a human. */
  warn: string[];
}

/** `priceCurrency` is optional and documented as defaulting to USD. */
function cur(c: 'EUR' | 'USD' | undefined): 'EUR' | 'USD' {
  return c ?? 'USD';
}

/**
 * The currency `buyPrice`/`stop` of this lot are actually stored in.
 *
 * Mirrors `normalizeLotPrice()` in the Portfolio tab: a USD price entered into a
 * EUR account is divided by the rate BEFORE being stored, so what sits on the lot
 * is euros. No rate means no conversion happened, and the number is still as typed.
 */
function lotCurrency(
  lot: { priceCurrency?: 'EUR' | 'USD'; fxRateAtBuy?: number },
  acctCurrency: string,
): 'EUR' | 'USD' {
  const typed = cur(lot.priceCurrency);
  return acctCurrency === 'EUR' && typed === 'USD' && lot.fxRateAtBuy ? 'EUR' : typed;
}

function round(v: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

/**
 * Pure: accounts in, digest out. No network, no storage, no clock unless given
 * one — so a test can assert the shape without mocking anything.
 */
export function buildPositionsDigest(list: AccountState[], now = new Date()): PositionsDigest {
  const acc = new Map<string, {
    shares: number;
    cost: number;
    stops: Set<number>;
    /** Pending-order levels, held apart: they are in QUOTE space. See below. */
    orderStops: Set<number>;
    withStop: number;
    noStop: number;
    curs: Set<string>;
    accts: Set<string>;
  }>();

  const get = (sym: string) => {
    let r = acc.get(sym);
    if (!r) {
      r = { shares: 0, cost: 0, stops: new Set(), orderStops: new Set(),
            withStop: 0, noStop: 0, curs: new Set(), accts: new Set() };
      acc.set(sym, r);
    }
    return r;
  };

  for (const st of list) {
    const name = st.account?.name ?? '?';
    const acctCur = st.account?.currency ?? 'USD';
    for (const lot of st.lots ?? []) {
      if (!(lot.remainingShares > 0)) continue;
      const sym = String(lot.ticker ?? '').trim().toUpperCase();
      if (!sym) continue;
      const r = get(sym);
      r.shares += lot.remainingShares;
      r.cost += lot.remainingShares * lot.buyPrice;
      r.curs.add(lotCurrency(lot, acctCur));
      r.accts.add(name);
      if (typeof lot.stop === 'number' && Number.isFinite(lot.stop)) {
        r.stops.add(round(lot.stop));
        r.withStop += lot.remainingShares;
      } else {
        r.noStop += lot.remainingShares;
      }
    }

    // Pending STOP_LOSS orders are stops the user has actually placed. Only for
    // tickers that are open: an order on a closed position is not a live level.
    //
    // Kept apart from the lot stops because the two are in different spaces: the
    // order engine fills a STOP_LOSS against the RAW daily bars (`processOrders`
    // in orders.ts), so a threshold is a quote-space number — USD for a US ticker
    // — whichever account it sits in, while `lot.stop` is in the account currency.
    // They are merged below only once the row is known to be USD-denominated.
    for (const o of st.orders ?? []) {
      if (o.type !== 'STOP_LOSS' || o.status !== 'pending') continue;
      const sym = String(o.ticker ?? '').trim().toUpperCase();
      const r = acc.get(sym);
      if (!r || !Number.isFinite(o.threshold)) continue;
      r.orderStops.add(round(o.threshold));
      r.accts.add(name);
    }
  }

  const rows: PositionsRow[] = [];
  let mixed = 0;
  let eur = 0;
  let noStopSyms = 0;
  let droppedOrders = 0;
  for (const [sym, r] of [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const c = r.curs.size > 1 ? 'MIXED' : ([...r.curs][0] ?? 'USD');
    if (c === 'MIXED') mixed += 1;
    else if (c === 'EUR') eur += 1;
    // A quote-space threshold goes in only when the rest of the row is quote-space
    // too. Publishing it inside a row tagged EUR would put two units in one array,
    // which is the same defect as mislabelling the row.
    const stops = new Set(r.stops);
    if (r.orderStops.size) {
      if (c === 'USD') for (const s of r.orderStops) stops.add(s);
      else droppedOrders += 1;
    }
    if (stops.size === 0) noStopSyms += 1;
    rows.push({
      sym,
      shares: round(r.shares, 6),
      avgCost: r.shares > 0 ? round(r.cost / r.shares) : 0,
      cur: c,
      stops: [...stops].sort((a, b) => b - a),
      withStop: round(r.withStop, 6),
      noStop: round(r.noStop, 6),
      accts: [...r.accts].sort(),
    });
  }

  const warn: string[] = [];
  if (noStopSyms > 0) {
    warn.push(`${noStopSyms} mã đang mở không có mức cắt lỗ nào — không thể cảnh báo`);
  }
  if (eur > 0) {
    warn.push(`${eur} mã có giá và mức cắt lỗ đang lưu bằng EUR; báo giá của Mỹ là USD — cần tỷ giá để so`);
  }
  if (mixed > 0) {
    warn.push(`${mixed} mã có lô lưu bằng cả EUR và USD`);
  }
  if (droppedOrders > 0) {
    warn.push(`${droppedOrders} mã có lệnh chờ cắt lỗ tính theo báo giá USD, không gửi kèm vì các số còn lại của mã đó không phải USD`);
  }

  return { ts: now.toISOString(), n: rows.length, rows, warn };
}
