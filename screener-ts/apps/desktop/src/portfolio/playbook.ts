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
  type LevelSuggestion,
  type PriceMap,
  type RegimeRead,
  type RiskBudget,
  type RiskLadderConfig,
  type SetupKey,
  type SetupRuleOverrides,
  type SizeSuggestion,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { eurUsdForDate } from './fx.js';

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
}

export const EMPTY_PLAYBOOK_CONFIG: PlaybookConfig = { setups: {}, ladder: {}, pinnedRiskPct: null };

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

export async function loadPlaybookConfig(ctx: AppContext): Promise<PlaybookConfig> {
  if (cfgLoaded) return cfg;
  const stored = await ctx.storage.get<Partial<PlaybookConfig>>(CFG_KEY).catch(() => null);
  cfg = {
    setups: stored?.setups ?? {},
    ladder: stored?.ladder ?? {},
    pinnedRiskPct: typeof stored?.pinnedRiskPct === 'number' ? stored.pinnedRiskPct : null,
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
  opts: { refresh?: boolean } = {},
): Promise<RegimeRead | null> {
  if (!spyBars.length) {
    spyBars = (await ctx.storage.get<Bar[]>(SPY_KEY).catch(() => null)) ?? [];
  }
  const last = spyBars[spyBars.length - 1]?.date ?? '';
  const stale = !last || last < isoDaysAgo(4);
  if (opts.refresh && stale) {
    // 2y: the regime needs 210 sessions and a 100-session ATR baseline on top.
    const res = await ctx.data.getOHLCV(REGIME_SYMBOL, '2y').catch(() => null);
    if (res?.bars?.length) {
      spyBars = res.bars;
      await ctx.storage.set(SPY_KEY, spyBars).catch(() => {
        /* a full disk must not break the plan; the regime just stays uncached */
      });
    }
  }
  regime = detectPlaybookRegime(spyBars);
  return regime;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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
  /** Price as typed in the form. */
  entry: number;
  /** Currency the form's price is in. */
  entryCurrency: 'EUR' | 'USD';
  setup: SetupKey;
  /** Buy date, for the FX rate. */
  date: string;
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
  const ladder = ladderConfig();

  // Bars are USD; the form may be in EUR. Work in USD, report in the form's currency.
  const fx = eurUsdForDate(date);
  const toUsd = (v: number): number => (entryCurrency === 'EUR' && fx > 0 ? v * fx : v);
  const fromUsd = (v: number): number => (entryCurrency === 'EUR' && fx > 0 ? v / fx : v);

  const levels = suggestLevels(bars, toUsd(entry), setup, cfg.setups, ladder);
  if (!levels) return null;

  // Equity, cash and open risk are all in the account's currency already.
  const acctCcy = state.account.currency;
  const usdToAcct = (v: number): number => (acctCcy === 'EUR' && fx > 0 ? v / fx : v);

  const equity = computeEquity(state, prices);
  const stage = riskStageOf(closedTradePnls(state), ladder);
  const budget = cfg.pinnedRiskPct === null
    ? riskBudget(stage, { regime: regime?.regime ?? null, atrRatio: regime?.atrRatio ?? null }, ladder)
    // A pinned percent still respects "no new longs in a downtrend": that rule is
    // about whether to trade at all, not about how big, so pinning a size must not
    // quietly switch it off.
    : pinnedBudget(cfg.pinnedRiskPct, stage, ladder);

  const size = suggestSize({
    equity,
    cash: computeCash(state),
    entry: usdToAcct(toUsd(entry)),
    riskPerShare: usdToAcct(levels.riskPerShare),
    budget,
    openRisk: openRiskOf(state),
    openPositions: openPositionCount(state),
    cfg: ladder,
  });

  return {
    stop: round2(fromUsd(levels.stop)),
    target: levels.target !== null ? round2(fromUsd(levels.target)) : null,
    rMultiple: levels.rMultiple,
    stopPct: levels.stopPct,
    shares: size.shares,
    levels,
    size,
    budget,
    regime,
    equity,
  };
}

function pinnedBudget(
  pct: number,
  stage: ReturnType<typeof riskStageOf>,
  ladder: RiskLadderConfig,
): RiskBudget {
  const auto = riskBudget(stage, { regime: regime?.regime ?? null, atrRatio: regime?.atrRatio ?? null }, ladder);
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
