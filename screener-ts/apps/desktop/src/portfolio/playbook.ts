/**
 * The playbook's numbers, as the app holds them: the user's overrides, the market
 * regime, and the one function the Buy form calls to get a plan.
 *
 * ── WHY THE CONFIG SYNCS AND THE BARS DO NOT ────────────────────────────────
 * `pf_playbook_cfg` is rules the user typed. If it stayed on one device, the laptop
 * would suggest a 3R target and the phone 2R for the same setup, with nothing on
 * either screen saying why — the failure mode that made `pf_eurusd_bars` being
 * device-local a documented caveat rather than a design. `pf_spy_bars` is market
 * data: bulky, identical everywhere, and re-fetchable, so it stays local like
 * `pf_bars:` and never eats the sync quota.
 *
 * ── WHY OPENING THE TAB DOES NOT FETCH ──────────────────────────────────────
 * `ensureRegime` reads the cache and computes; it only goes to the network when
 * asked to (`refresh: true`), which is the Update button and the first time the user
 * actually picks a Setup. Drawing a tab must not start a market-data download — the
 * same rule `ensureEurUsd` follows.
 *
 * ── WHERE THE CURRENCIES MEET ───────────────────────────────────────────────
 * Bars are raw USD. Equity, cash and `PriceMap` are in the ACCOUNT's currency (EUR).
 * The Buy form's price is in whichever currency its dropdown says. So levels are
 * computed in USD (bar space) and the sizing is converted to account currency once,
 * here, at the boundary — core does its arithmetic in one currency and the app owns
 * the rate, which is the same split `prices.ts` documents.
 */
import {
  DEFAULT_RISK_LADDER,
  DEFAULT_GRADE_THRESHOLDS,
  closedTradePnls,
  detectPlaybookRegime,
  openRiskOf,
  riskBudget,
  riskStageOf,
  suggestLevels,
  suggestSize,
  computeCash,
  computeEquity,
  type AccountState,
  type Bar,
  type ConvictionRating,
  type GradeThresholds,
  type LevelSuggestion,
  type PriceMap,
  type RegimeRead,
  type RiskBudget,
  type RiskLadderConfig,
  type SetupKey,
  type SetupRuleOverrides,
  type SizeSuggestion,
  quoteCurrencyOf,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { ccyFactor } from './fx.js';

const CFG_KEY = 'pf_playbook_cfg';  // syncs — the user's own rules
const SPY_KEY = 'pf_spy_bars';      // device-local; see LOCAL_ONLY_PREFIXES

/** The index the playbook's regime is defined on. */
const REGIME_SYMBOL = 'SPY';

export interface PlaybookConfig {
  /** Per-setup changes to the stop/target rules. Empty = the shipped defaults. */
  setups: SetupRuleOverrides;
  /** Changes to the risk ladder. Empty = the shipped defaults. */
  ladder: Partial<RiskLadderConfig>;
  /**
   * A risk-per-trade the user has pinned, overriding the closed-trade ladder.
   *
   * null means "work it out from my record", which is the default the user chose:
   * under 50 closed trades is tuition-rate, a positive expectancy earns 0.5%, a
   * hundred trades of it earns 1%. Pinning it is allowed — it is their money — but
   * it has to be an explicit number, not a silent default.
   */
  pinnedRiskPct: number | null;
  /**
   * Where the A/B/C lines fall on the conviction score. Empty = the shipped defaults.
   *
   * ── WHY THESE ARE CONFIGURABLE AND `GRADE_BARS` ARE NOT ─────────────────────
   * The measurement bars are quotations: a user who moves `RS_STRONG` to 50 has deleted
   * O'Neil's criterion and kept his name on it, so they stay named constants in core.
   * Where the letters fall is a different kind of question — it asks how selective THIS
   * user wants to be, which no author can answer for them. The Learn book's §11 says so
   * in as many words, and the whole point of writing the reasons down is that the user can
   * eventually disagree with them on their own recorded evidence.
   */
  gradeThresholds: Partial<GradeThresholds>;
  /**
   * Exit reasons the user added to the shipped vocabulary. Empty = the shipped list only.
   *
   * Here rather than under its own key for the same reason the rest of this blob is: it is rules
   * the user typed, it has to sync (a dropdown that differs between the laptop and the phone
   * would make the journal uncountable and say nothing about why), and every screen that needs
   * it already calls `loadPlaybookConfig`. Typed loosely — `portfolio/exitReasons.ts` owns the
   * shape and validates on the way out, because this blob is synced and hand-editable.
   */
  exitReasons?: { key: string; label: string; group: string }[];
}

export const EMPTY_PLAYBOOK_CONFIG: PlaybookConfig = {
  setups: {}, ladder: {}, pinnedRiskPct: null, gradeThresholds: {}, exitReasons: [],
};

let cfg: PlaybookConfig = EMPTY_PLAYBOOK_CONFIG;
let cfgLoaded = false;

export function playbookConfig(): PlaybookConfig {
  return cfg;
}

/** The ladder with the user's overrides applied. */
export function ladderConfig(): RiskLadderConfig {
  return { ...DEFAULT_RISK_LADDER, ...cfg.ladder };
}

export function setupOverrides(): SetupRuleOverrides {
  return cfg.setups;
}

/**
 * The A/B/C lines with the user's overrides applied.
 *
 * Clamped and re-ordered rather than trusted: a stored `{ a: 40, b: 90 }` — reachable by
 * hand-editing the synced blob, or by a half-finished edit in the dialog — would make B a
 * higher standard than A, and the grader's `score >= a ? 'A' : score >= b ? 'B'` would then
 * silently never return a B. Sorting descending means a nonsensical config produces a
 * strange-looking but coherent scale instead of a letter that cannot occur.
 */
export function gradeThresholds(): GradeThresholds {
  const m = { ...DEFAULT_GRADE_THRESHOLDS, ...cfg.gradeThresholds };
  const clamp = (v: number, d: number) => (Number.isFinite(v) && v > 0 && v <= 100 ? v : d);
  const [a, b, c] = [
    clamp(m.a, DEFAULT_GRADE_THRESHOLDS.a),
    clamp(m.b, DEFAULT_GRADE_THRESHOLDS.b),
    clamp(m.c, DEFAULT_GRADE_THRESHOLDS.c),
  ].sort((x, y) => y - x) as [number, number, number];
  return { a, b, c };
}

export async function loadPlaybookConfig(ctx: AppContext): Promise<PlaybookConfig> {
  if (cfgLoaded) return cfg;
  const stored = await ctx.storage.get<Partial<PlaybookConfig>>(CFG_KEY).catch(() => null);
  cfg = {
    setups: stored?.setups ?? {},
    ladder: stored?.ladder ?? {},
    pinnedRiskPct: typeof stored?.pinnedRiskPct === 'number' ? stored.pinnedRiskPct : null,
    gradeThresholds: stored?.gradeThresholds ?? {},
    // Filtered here rather than trusted: this blob syncs and can be hand-edited, and a row with
    // no key would render an option the user can pick and that nothing can look up afterwards.
    exitReasons: (Array.isArray(stored?.exitReasons) ? stored.exitReasons : [])
      .filter((r) => r && typeof r.key === 'string' && r.key !== '' && typeof r.label === 'string')
      .map((r) => ({ key: r.key, label: r.label, group: typeof r.group === 'string' ? r.group : 'mine' })),
  };
  cfgLoaded = true;
  return cfg;
}

export async function savePlaybookConfig(ctx: AppContext, next: PlaybookConfig): Promise<void> {
  cfg = next;
  cfgLoaded = true;
  await ctx.storage.set(CFG_KEY, next);
}

// ---------------------------------------------------------------------------
// "The rules changed — anything unfinished has to follow"
// ---------------------------------------------------------------------------

/**
 * Listeners for a rule change, so every plan still being WRITTEN re-derives itself.
 *
 * The user's "khi user thay doi trong playbook, khi save, thi tat ca moi thu phai … vi du nhu dang
 * setup trade plan, va vao thay doi playbook, thi sau khi save, cai trade plan do phai thay doi
 * chu". Before this, each ⚙ button picked its own refresh: the Buy card's called `draw()` and wiped
 * the half-filled form, the planner's re-scanned, and a Buy form opened from anywhere else simply
 * kept the old stop. One broadcast means the entry point no longer decides who hears about it.
 *
 * The line the user drew holds: "chi khi ma da buy, da save plan, save case study thi moi khong
 * thay doi thoi". Those three are records of a decision already taken, stored with the numbers they
 * were taken on — a `Lot`, a frozen `PlanSnapshot`, a `CaseStudy`. Nothing here touches them; it
 * only re-runs the derivations that are still drafts.
 *
 * NOT fired from `savePlaybookConfig`, deliberately. The exit-reason editor writes the same blob
 * (`exitReasons.ts`), and a listener like the planner's re-scans bars over the network — renaming a
 * reason must not cost a round of fetches. So the dialog that changed the RULES fires it, and the
 * editor that changed a LABEL does not.
 */
type PlaybookListener = () => void;
const playbookListeners = new Set<PlaybookListener>();

/** Subscribe; the returned function unsubscribes, and must be called when the surface is rebuilt. */
export function onPlaybookChange(fn: PlaybookListener): () => void {
  playbookListeners.add(fn);
  return () => playbookListeners.delete(fn);
}

/** Tell every live surface the rules moved. One throwing listener must not silence the rest. */
export function notifyPlaybookChanged(): void {
  for (const fn of [...playbookListeners]) {
    try {
      fn();
    } catch (e) {
      console.error('playbook listener failed', e);
    }
  }
}

// ---------------------------------------------------------------------------
// "Open the settings when you get there"
// ---------------------------------------------------------------------------

/**
 * A one-shot request to open the settings dialog, set by the Learn book and
 * consumed by the Portfolio tab on its next render.
 *
 * The book explains why 2R is 2 and why the stop sits under the signal bar; it is
 * therefore the right place to offer changing those numbers. But the Learn tab has
 * no `AppContext` (`renderLearn()` takes none), and the dialog needs one to read and
 * write storage — so the book asks, navigates to Portfolio, and the tab that DOES
 * have a context opens it.
 *
 * One-shot on purpose: a flag that stayed set would re-open the dialog every time
 * the user came back to Portfolio, with nothing on screen explaining why.
 */
let settingsRequested = false;

export function requestPlaybookSettings(): void {
  settingsRequested = true;
}

/** True at most once per request. */
export function takePlaybookSettingsRequest(): boolean {
  const want = settingsRequested;
  settingsRequested = false;
  return want;
}

// ---------------------------------------------------------------------------
// The regime
// ---------------------------------------------------------------------------

let spyBars: Bar[] = [];
let regime: RegimeRead | null = null;

/** The last computed regime, or null if there is not enough history yet. */
export function currentRegime(): RegimeRead | null {
  return regime;
}

/**
 * Make sure `currentRegime()` has an answer.
 *
 * Without `refresh` this only reads the cache — safe to call from a draw. With it,
 * a stale cache is topped up from the network; a failed fetch leaves whatever was
 * cached, because a regime from last week beats no regime at all (and the read
 * carries `asOf` so the screen can say how old it is).
 */
export async function ensureRegime(
  ctx: AppContext,
  opts: { refresh?: boolean; asOf?: string } = {},
): Promise<RegimeRead | null> {
  if (!spyBars.length) {
    spyBars = (await ctx.storage.get<Bar[]>(SPY_KEY).catch(() => null)) ?? [];
  }
  const last = spyBars[spyBars.length - 1]?.date ?? '';
  const stale = !last || last < isoDaysAgo(4);
  // Planning a trade in the past needs SPY back to BEFORE that date, and by a year: the
  // regime reads 210 sessions with a 100-session ATR baseline under it. The default 2y cache
  // cannot answer for a date three years ago, and `regimeAsOf` would return null — which the
  // grader reads as "market unknown", quietly dropping the heaviest criterion on the list.
  const need = opts.asOf ? backADay(opts.asOf, 420) : '';
  const tooShort = !!need && (spyBars[0]?.date ?? '9999') > need;
  const period = tooShort ? longEnoughFor(need) : '2y';
  if ((opts.refresh && stale) || tooShort) {
    const res = await ctx.data.getOHLCV(REGIME_SYMBOL, period).catch(() => null);
    // Only accept a fetch that is at least as long as what is held: a '2y' refresh must not
    // truncate a 5y history fetched for a case study, or the next as-of read loses its answer.
    if (res?.bars?.length && (res.bars.length >= spyBars.length || tooShort)) {
      spyBars = res.bars;
      // Device-local (see SPY_KEY), so a longer history costs the sync nothing — which is why
      // it is cached at all rather than re-fetched on every past date the user tries.
      await ctx.storage.set(SPY_KEY, spyBars).catch(() => {
        /* a full disk must not break the plan; the regime just stays uncached */
      });
    }
  }
  regime = detectPlaybookRegime(spyBars);
  return regime;
}

/**
 * The regime as it stood on `date` — the market half of planning a trade in the past.
 *
 * ── WHY THIS CAN BE DONE AT ALL ─────────────────────────────────────────────
 * `detectPlaybookRegime` is a pure function of a bar array, so the regime on a past date is
 * the regime of the bars up to that date. Nothing else about it is remembered, which is the
 * whole reason a historical plan can be honest about the market it was placed into: the
 * alternative is scoring a 2024 breakout against today's tape, and the market criteria are the
 * two heaviest on the checklist.
 *
 * Returns null when the cache does not reach back far enough — see `ensureRegime`'s `asOf`,
 * which is what stops that being the normal answer. Null is not "no regime": the grader treats
 * it as unmeasured, so the letter comes from the rest of the list rather than from a guess.
 */
export function regimeAsOf(date: string): RegimeRead | null {
  if (!date) return regime;
  const upTo = spyBars.filter((b) => b.date <= date);
  return detectPlaybookRegime(upTo);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** `n` calendar days before an ISO date. Calendar, not sessions — this only sizes a fetch. */
function backADay(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The shortest period that reaches back to `from`. */
function longEnoughFor(from: string): '2y' | '5y' | 'max' {
  const years = (Date.now() - new Date(from + 'T00:00:00').getTime()) / (365.25 * 864e5);
  return years <= 1.8 ? '2y' : years <= 4.6 ? '5y' : 'max';
}

/** Whether the regime is old enough that the screen should say so. */
export function regimeStale(): boolean {
  return !!regime && regime.asOf < isoDaysAgo(4);
}

// ---------------------------------------------------------------------------
// Bars for a symbol the account may not hold yet
// ---------------------------------------------------------------------------

const barsBySymbol = new Map<string, Bar[]>();

/**
 * Daily bars for one symbol, for the levels calculation.
 *
 * Memory-only and per session, deliberately: this is a scratch fetch for a symbol
 * the user is *considering*, and persisting every ticker they type would grow a
 * cache nobody prunes. 1y covers the widest lookback (20) plus the 100-session ATR
 * baseline with room to spare.
 */
export async function barsFor(ctx: AppContext, symbol: string): Promise<Bar[]> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return [];
  const have = barsBySymbol.get(sym);
  if (have) return have;
  const res = await ctx.data.getOHLCV(sym, '1y').catch(() => null);
  const bars = res?.bars ?? [];
  if (bars.length) barsBySymbol.set(sym, bars);
  return bars;
}

// ---------------------------------------------------------------------------
// The one call the Buy form makes
// ---------------------------------------------------------------------------

export interface BuyPlanInput {
  state: AccountState;
  prices: PriceMap;
  bars: readonly Bar[];
  /**
   * The ticker the bars belong to — it decides what currency they are in (`ALV.DE` quotes
   * in EUR). Absent reads as a US ticker, which is what every caller before German stocks was.
   */
  symbol?: string;
  /** Price as typed in the form. */
  entry: number;
  /** Currency the form's price is in. */
  entryCurrency: 'EUR' | 'USD';
  setup: SetupKey;
  /** Buy date, for the FX rate. */
  date: string;
  /** A–D conviction grade. Absent means ungraded, which is planned at full size. */
  rating?: ConvictionRating | null;
  /**
   * Read the market as it stood on `date` rather than today — for planning a past trade.
   *
   * Off by default, and deliberately not inferred from `date` being in the past: the Buy form
   * backdates trades the user has ALREADY placed, and those were placed into today's market as
   * far as the risk ladder is concerned. Only the planner in time-travel mode asks for this.
   */
  asOfRegime?: boolean;
}

export interface BuyPlan {
  /** Stop and target in the FORM's currency, ready to put in the inputs. */
  stop: number;
  target: number | null;
  rMultiple: number | null;
  stopPct: number;
  shares: number;
  levels: LevelSuggestion;
  size: SizeSuggestion;
  budget: RiskBudget;
  regime: RegimeRead | null;
  /** Equity the sizing was based on, in the account's currency. */
  equity: number;
  /** The grade the size was scaled by, echoed back so the explanation can name it. */
  rating: ConvictionRating | null;
}

/**
 * Turn "this ticker, this price, this setup" into stop, target and share count.
 *
 * Returns null when there is nothing honest to say — no bars, or a structure that
 * puts no stop below the entry. A blank field the user can fill in themselves is a
 * better answer than a number this module made up.
 */
export function buildBuyPlan(input: BuyPlanInput): BuyPlan | null {
  const { state, prices, bars, entry, entryCurrency, setup, date } = input;
  const rating = input.rating ?? null;
  const ladder = ladderConfig();

  // Bars are in the ticker's quote currency (USD, or EUR for ALV.DE); the form may be in
  // either. Work in the quote currency, report in the form's.
  const quote = input.symbol ? quoteCurrencyOf(input.symbol) : 'USD';
  const toQuote = (v: number): number => v * ccyFactor(entryCurrency, quote ?? 'USD', date);
  const fromQuote = (v: number): number => v * ccyFactor(quote ?? 'USD', entryCurrency, date);

  const levels = suggestLevels(bars, toQuote(entry), setup, cfg.setups, ladder);
  if (!levels) return null;

  // Equity, cash and open risk are all in the account's currency already.
  const acctCcy = state.account.currency;
  const quoteToAcct = (v: number): number => v * ccyFactor(quote ?? 'USD', acctCcy, date);

  const equity = computeEquity(state, prices);
  const stage = riskStageOf(closedTradePnls(state), ladder);
  // The market this plan is placed into. Today's, unless the caller is replaying a past date —
  // see `asOfRegime`. Everything else on this line is account state, which has no past.
  const rg = input.asOfRegime ? regimeAsOf(date) : regime;
  const budget = cfg.pinnedRiskPct === null
    ? riskBudget(stage, { regime: rg?.regime ?? null, atrRatio: rg?.atrRatio ?? null }, ladder)
    // A pinned percent still respects "no new longs in a downtrend": that rule is
    // about whether to trade at all, not about how big, so pinning a size must not
    // quietly switch it off.
    : pinnedBudget(cfg.pinnedRiskPct, stage, ladder, rg);

  const size = suggestSize({
    equity,
    cash: computeCash(state),
    entry: quoteToAcct(toQuote(entry)),
    riskPerShare: quoteToAcct(levels.riskPerShare),
    budget,
    openRisk: openRiskOf(state),
    openPositions: openPositionCount(state),
    // The grade scales the finished size, so it goes to the sizer rather than to the
    // budget — see the note on `riskBudget`. A pinned percent gets scaled too, because
    // what the user pinned is the size of the trade they actually wanted: an A.
    rating,
    cfg: ladder,
  });

  return {
    stop: round2(fromQuote(levels.stop)),
    target: levels.target !== null ? round2(fromQuote(levels.target)) : null,
    rMultiple: levels.rMultiple,
    stopPct: levels.stopPct,
    shares: size.shares,
    levels,
    size,
    budget,
    // The regime the size was actually decided by — as-of when the caller asked for it, so the
    // explanation under the card names the market of the day it is planning.
    regime: rg,
    equity,
    rating,
  };
}

/**
 * A pinned percent, with the one thing a pin does NOT override.
 *
 * The regime's veto stands: a downtrend is about whether to trade at all, not about how
 * big, so pinning a size must not quietly switch it off. The conviction grade is not
 * handled here — it scales the finished share count in `suggestSize`, which is what makes
 * it work for a pinned percent and an automatic one alike.
 */
function pinnedBudget(
  pct: number,
  stage: ReturnType<typeof riskStageOf>,
  ladder: RiskLadderConfig,
  rg: RegimeRead | null,
): RiskBudget {
  const auto = riskBudget(stage, { regime: rg?.regime ?? null, atrRatio: rg?.atrRatio ?? null }, ladder);
  if (auto.pct === 0) return auto; // a downtrend still means no new longs
  return { pct, maxPositions: stage.maxPositions, cuts: [], stage };
}

/** Distinct tickers still held — what the ladder's position limit counts. */
export function openPositionCount(state: AccountState): number {
  return new Set(state.lots.filter((l) => l.remainingShares > 0).map((l) => l.ticker)).size;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
