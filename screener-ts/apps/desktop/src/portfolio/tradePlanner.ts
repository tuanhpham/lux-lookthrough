/**
 * The Trade Planner panel — one card per symbol, mountable anywhere.
 *
 * ── WHY IT IS ITS OWN MODULE ────────────────────────────────────────────────
 * It was born inside the Watchlist tab, for the whole list at once. The user then asked for it
 * in two more places: on a single watchlist row ("doi khi minh chi muon xem trade plan cua mot
 * co phieu trong mot watchlist nao do thoi"), and on the individual stock page ("rat tien khi
 * ma co the click on trade plan va xem luon tren trang individual do"). The stock modal cannot
 * import the Watchlist tab — `miscTabs.ts` imports `openStock` from it, so the reverse edge
 * would be an import cycle — which is why the panel lives out here and takes `onOpenSymbol` as
 * a callback instead of reaching for `openStock` itself. It imports nothing from any tab.
 *
 * ── WHY ONLY ONE PANEL MAY BE OPEN AT A TIME ────────────────────────────────
 * Every piece of state below is a module-level singleton keyed by symbol, and the DOM lookups
 * are global: `document.getElementById('tp-acct')`, `[data-tp-derived="NVDA"]`. Two mounted
 * panels would collide on the panel-level ids outright, and a symbol present in both would have
 * one card's keystrokes repaint the other's chart. Rather than make every id mount-scoped — a
 * large change for a panel nobody wants twice — `openTradePlanner` enforces the invariant:
 * mounting into a new host tears the old one down first. `closeTradePlanner(host)` lets a
 * container that is about to drop its own children (the stock modal replaces `body.innerHTML`)
 * destroy the charts inside it without disturbing a panel mounted somewhere else.
 *
 * ── WHAT THE PANEL IS FOR ───────────────────────────────────────────────────
 * Sizing a trade by the same playbook the Buy form uses.
 *
 * This panel used to size positions itself (a % of a typed equity figure) while the Buy form
 * asked the playbook. Two answers to "how many shares" is the failure `setupPlaybook.ts` was
 * written to end: the planner would offer 300 shares, the form would fill 140 for the same
 * trade, and nothing on either screen said which was the rule. Now both call one function, and
 * the % chips are what they should always have been — a visible manual override, not a second
 * rule.
 *
 * `buildTradePlan`/`explainPlan` are still here, and still earn their place: they say whether
 * the SETUP is there at all (quality score, the passed/failed list). That is a different
 * question from how big, and the two are not in competition.
 *
 * ── WHERE THE CURRENCIES SIT ────────────────────────────────────────────────
 * One toggle, `planCcy`, and it now governs the LEVELS as well as the money. The user buys
 * these names in euros most of the time ("minh se mua bang gia EUR thuong xuyen") and a stop
 * is a price you type into a broker, so it has to be typeable in the currency the broker
 * quotes. So:
 *
 *   • the entry/stop/target boxes hold prices in `planCcy`, and `levelToUsd` converts them
 *     back for anything that touches BARS (the chart's overlay, and `buildBuyPlan`, which
 *     takes `entryCurrency` and hands its own levels back in the same currency);
 *   • money (equity, position value, risk) comes out of `buildBuyPlan` in the ACCOUNT's
 *     currency, so `planConv` converts from THAT, not from USD;
 *   • one rate does all of it — `eurUsdForDate(planDate)`, the TRADE DATE's rate, the same
 *     one `plannedPrice` records the lot at. A screen converting at today's rate while the
 *     write converts at the trade date's is a disagreement nothing downstream would flag.
 *
 * Getting any of this backwards is a silent error exactly the size of the EURUSD rate, which
 * is why the conversions live in three named functions and nowhere else.
 */
import {
  scanQm, fetchMany, buildTradePlan, explainPlan, computeCash, computeEquity,
  isSetupKey, isRating, SETUP_KEYS, RATING_KEYS,
  gradeTrade, qmGradeEvidence,
  type QmScanResult, type QmSetupType, type AccountState, type Bar,
  type ConvictionRating, type PriceMap, type SetupKey,
  type GradeAnswers, type GradeResult,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { num } from '../ui/dom.js';
// One rule table, one set of words: the Buy form and this planner size and explain the
// same trade, so they call the same two modules rather than each carrying a copy.
import {
  buildBuyPlan, currentRegime, ensureRegime, ladderConfig, loadPlaybookConfig, type BuyPlan,
} from './playbook.js';
import { planLines, setupName } from './planWords.js';
// The grade panel is shared with the Buy form: one checklist, rendered once, so the panel
// the user reads in the planner is the same one that sizes the trade they place.
import { gradePanelHtml } from './gradeView.js';
// And the plan itself is shared and persisted, so a checklist worked through here is the one
// the Buy form gates on later — see `planStore.ts`.
import {
  emptyPlan, loadStoredPlans, savePlan, type PlanAnswers, type SymbolPlan,
} from './planStore.js';
import { printPlanReport } from './planReport.js';
// Buying from inside the plan goes down the same path as the Buy button and the assistant.
import { savePlanSnapshot } from './planSnapshot.js';
import { applyWrite, plannedPrice, type PlannedPrice, type Rating, type WritePlan } from './writes.js';
import { accounts, ensureAccountsLoaded, today } from './store.js';
import { ensureEurUsd, eurUsdForDate, hasEurUsd } from './fx.js';
import { accountPrices, hasPrices } from './prices.js';
import { drawCandles, type CandleChart, type TradeOverlay } from '../ui/charts.js';
import { t, getLang } from '../ui/i18n.js';
import { openPlaybookSettings } from '../ui/playbookSettings.js';
import { sanitizeNoteHtml, richNoteDialog, isNoteEmpty } from '../ui/richNote.js';

/**
 * Where a panel is mounted and what it is planning.
 *
 * `symbols` is a function rather than an array because the watchlist's list can change under
 * an open panel (a symbol removed from a row), and ↻ Run has to plan what the list holds NOW
 * rather than what it held when the panel opened.
 */
export interface PlannerMount {
  /** The element the panel's card is written into. Emptied on close. */
  host: HTMLElement;
  /** The symbols to plan, read afresh on every recompute. */
  symbols: () => string[] | Promise<string[]>;
  /** What the panel calls itself — a list name, or a single ticker. */
  title: string;
  /** Clicking a card's ticker. Omitted where there is nowhere to go (already on that page). */
  onOpenSymbol?: (symbol: string) => void;
  /** Called after the user closes the panel with ×, so a host can un-press its button. */
  onClose?: () => void;
}

/** The one mounted panel, or none. See the header for why there is only ever one. */
let mounted: PlannerMount | null = null;

/** Is a panel open in this host? Lets a button toggle rather than re-mount. */
export function tradePlannerIsIn(host: HTMLElement): boolean {
  return mounted?.host === host;
}

/**
 * Tear the panel down: destroy the charts, empty the host, forget the mount.
 *
 * `onlyInside` makes this a no-op unless the panel is mounted in that element (or inside it) —
 * for a container about to replace its own children, which would otherwise leave nine live
 * series and a ResizeObserver per card pointing at detached nodes.
 */
export function closeTradePlanner(onlyInside?: HTMLElement): void {
  if (!mounted) return;
  if (onlyInside && !(onlyInside === mounted.host || onlyInside.contains(mounted.host))) return;
  destroyPlanCharts();
  mounted.host.innerHTML = '';
  mounted = null;
}

/**
 * Open the panel in `mount.host`, replacing whatever panel was open elsewhere.
 *
 * Re-entrant on purpose: pressing the same button twice while the first pass is still fetching
 * is a normal thing to do, and the second pass simply re-renders over the first.
 */
export async function openTradePlanner(ctx: AppContext, mount: PlannerMount): Promise<void> {
  if (mounted && mounted.host !== mount.host) closeTradePlanner();
  mounted = mount;
  await renderPlannerPanel(ctx);
}

/** Draw (or redraw) the panel's controls into the mounted host, then plan its symbols. */
async function renderPlannerPanel(ctx: AppContext): Promise<void> {
  const mount = mounted;
  if (!mount) return;
  const panel = mount.host;

  // The EURUSD history (shared with the Portfolio tab's cache), so `planRate` has the trade
  // date's rate to work from. `ensureEurUsd` first because the Buy button refuses without a
  // rate on a EUR account, and the cache may be on disk but not yet in memory — this reads
  // it, it never fetches.
  await ensureEurUsd(ctx).catch(() => {});

  // Opening this panel IS the explicit "plan some trades" gesture, so this is the
  // right moment to spend a request on the regime — the size ladder must not run
  // silently without one. Same rule the Buy form follows on its first Setup.
  await loadPlaybookConfig(ctx);
  await ensureRegime(ctx, { refresh: true }).catch(() => null);

  planAccounts = (await ctx.storage.get<AccountState[]>('accounts')) ?? [];
  // Carry the typed equity across the re-render — but ONLY when the box was the one in
  // charge. With an account selected the box now displays that account's equity, so
  // reading it back here would overwrite the user's own figure with the account's and
  // lose it the moment they switched back to manual.
  if (!planAcctId) {
    const prevEquity = Number((document.getElementById('tp-equity') as HTMLInputElement | null)?.value);
    if (Number.isFinite(prevEquity) && prevEquity > 0) planManualEquity = prevEquity;
  }

  const acctOpts = acctOptionsHtml();

  panel.innerHTML = `
    <div class="card" style="margin-bottom:14px;position:relative">
      <button id="tp-close" style="position:absolute;top:10px;right:12px;background:0;border:0;color:var(--faint);font-size:18px;cursor:pointer">×</button>
      <div class="section-title" style="margin-top:0">📋 ${t('wl.plan.title')} · ${esc(mount.title)}</div>
      <div class="tp-controls">
        ${acctOpts ? `<div class="tp-ctl">
          <label class="field-label">${t('wl.plan.useacct')}</label>
          <select id="tp-acct" class="field pf-acct-select tp-acct-select">
            <option value="">${t('wl.plan.manualeq')}</option>
            ${acctOpts}
          </select>
        </div>` : ''}
        <div class="tp-ctl">
          <label class="field-label">${t('wl.plan.date')}</label>
          <input id="tp-date" class="field tp-date-input" type="date" value="${planDate}" title="${t('wl.plan.datetitle')}" />
        </div>
        <div class="tp-ctl">
          <label class="field-label">${t('wl.plan.equity')} (USD)</label>
          <input id="tp-equity" class="field" type="number" value="${
            // With an account chosen, show THAT account's equity. Leaving the typed figure
            // in a greyed-out box states a number that is not the one being used — the
            // grey says "not editable", it cannot say "and also wrong".
            planAcctId ? Math.round(planEquityGuess()) : planManualEquity
          }" step="10000" ${planAcctId ? 'disabled' : ''} />
          ${planAcctId ? `<div class="muted tp-ctl-note">${t('wl.plan.eqfromacct')}</div>` : ''}
        </div>
        <button id="tp-ccy" class="btn-outline tp-ctl-btn" ${planRate() > 0 ? '' : 'disabled'}
          title="${planRate() > 0 ? t('wl.plan.ccytitle') : t('wl.plan.ccynorate')}">${planSym()} ${planCcy}</button>
        <button id="tp-refresh" class="btn-outline tp-ctl-btn">${t('wl.plan.run')}</button>
        <button id="tp-playbook-cfg" class="btn-outline tp-ctl-btn" title="${t('wl.plan.cfgtitle')}">⚙ ${t('wl.plan.cfg')}</button>
      </div>
      <div id="tp-status" class="muted" style="font-size:11px;line-height:1.5;margin:6px 0 0"></div>
      <div id="tp-results"><div class="muted"><span class="spinner"></span> ${t('msg.scanning')}…</div></div>
    </div>`;

  // `closeTradePlanner`, not `panel.innerHTML = ''`: the cards carry live charts, and
  // dropping their nodes without `destroy()` leaves a ResizeObserver per card behind.
  document.getElementById('tp-close')!.addEventListener('click', () => {
    const onClose = mount.onClose;
    closeTradePlanner();
    onClose?.();
  });
  document.getElementById('tp-refresh')!.addEventListener('click', () => void computePlans(ctx));

  /**
   * The trade date — the user's "neu khong chon thi lay mac dinh ngay hom do, con neu chon
   * thi lay ngay chon do".
   *
   * It is not cosmetic. It is the date the EUR/USD rate is taken on, so on a EUR account it
   * changes the cost basis, the equity the size is a percentage of, and therefore the share
   * count; it is the date a Buy is recorded under; and it is what the printed plan is dated
   * and its chart centred on. Hence a recompute rather than a repaint.
   */
  const dateEl = document.getElementById('tp-date') as HTMLInputElement | null;
  dateEl?.addEventListener('change', () => {
    // An emptied box means "today" rather than nothing: a plan has to be dated to be sized.
    const before = planRate();
    planDate = dateEl.value || today();
    dateEl.value = planDate;
    // In euros the boxes are a USD level seen through the date's rate, so a new date is a new
    // euro figure for the same trade. Without this the lines would slide against the candles.
    const after = planRate();
    if (planCcy === 'EUR' && before > 0 && after > 0) rescaleLevels(before / after);
    void computePlans(ctx);
  });

  // The same dialog the Buy form opens. The planner needs it more, not less: this is the
  // screen where the user is comparing eight sized plans at once, so it is where a stop
  // rule or an A/B/C line being wrong is most visible — and it is where they will want to
  // change it. `computePlans` rather than a full re-render so the panel does not scroll
  // back to the top, and so the account/currency choices survive.
  document.getElementById('tp-playbook-cfg')!.addEventListener('click', () => {
    void openPlaybookSettings(ctx, planAccount(), () => void computePlans(ctx));
  });

  // Currency toggle. It moves the PRICE BOXES too, not just the money — the user asked to be
  // able to edit in euros because that is what they mostly buy in — so the levels are
  // re-expressed at the trade date's rate as the same trade in the other currency. Disabled
  // without a rate rather than converting at 1: see `planRate`.
  document.getElementById('tp-ccy')!.addEventListener('click', () => {
    const r = planRate();
    if (!(r > 0)) return;
    // USD → EUR divides, EUR → USD multiplies. Read off `planCcy` BEFORE it flips.
    rescaleLevels(planCcy === 'USD' ? 1 / r : r);
    planCcy = planCcy === 'USD' ? 'EUR' : 'USD';
    void renderPlannerPanel(ctx);
  });

  // Choosing an account switches the whole basis of the sizing: its cash, its open
  // risk, its closed-trade record. The typed-equity box goes grey rather than away,
  // so it is obvious which number is in charge.
  const acctSel = document.getElementById('tp-acct') as HTMLSelectElement | null;
  acctSel?.addEventListener('change', () => {
    planAcctId = acctSel.value || null;
    const acct = planAccount();
    // Follow the account's own currency by default — the money about to be shown is that
    // account's money, and showing it in the other one is a choice, not a default. Since the
    // boxes follow `planCcy` too, this converts them as the toggle does, and refuses for the
    // same reason when there is no rate: a EUR label over a USD number is the error.
    const want = acct?.account.currency === 'EUR' ? 'EUR' : 'USD';
    const r = planRate();
    if (acct && want !== planCcy && r > 0) {
      rescaleLevels(planCcy === 'USD' ? 1 / r : r);
      planCcy = want;
    }
    void renderPlannerPanel(ctx);
  });

  document.getElementById('tp-equity')!.addEventListener('change', () => {
    const v = Number((document.getElementById('tp-equity') as HTMLInputElement).value);
    if (v > 0) { planManualEquity = v; void computePlans(ctx); }
  });

  await computePlans(ctx);
}

async function computePlans(ctx: AppContext): Promise<void> {
  const mount = mounted;
  const out = document.getElementById('tp-results');
  if (!mount || !out) return;

  // Every card is about to be replaced, so the charts on them have to be torn down
  // first: dropping the nodes leaves nine live series and a ResizeObserver per symbol
  // pointing at a detached container.
  destroyPlanCharts();
  out.innerHTML = `<div class="muted"><span class="spinner"></span> ${t('msg.scanning')}…</div>`;
  // Read afresh, not captured at mount: a symbol removed from the watchlist while the
  // panel is open must not be re-planned by ↻ Run.
  const syms = [...new Set((await mount.symbols()).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!syms.length) { out.innerHTML = `<p class="muted">${t('wl.empty')}</p>`; return; }

  const data = await fetchMany(ctx.data, syms, '1y', 6);
  const scans: QmScanResult[] = [];
  planScans.clear();
  for (const sym of syms) {
    const d = data.get(sym);
    if (d && d.bars.length >= 60) {
      const scan = scanQm(sym, d.bars);
      scans.push(scan);
      // Kept, not consumed: the conviction checklist reads fourteen of its measurements.
      planScans.set(sym, scan);
    }
    // Keep the bars: editing the Entry price re-derives the stop from structure, and
    // that needs the same history the scan used. Re-fetching per keystroke is not an
    // option, and a planner whose stop did not follow the entry would be a form that
    // quietly disagreed with itself.
    if (d?.bars.length) planBars.set(sym, d.bars);
  }

  // `buildTradePlan` still answers "is the setup there": levels for the seed, a
  // quality score to sort by, and the actionable badge. The SIZE comes from the
  // playbook further down.
  const plans = scans
    .map((s) => ({ scan: s, plan: buildTradePlan(s, { equity: planEquityGuess(), riskPctPerTrade: 1 }) }))
    .sort((a, b) => b.plan.qualityScore - a.plan.qualityScore);

  if (!plans.length) { out.innerHTML = `<p class="muted">${t('wl.empty')}</p>`; return; }

  // Drop edit state for symbols no longer in the plan (keep edits for the rest).
  const liveSyms = new Set(plans.map((p) => p.plan.symbol));
  for (const key of [...planEdits.keys()]) if (!liveSyms.has(key)) planEdits.delete(key);

  // The saved plans, which outlive this panel. Only the symbols that HAVE one come back, so a
  // card the user has never worked on keeps the setup the screener detected while a card whose
  // saved setup is blank stays blank — that blank is the user having cleared it.
  planCtx = ctx;
  const stored = await loadStoredPlans(ctx, [...liveSyms]);
  for (const [sym, p] of stored) planStored.set(sym, p);

  const vi = getLang() === 'vi';
  const lang = getLang();
  const rows = plans.map(({ scan, plan }) => {
    // Seed the editable state once per symbol; keep any prior user edits.
    const prev = planEdits.get(plan.symbol);
    const saved = stored.get(plan.symbol);
    const edit: PlanEdit = prev ?? {
      // `buildTradePlan` reads the bars, so its seed is USD; the boxes are in `planCcy`.
      entry: usdToLevel(plan.entry),
      stop: usdToLevel(plan.stop),
      target: usdToLevel(plan.target),
      shares: plan.shares || 0,
      // The playbook's own answer is the default. The % chips are still there, one
      // click away, but they are now the override rather than the rule.
      sizeMode: 'plan',
      sizePct: DEFAULT_SIZE_PCT,
      // What the scan already thinks this is, unless the user has said otherwise before —
      // their answer outranks the screener's guess, and a saved blank means they looked and
      // decided this is not one of the book's setups.
      setup: saved ? saved.setup : QM_TO_SETUP[scan.setupType],
      // Empty on purpose, and empty is not "no": the manual criteria start UNASKED, so a
      // fresh card is graded on the measurements alone and ticking boxes refines it. Answers
      // already given come back — working through the checklist is the expensive part.
      answers: { ...(saved?.answers ?? {}) },
      // No override. The grade is computed; the dropdown is there for disagreeing with it —
      // and a disagreement the user has already expressed is worth keeping.
      gradeOverride: saved?.gradeOverride ?? null,
      // Collapsed: the letter and the score are the headline, and fifteen rows of
      // criteria above the price fields would bury the form the user came for.
      criteriaOpen: false,
      // A note the user wrote themselves comes back; one this code generated does not need to,
      // because `recalcPlan` regenerates it from the levels a few lines below.
      note: saved?.noteEdited ? saved.note : '',
      noteEdited: saved?.noteEdited ?? false,
      ownStop: false,
      ownTarget: false,
      explain: explainHtml(scan, lang),
    };
    planEdits.set(plan.symbol, edit);

    const actionColor = plan.actionable ? 'var(--accent)' : 'var(--faint)';
    const S = plan.symbol;
    const activePreset = edit.sizeMode === 'pct' ? edit.sizePct : null;
    const sizeChips = SIZE_PRESETS.map((p) =>
      `<button type="button" class="tp-size-chip${p === activePreset ? ' active' : ''}" data-tp-size="${S}" data-pct="${p}">${p}%</button>`,
    ).join('');
    const customVal = edit.sizeMode === 'pct' && edit.sizePct != null && !SIZE_PRESETS.includes(edit.sizePct)
      ? edit.sizePct : '';
    return `
      <div class="card tp-card" data-tp-card="${S}" style="margin-bottom:10px;border-color:${plan.actionable ? 'var(--accent-line)' : 'var(--border)'}">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          ${mount.onOpenSymbol
            ? `<a href="#" class="link-ticker" data-tp-open="${S}"><strong style="font-size:15px">${S}</strong></a>`
            // Nowhere to go: the panel is already mounted on that stock's own page, and a link
            // that reopens the page you are on reads as a dead link.
            : `<strong style="font-size:15px">${S}</strong>`}
          <span class="badge" style="background:var(--surface);border-color:${actionColor};color:${actionColor}">
            ${plan.actionable ? t('wl.plan.actionable') : t('wl.plan.nosetup')} · Q ${plan.qualityScore.toFixed(0)}/100
          </span>
        </div>

        <div class="tp-playfields">
          <label class="tp-field"><span>${t('wl.plan.setup')}</span>
            <select class="field" data-tp-setup="${S}">
              <option value="">${t('wl.plan.nosetupopt')}</option>
              ${SETUP_KEYS.map((k) => `<option value="${k}"${k === edit.setup ? ' selected' : ''}>${setupName(k, vi)}</option>`).join('')}
            </select></label>
          <label class="tp-field"><span>${t('wl.plan.gradeover')}</span>
            <select class="field" data-tp-rating="${S}">
              <option value="">${t('wl.plan.gradeauto')}</option>
              ${RATING_KEYS.map((r) => `<option value="${r}"${r === edit.gradeOverride ? ' selected' : ''}>${r} — ${ladderConfig().ratingPct[r]}%</option>`).join('')}
            </select></label>
        </div>

        <div class="tp-grade" data-tp-grade="${S}"></div>

        <div class="tp-fields">
          <label class="tp-field"><span>${t('wl.plan.entry')} (${planSym()})</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp="entry" data-sym="${S}" value="${edit.entry ?? ''}" /></label>
          <label class="tp-field"><span style="color:var(--danger)">${t('wl.plan.stop')} (${planSym()})</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp="stop" data-sym="${S}" value="${edit.stop ?? ''}" /></label>
          <label class="tp-field"><span style="color:var(--accent)">${t('wl.plan.target')} (${planSym()})</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp="target" data-sym="${S}" value="${edit.target ?? ''}" /></label>
          <label class="tp-field"><span>${t('wl.plan.shares')}</span>
            <input class="field" type="number" step="1" inputmode="numeric" data-tp="shares" data-sym="${S}" value="${edit.shares || ''}" /></label>
        </div>

        <div class="tp-size-row">
          <span class="tp-size-label">${t('wl.plan.possize')}</span>
          <button type="button" class="tp-size-chip${edit.sizeMode === 'plan' ? ' active' : ''}" data-tp-size="${S}" data-pct="book">${t('wl.plan.frombook')}</button>
          ${sizeChips}
          <span class="tp-size-custom">
            <span class="tp-size-customlabel">${t('wl.plan.custom')}:</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp-sizeinput="${S}" placeholder="%" style="width:64px" value="${customVal}" /><span>%</span>
          </span>
        </div>

        <div class="tp-chart" data-tp-chart="${S}"></div>
        <div class="tp-derived" data-tp-derived="${S}"></div>

        <div class="tp-buy-row">
          <button type="button" class="btn tp-buy" data-tp-buy="${S}" disabled>${t('wl.plan.buy')}</button>
          <span class="tp-buy-hint" data-tp-buyhint="${S}"></span>
        </div>

        <div class="tp-note-head">
          <span class="tp-note-label">${t('wl.plan.note')}</span>
          <button type="button" class="note-btn has-note" data-tp-noteedit="${S}" title="${t('pf.note.edit')}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="btn-outline mini-btn" data-tp-print="${S}"
            title="${t('plan.printtitle')}">⎙ ${t('plan.print')}</button>
        </div>
        <div class="tp-note note-html" data-tp-note="${S}">${edit.note ?? ''}</div>
      </div>`;
  });

  out.innerHTML = rows.join('');
  paintPlanStatus();
  for (const { plan } of plans) recalcPlan(plan.symbol);
  wirePlanEdits(ctx, out);

  // Clicking a symbol opens its stock detail — through the host's callback, because this
  // module must not import the stock modal (see the header: `miscTabs` already imports it,
  // and this panel is mounted inside that very modal).
  const open = mount.onOpenSymbol;
  if (open) {
    out.querySelectorAll<HTMLElement>('[data-tp-open]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        open(a.dataset.tpOpen!);
      }),
    );
  }
}

/** Editable per-symbol planner state (ephemeral — lives while the panel is open). */
interface PlanEdit {
  entry: number | null;
  stop: number | null;
  target: number | null;
  shares: number;
  /**
   * Where the share count comes from: the playbook, a % of equity, or the box.
   *
   * 'plan' is the default and the only one of the three that knows about the regime,
   * the record and the grade — the other two are the user overruling it, which they
   * are allowed to do as long as the screen keeps saying what the book would have said.
   */
  sizeMode: 'plan' | 'pct' | 'manual';
  sizePct: number | null;
  /** Which playbook row to use. '' = none chosen, so there is nothing to suggest. */
  setup: SetupKey | '';
  /**
   * The user's answers to the criteria the app cannot measure. A key that is absent means
   * UNASKED, not "no" — which is why this is a sparse object and not `Record<string, boolean>`.
   */
  answers: GradeAnswers;
  /**
   * A letter the user has insisted on, overriding the score. null = use the computed one.
   *
   * ── WHY THERE IS AN OVERRIDE AT ALL ───────────────────────────────────────
   * The checklist exists because a self-chosen grade was not objective. Leaving an escape
   * hatch might look like handing that back — but the alternative is worse. A user who
   * disagrees with the score and has no way to say so will instead tick a criterion they
   * do not believe, and then the checklist is wrong AND looks objective. One visible
   * override, which the card labels as an override, keeps the lie out of the criteria.
   */
  gradeOverride: ConvictionRating | null;
  /** Whether the criteria list is expanded. Per card, because the user opens one at a time. */
  criteriaOpen: boolean;
  note: string;
  /** Once the user has edited the note, the planner stops rewriting it. */
  noteEdited: boolean;
  /** The user typed their own stop / target, so the plan offers rather than fills. */
  ownStop: boolean;
  ownTarget: boolean;
  /** `explainPlan`'s passed/failed narrative, rendered once — the setup half. */
  explain: string;
}
const planEdits = new Map<string, PlanEdit>();
const planBars = new Map<string, Bar[]>();

/**
 * The saved plan behind each card, and the context to write it back with.
 *
 * ── WHY THE STORED PLAN IS KEPT ALONGSIDE `PlanEdit` RATHER THAN REPLACING IT ──
 * `PlanEdit` holds things the plan has no business storing (which size chip is lit, whether
 * the chart has been drawn, the rendered explain narrative) and the plan holds things this
 * screen does not own — above all `reviewedAt`, `reviewedGrade` and the `levels` the Buy form's
 * acknowledgement was made against. Writing a whole `SymbolPlan` from `PlanEdit` alone would
 * blank those, and blanking them silently re-opens a gate the user had passed.
 *
 * So the last thing read or written is kept here, and `persistPlan` copies the shared fields
 * onto it. The planner deliberately does not save the entry/stop/target boxes: those are
 * re-derived from the playbook and the current bars every time the panel opens, and a saved
 * entry from last week would be a stale number presented as a decision.
 */
let planCtx: AppContext | null = null;
const planStored = new Map<string, SymbolPlan>();

/**
 * A card's state as a `SymbolPlan`: the stored plan with this screen's half laid over it.
 *
 * The fields not listed are the ones the planner does not own — the Buy form's acknowledgement
 * and the levels it was made against — and they pass through untouched.
 */
function cardSymbolPlan(symbol: string): SymbolPlan | null {
  const e = planEdits.get(symbol);
  if (!e) return null;
  return {
    ...(planStored.get(symbol) ?? emptyPlan(symbol)),
    symbol,
    setup: e.setup,
    answers: { ...e.answers } as PlanAnswers,
    gradeOverride: e.gradeOverride,
    note: e.note,
    noteEdited: e.noteEdited,
  };
}

/**
 * Write the shared half of a card back to the plan store.
 *
 * Fire-and-forget: the user's next keystroke must not wait on storage, and there is nothing
 * useful to do with a failure except let the next write try again. The guard on the write-back
 * is there because two saves can be in flight — the note dialog resolving while a criterion is
 * being answered — and the later one's result must not be replaced by the earlier one's.
 */
function persistPlan(symbol: string): void {
  const next = cardSymbolPlan(symbol);
  const ctx = planCtx;
  if (!next || !ctx) return;
  planStored.set(symbol, next);
  void savePlan(ctx, next).then((wrote) => {
    if (planStored.get(symbol) === next) planStored.set(symbol, wrote);
  });
}
/**
 * The scan behind each card, kept for the grader.
 *
 * The scans used to be consumed and dropped — `buildTradePlan` took what it needed and the
 * rich result went out of scope. The conviction checklist reads fourteen measurements off
 * it, so it has to survive as long as the card does.
 */
const planScans = new Map<string, QmScanResult>();
const SIZE_PRESETS = [3.5, 5, 7.5, 10, 12.5, 15, 17.25, 20];
const DEFAULT_SIZE_PCT = 3.5;

/**
 * What the screener thinks the setup is, as a playbook row.
 *
 * `BOTH` picks VCP rather than EP because the VCP row is the tighter of the two: when
 * two readings of the same chart disagree about how much room to give the stop, taking
 * the smaller position is the recoverable mistake.
 */
const QM_TO_SETUP: Record<QmSetupType, SetupKey | ''> = {
  VCP: 'VCP',
  EPISODIC_PIVOT: 'EP',
  BOTH: 'VCP',
  NONE: '',
};

// Which account is paying, and the money to use when none is. `planAccounts` is the
// list as last read from storage — the planner re-reads it whenever the panel is drawn.
let planAccounts: AccountState[] = [];
let planAcctId: string | null = null;
let planManualEquity = 100_000;

function planAccount(): AccountState | null {
  return planAccounts.find((a) => a.account.id === planAcctId) ?? null;
}

/**
 * The account dropdown's options. Repainted on its own after a buy, because the cash in the
 * labels is exactly what the buy just changed.
 */
function acctOptionsHtml(): string {
  return planAccounts
    .map((a) => {
      // Cash in the account's OWN currency: this dropdown is about which pot of money
      // is paying, and converting it here would only invite reading it as the other one.
      const cash = Math.round(computeCash(a));
      const sym = a.account.currency === 'EUR' ? '€' : '$';
      const sel = planAcctId === a.account.id ? ' selected' : '';
      return `<option value="${a.account.id}"${sel}>${esc(a.account.name)} — ${sym}${cash.toLocaleString()}</option>`;
    })
    .join('');
}

/**
 * The account to size against — the real one, or a stand-in holding the typed equity.
 *
 * ── WHY A MADE-UP ACCOUNT AND NOT A SECOND CODE PATH ────────────────────────
 * `buildBuyPlan` needs an account: cash, open risk, and the closed-trade record the
 * risk ladder reads. The planner still has to answer "how big" before the user has
 * picked one. Branching on that would give this panel a second sizing rule — the exact
 * thing this rewrite removed. A stand-in with the typed money as cash and no history
 * keeps one path, and what it implies is honest rather than convenient: no closed
 * trades means the learning rung, which is what the book prescribes for someone with
 * no record to show.
 */
function planState(): AccountState {
  const real = planAccount();
  if (real) return real;
  return {
    account: {
      id: '', name: '', initialCapital: planManualEquity, currency: 'USD',
      createdAt: new Date().toISOString().slice(0, 10),
    },
    lots: [], sells: [], orders: [], snapshots: [], cashFlows: [],
  };
}

/**
 * Prices for the chosen account's holdings, in its own currency.
 *
 * Empty is a real answer, not a gap: `computePositionsValue` then falls back to cost
 * basis, so the equity is what was paid rather than what it is worth. The status line
 * says so — see `paintPlanStatus` — because an equity figure the user cannot date is
 * one they will trade off anyway.
 */
function planPrices(): PriceMap {
  const id = planAccount()?.account.id;
  return id ? accountPrices(id) : {};
}

/** A rough equity for `buildTradePlan`'s own sizing, which only feeds its quality view. */
function planEquityGuess(): number {
  const a = planAccount();
  return a ? Math.max(1, computeEquity(a, planPrices())) : planManualEquity;
}

/** The currency the money in this panel is denominated in before display conversion. */
function planAcctCcy(): 'USD' | 'EUR' {
  return planAccount()?.account.currency === 'EUR' ? 'EUR' : 'USD';
}

/**
 * The trade date every card is planned and bought on. Today until the user picks another.
 *
 * Panel-level rather than per card: the user plans a session, not a symbol, and asking them
 * to set the same date on eight cards would mean seven chances to leave one on today.
 */
let planDate = today();

/** HTML-escape — the panel title comes from a user-named watchlist. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The currency the whole card is in: the money AND the price boxes. See the header.
let planCcy: 'USD' | 'EUR' = 'USD';
const planSym = (): string => (planCcy === 'EUR' ? '€' : '$');

/**
 * 1 EUR = N USD on the TRADE DATE, or 0 when no rate is known at all.
 *
 * Not the latest rate, and not a 1: the date this plan is dated is the date its lot will be
 * recorded under, and `plannedPrice` refuses to convert at all without a rate rather than
 * turning a $232.50 fill into a €232.50 cost basis. This returns 0 for the same reason —
 * every caller has to decide what to do about it, and none of them may quietly divide by 1.
 */
function planRate(): number {
  if (!hasEurUsd()) return 0;
  const r = eurUsdForDate(planDate);
  return r > 0 ? r : 0;
}

/** Prices carry two decimals here for the same reason `buildBuyPlan` rounds: a stop is typed. */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Account-currency money → the display currency.
 *
 * Note the input: NOT USD. `buildBuyPlan` hands back `equity`, `riskAmount` and the
 * rest already converted into the account's currency, and feeding those through a
 * USD→EUR conversion would divide by the rate twice.
 */
function planConv(v: number): number {
  const from = planAcctCcy();
  const r = planRate();
  if (from === planCcy || !(r > 0)) return v;
  return from === 'EUR' ? v * r : v / r;
}

/** A level out of the boxes → raw USD, which is what the bars are in. */
function levelToUsd(v: number): number {
  const r = planRate();
  return planCcy === 'EUR' && r > 0 ? v * r : v;
}

/** The other direction, for seeding a box from a number that came off the bars. */
function usdToLevel(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const r = planRate();
  return planCcy === 'EUR' && r > 0 ? round2(v / r) : v;
}

/** A level out of the boxes → account-currency money, for the position and risk figures. */
function levelToAcct(v: number): number {
  const acct = planAcctCcy();
  if (acct === planCcy) return v;
  const r = planRate();
  if (!(r > 0)) return v;
  return acct === 'EUR' ? v / r : v * r;
}

/**
 * Re-express every card's levels in another currency, or at another rate.
 *
 * Called from the two controls that change what the boxes MEAN without the user having
 * touched them: the €/$ toggle and the trade date. Both preserve the trade — the same price
 * against the same candles — rather than the digits, because the digits came off the chart in
 * the first place. So a plan does not drift when the date moves; only the euro figure does.
 */
function rescaleLevels(factor: number): void {
  if (!(factor > 0) || factor === 1) return;
  for (const e of planEdits.values()) {
    if (e.entry !== null) e.entry = round2(e.entry * factor);
    if (e.stop !== null) e.stop = round2(e.stop * factor);
    if (e.target !== null) e.target = round2(e.target * factor);
  }
}

/** `explainPlan`'s narrative as rich-note HTML: the headline plus what passed and failed. */
function explainHtml(scan: QmScanResult, lang: 'en' | 'vi'): string {
  const e = explainPlan(scan);
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const passedLis = e.passed.map((p) => `<li>${esc(p[lang])}</li>`).join('');
  const failedLis = e.failed.map((f) => `<li><span style="color:#ff5266">${esc(f[lang])}</span></li>`).join('');
  return `<h3>${esc(e.headline[lang])}</h3><ul>${passedLis}${failedLis}</ul>`;
}

/** The line above the cards: which money is being used, and how trustworthy it is. */
function paintPlanStatus(): void {
  const box = document.getElementById('tp-status');
  if (!box) return;
  const vi = getLang() === 'vi';
  const acct = planAccount();
  const rate = planRate();
  const bits: string[] = [
    t('wl.plan.levelccy').replace('{ccy}', planCcy) +
    // The rate is part of the claim, not decoration: in euros every price on this card is a
    // USD close through this number, and it is the number the lot will be recorded at.
    (planCcy === 'EUR' && rate > 0 ? ` <span class="muted">(1 € = ${num(rate, 4)} $)</span>` : ''),
  ];
  if (acct) {
    bits.push(
      `${vi ? 'Tiền theo' : 'Money in'} ${acct.account.currency}` +
      (planCcy !== planAcctCcy() ? ` (${vi ? 'đang hiện bằng' : 'shown in'} ${planCcy})` : ''),
    );
    if (!hasPrices(acct.account.id)) bits.push(t('wl.plan.costbasis'));
  } else {
    bits.push(t('wl.plan.manualnote'));
  }
  box.innerHTML = bits.join(' · ');
}

/**
 * The plan for one card, from the playbook, at whatever entry is currently in the box.
 *
 * Returns null when there is nothing honest to compute — no setup chosen, no entry, no
 * bars, or no stop below the entry. Every caller has to say which of those it is,
 * because a card that just shows nothing reads as a broken feature.
 */
function cardPlan(symbol: string, rating: ConvictionRating | null): BuyPlan | null {
  const e = planEdits.get(symbol);
  const bars = planBars.get(symbol);
  if (!e || !e.setup || !bars?.length) return null;
  if (e.entry === null || !(e.entry > 0)) return null;
  return buildBuyPlan({
    state: planState(),
    prices: planPrices(),
    bars,
    entry: e.entry,
    // Whatever the boxes are in. `buildBuyPlan` converts to USD to read the bars and hands
    // its stop and target back in this same currency, so `recalcPlan` can write them straight
    // into the boxes — and it uses `date` for the rate, exactly as `planRate` does.
    entryCurrency: planCcy,
    setup: e.setup,
    // The panel's date, not today's: it is the date the EUR/USD rate is taken on, so on a
    // EUR account it moves the equity the size is a percentage of — and a plan sized at
    // today's rate but recorded on the chosen date would be internally inconsistent.
    date: planDate,
    rating,
  });
}

/**
 * The conviction grade for one card, scored rather than chosen.
 *
 * ── WHY THE PLAYBOOK RUNS TWICE ─────────────────────────────────────────────
 * Two of the criteria are about this trade rather than the stock: the reward-to-risk and
 * how far the stop sits from the entry. Those come out of the playbook — and the playbook
 * also needs the grade, to scale the share count. That looks circular and is not: the
 * LEVELS do not depend on the grade, only the size does. So this runs one ungraded pass
 * to find out where the stop and target are, grades that, and the caller runs the pass
 * that counts. Both passes are arithmetic over bars already in memory.
 *
 * ── WHY IT PREFERS THE USER'S OWN STOP ──────────────────────────────────────
 * If they have typed their own, the R:R criterion has to describe the trade they are
 * about to place, not the one the book suggested and they rejected.
 */
function cardGrade(symbol: string): GradeResult | null {
  const e = planEdits.get(symbol);
  const scan = planScans.get(symbol);
  if (!e || !scan) return null;

  const levels = cardPlan(symbol, null);
  const entry = e.entry ?? 0;
  const stop = (e.ownStop ? e.stop : levels?.stop) ?? 0;
  const target = (e.ownTarget ? e.target : levels?.target) ?? null;
  const riskPerShare = entry > 0 && stop > 0 && stop < entry ? entry - stop : 0;

  return gradeTrade(
    qmGradeEvidence(scan, {
      setup: e.setup,
      regime: currentRegime()?.regime ?? null,
      // null, not 0, when there is nothing to divide: the grader reads a missing number as
      // unmeasured and a zero as a failing measurement.
      rMultiple: riskPerShare > 0 && target != null && target > entry
        ? (target - entry) / riskPerShare : null,
      stopPct: riskPerShare > 0 ? (riskPerShare / entry) * 100 : null,
    }),
    e.answers,
  );
}

/**
 * Re-run the playbook for one card and repaint everything derived from it.
 *
 * ── WHY THIS DOES NOT REDRAW THE CARD ───────────────────────────────────────
 * It runs on every keystroke in the Entry box. Replacing the card's HTML would take
 * the input the user is typing in out from under the caret. So it writes `.value` on
 * the fields it still owns, and replaces only the three containers whose children have
 * no listeners: the chart, the stats and the note.
 */
function recalcPlan(symbol: string): void {
  const e = planEdits.get(symbol);
  const box = document.querySelector<HTMLElement>(`[data-tp-derived="${CSS.escape(symbol)}"]`);
  if (!e || !box) return;
  const vi = getLang() === 'vi';
  // Score the criteria, then size the trade with the letter that came out. An override
  // wins, and the panel says it did.
  const grade = cardGrade(symbol);
  const rating = e.gradeOverride ?? grade?.grade ?? null;
  const plan = cardPlan(symbol, rating);
  paintGradePanel(symbol, grade, rating, vi);

  // Stop and target follow the entry — that is the whole point of the Setup dropdown —
  // but only while they are still the planner's numbers. A hand-typed stop survives,
  // because overwriting it would place a trade at a level the user had rejected.
  if (plan) {
    if (!e.ownStop) { e.stop = plan.stop; setFieldValue(symbol, 'stop', String(plan.stop)); }
    if (!e.ownTarget) {
      e.target = plan.target;
      setFieldValue(symbol, 'target', plan.target === null ? '' : String(plan.target));
    }
    if (e.sizeMode === 'plan') { e.shares = plan.shares; setFieldValue(symbol, 'shares', String(plan.shares || '')); }
  }

  const entry = e.entry ?? 0;
  const stop = e.stop ?? 0;
  const riskPerShare = entry > 0 && stop > 0 && stop < entry ? entry - stop : 0;
  // With no setup chosen there is no plan to read the equity off, but the % chips and
  // the cash warning still need one — and it has to be the SAME number the plan would
  // have used, or the position percentages would jump when the setup is picked.
  const equity = plan ? plan.equity : planEquityGuess();

  if (e.sizeMode === 'pct' && e.sizePct != null && entry > 0) {
    // The % is of equity, which is account money, so the entry has to become account
    // money too before the division — otherwise a EUR account buys 1.17× too many. (A
    // no-op when the boxes are already in the account's currency, which is now the
    // common case, and still needed for the USD-boxes-on-a-EUR-account one.)
    e.shares = Math.round((equity * e.sizePct) / 100 / levelToAcct(entry));
    setFieldValue(symbol, 'shares', String(e.shares || ''));
  }

  const shares = Math.max(0, Math.round(e.shares || 0));
  const positionValue = shares * levelToAcct(entry);
  const positionPct = equity > 0 ? (positionValue / equity) * 100 : 0;
  const riskAmount = shares * levelToAcct(riskPerShare);
  const riskPctOfPos = positionValue > 0 ? (riskAmount / positionValue) * 100 : 0;
  const riskPctOfEq = equity > 0 ? (riskAmount / equity) * 100 : 0;
  const rr = riskPerShare > 0 && e.target != null && e.target > entry
    ? (e.target - entry) / riskPerShare : null;

  const sym = planSym();
  const cash = computeCash(planState());
  // The cash test is against CASH, not equity: money already in positions cannot buy
  // this one. The old version compared to equity and so stayed quiet on a fully
  // invested account — the one time the warning matters.
  const overBy = positionValue - cash;
  const warn = overBy > 0
    ? `<div class="tp-cash-warn">⚠ ${t('wl.plan.nocash')
        .replace('{need}', `${sym}${num(planConv(positionValue), 0)}`)
        .replace('{have}', `${sym}${num(planConv(cash), 0)}`)
        .replace('{over}', `${sym}${num(planConv(overBy), 0)}`)}</div>`
    : '';

  // The grade's arithmetic, in the user's own framing: full size → percent → this size.
  // Only when the playbook is the one sizing — with a % chip or a typed share count the
  // numbers below would describe a size that was overridden, which reads as the card
  // disagreeing with itself.
  const scaled = plan && e.sizeMode === 'plan' && plan.size.gradeScale !== 1 && plan.size.fullShares > 0;
  const gradeMath = scaled
    ? `<div class="tp-grade-math">${t('wl.plan.gradedfrom')
        .replace('{full}', `<b>${plan.size.fullShares}</b> sh · ${sym}${num(planConv(plan.size.fullPositionValue), 0)}`)
        .replace('{pct}', `${Math.round(plan.size.gradeScale * 100)}%`)
        .replace('{now}', `<b>${plan.shares}</b> sh · ${sym}${num(planConv(plan.size.positionValue), 0)}`)}</div>`
    : '';

  box.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
      <div class="stat"><div class="k">${t('wl.plan.posval')}</div><div class="v"${overBy > 0 ? ' style="color:var(--danger)"' : ''}>${sym}${num(planConv(positionValue), 0)} <span class="muted" style="font-size:11px">(${num(positionPct, 1)}%)</span></div></div>
      <div class="stat"><div class="k">${t('wl.plan.riskpos')}</div><div class="v" style="color:var(--warn)">${sym}${num(planConv(riskAmount), 0)} <span class="muted" style="font-size:11px">(${num(riskPctOfPos, 1)}%)</span></div></div>
      <div class="stat"><div class="k">${t('wl.plan.riskeq')}</div><div class="v" style="color:var(--warn)">${num(riskPctOfEq, 2)}%</div></div>
      <div class="stat"><div class="k">R:R</div><div class="v">${rr != null ? num(rr, 2) + ':1' : '—'}</div></div>
    </div>${gradeMath}${warn}`;

  paintPlanChart(symbol);
  // Derived, never remembered: whether this card can be bought depends on the account, the
  // entry and the share count, all of which this function has just recomputed.
  paintBuyButton(symbol);

  // The note explains the plan; once the user has written in it, it is theirs.
  if (!e.noteEdited) {
    const head = plan
      // One symbol for both now: `buildBuyPlan` returned its levels in `planCcy` because
      // that is the currency it was handed the entry in.
      ? `<p>${planLines(plan, { vi, levelSym: sym, moneySym: sym, money: true }).join('<br>')}</p>`
      : `<p class="muted">${e.setup ? t('wl.plan.nolevels') : t('wl.plan.picksetup')}</p>`;
    e.note = sanitizeNoteHtml(head + e.explain);
    const noteBox = document.querySelector<HTMLElement>(`[data-tp-note="${CSS.escape(symbol)}"]`);
    if (noteBox) noteBox.innerHTML = e.note;
  }
}

// ── Buying the plan ─────────────────────────────────────────────────────────
/**
 * Why this card cannot be bought, as a translation key — or null when it can.
 *
 * ── WHY THERE IS NO SEPARATE ACKNOWLEDGEMENT TICK HERE ──────────────────────
 * The Buy form has one ("Tôi đã xem kế hoạch này") because there the plan is a panel the user
 * can collapse and ignore next to a price box. Here the plan IS the screen: the grade, every
 * criterion, the levels, the chart and the sizing arithmetic are all above this button, and
 * pressing it is preceded by a dialog that lists exactly what will be recorded. Asking for a
 * tick as well would train the user to tick without reading, which is the failure the gate
 * exists to prevent. So the buy WRITES the acknowledgement instead — see `buyFromPlan`.
 *
 * Insufficient cash is deliberately NOT a blocker: the ⚠ line above says so in the account's
 * own money, the confirm dialog repeats it, and a user recording a trade they actually placed
 * (perhaps after a deposit this app has not been told about) must not be locked out of their
 * own record.
 */
function buyBlocker(symbol: string): string | null {
  const e = planEdits.get(symbol);
  if (!e) return 'wl.plan.buyno.card';
  if (!planAccount()) return 'wl.plan.buyno.acct';
  if (!(e.entry !== null && e.entry > 0)) return 'wl.plan.buyno.entry';
  if (!(Math.round(e.shares || 0) > 0)) return 'wl.plan.buyno.shares';
  // A stop at or above the entry is not a small mistake: it is a trade that is already
  // stopped out, and every risk figure derived from it would be negative or nonsense.
  if (e.stop !== null && e.stop >= e.entry) return 'wl.plan.buyno.stop';
  return null;
}

/** Enable or disable one card's Buy button, and say why when it is disabled. */
function paintBuyButton(symbol: string): void {
  const btn = document.querySelector<HTMLButtonElement>(`[data-tp-buy="${CSS.escape(symbol)}"]`);
  const hint = document.querySelector<HTMLElement>(`[data-tp-buyhint="${CSS.escape(symbol)}"]`);
  if (!btn || !hint) return;
  const why = buyBlocker(symbol);
  btn.disabled = why !== null;
  if (why) { hint.textContent = t(why); hint.classList.remove('ok'); return; }
  const e = planEdits.get(symbol)!;
  const acct = planAccount()!;
  hint.classList.add('ok');
  hint.textContent = t('wl.plan.buyready')
    .replace('{shares}', String(Math.round(e.shares)))
    .replace('{sym}', symbol)
    .replace('{acct}', acct.account.name)
    .replace('{date}', planDate);
}

/** One labelled line of the confirm dialog. */
function confRow(k: string, v: string, color?: string): string {
  return `<tr><td class="muted" style="padding:3px 10px 3px 0;white-space:nowrap">${esc(k)}</td>
    <td class="mono"${color ? ` style="color:${color}"` : ''}>${v}</td></tr>`;
}

/**
 * Show exactly what is about to be written, and wait for a yes.
 *
 * The same standard the assistant's approval card is held to: what is shown is what happens,
 * built from the very `WritePlan` that will be applied rather than from a sentence about it.
 * The user asked to be able to buy straight from the plan — that convenience must not also
 * remove the last look at the numbers.
 */
function confirmBuyDialog(plan: WritePlan & { kind: 'record_buy' }, cashAfter: number): Promise<boolean> {
  const accSym = plan.account.currency === 'EUR' ? '€' : '$';
  const inSym = plan.price.currency === 'EUR' ? '€' : '$';
  const conv = (p: PlannedPrice): string =>
    p.stored !== p.given
      ? `${inSym}${num(p.given, 2)} <span class="muted">→ ${accSym}${num(p.stored, 2)}</span>`
      : `${inSym}${num(p.given, 2)}`;
  const rows = [
    confRow(t('wl.plan.buyacct'), esc(plan.account.name)),
    confRow(t('pf.buy.date'), plan.date),
    confRow(t('wl.plan.shares'), `${plan.shares} × ${esc(plan.ticker)}`),
    confRow(t('wl.plan.entry'), conv(plan.price), 'var(--accent)'),
    plan.stop ? confRow(t('wl.plan.stop'), conv(plan.stop), 'var(--danger)') : '',
    plan.target ? confRow(t('wl.plan.target'), conv(plan.target)) : '',
    confRow(t('wl.plan.buycost'), `${accSym}${num(plan.cost, 2)}`),
    // Shown even when it goes negative — especially then. See `buyBlocker`.
    confRow(t('wl.plan.buycash'), `${accSym}${num(cashAfter, 2)}`, cashAfter < 0 ? 'var(--danger)' : undefined),
    plan.price.fx ? confRow(t('wl.plan.buyrate'), `1 € = ${num(plan.price.fx, 4)} $`) : '',
    plan.setupType || plan.rating
      ? confRow(t('wl.plan.buygrade'), `${esc(plan.setupType ?? '—')} · ${plan.rating ?? '—'}`)
      : '',
  ].filter(Boolean).join('');

  return new Promise<boolean>((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    host.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog" style="width:min(460px,94vw)">
        <div class="dialog-title">${t('wl.plan.buyttl')}</div>
        <div class="dialog-body"><table style="border-collapse:collapse;font-size:13px">${rows}</table></div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="no">${t('wl.plan.buycancel')}</button>
          <button class="btn" data-act="yes">${t('wl.plan.buyok')}</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const done = (answer: boolean): void => { host.remove(); resolve(answer); };
    host.querySelector('[data-act="no"]')!.addEventListener('click', () => done(false));
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => done(false));
    host.querySelector('[data-act="yes"]')!.addEventListener('click', () => done(true));
  });
}

/** Put a message under one card's Buy button, in place of the ready line. */
function buyHint(symbol: string, message: string, bad = true): void {
  const hint = document.querySelector<HTMLElement>(`[data-tp-buyhint="${CSS.escape(symbol)}"]`);
  if (!hint) return;
  hint.textContent = message;
  hint.classList.toggle('ok', !bad);
}

/**
 * Record the card's trade into the chosen account — the user's "nut buy de minh co the mua
 * luon chang han, va giao dich se duoc add vao account do".
 *
 * ── WHY IT GOES THROUGH `applyWrite` ────────────────────────────────────────
 * That one function is what makes a lot booked here indistinguishable from one typed into the
 * Buy form or asked for in chat: `priceCurrency` and `fxRateAtBuy` on the lot, `seedPrice` so
 * the position is not valued at zero until the next Update, `snapshotNow` so the equity curve
 * moves today, the audit line, and the notification the Portfolio tab redraws on. A fourth
 * hand-rolled buy path here would be a fourth chance to forget one of them.
 *
 * ── WHY THE BUY WRITES THE ACKNOWLEDGEMENT ──────────────────────────────────
 * The printed report prints "⚠ NOT acknowledged" unless `reviewedAt` is set against the levels
 * in force. Buying from inside the plan, having just confirmed a dialog listing every number,
 * IS having read it — so without this every planner-bought lot's frozen report would carry a
 * warning that is simply false. It is recorded against the levels and the letter as they stand
 * (see `reviewCurrent`), so a later change still expires it.
 */
async function buyFromPlan(ctx: AppContext, symbol: string): Promise<void> {
  const e = planEdits.get(symbol);
  const chosen = planAccount();
  if (!e || !chosen || buyBlocker(symbol)) return;

  // The dropdown was built from the stored `accounts` blob; the write goes into the live
  // array. They agree in practice, and when they do not, saying so beats writing into a
  // portfolio this device has not finished loading.
  await ensureAccountsLoaded(ctx);
  const live = accounts.find((a) => a.account.id === chosen.account.id);
  if (!live) { buyHint(symbol, t('wl.plan.buyno.gone')); return; }

  const account = {
    id: live.account.id,
    name: live.account.name,
    currency: live.account.currency,
  };
  // The boxes are in `planCcy`, the same numbers `cardPlan` feeds the playbook — so the fill
  // is quoted in that currency and `plannedPrice` converts it on the trade date when the
  // account keeps its books in the other one. It REFUSES rather than converting at 1: a rate
  // of 1 would turn a $232.50 fill into a €232.50 cost basis, an error no later screen would
  // flag. Same date, and therefore the same rate, as everything on the card.
  const price = plannedPrice(account.currency, e.entry!, planCcy, planDate);
  const stop = e.stop === null ? undefined : plannedPrice(account.currency, e.stop, planCcy, planDate);
  const target = e.target === null ? undefined : plannedPrice(account.currency, e.target, planCcy, planDate);
  for (const p of [price, stop, target]) {
    if (p && 'error' in p) { buyHint(symbol, t('wl.plan.buyno.norate').replace('{ccy}', account.currency)); return; }
  }
  const shares = Math.round(e.shares);
  const grade = cardGrade(symbol);
  const effective = e.gradeOverride ?? grade?.grade ?? null;
  const note = isNoteEmpty(e.note ?? '') ? undefined : sanitizeNoteHtml(e.note);

  const write: WritePlan & { kind: 'record_buy' } = {
    kind: 'record_buy',
    account,
    ticker: symbol,
    shares,
    price: price as PlannedPrice,
    date: planDate,
    ...(stop ? { stop: stop as PlannedPrice } : {}),
    ...(target ? { target: target as PlannedPrice } : {}),
    ...(e.setup ? { setupType: e.setup } : {}),
    ...(effective ? { rating: effective as Rating } : {}),
    ...(note ? { note } : {}),
    cost: shares * (price as PlannedPrice).stored,
  };

  if (!(await confirmBuyDialog(write, computeCash(live) - write.cost))) return;

  let lotId = '';
  try {
    lotId = (await applyWrite(ctx, write)).lotId ?? '';
  } catch (err) {
    // The one failure the user will actually hit: a device that has not finished syncing.
    // `withAccounts` refuses rather than saving over a half-loaded portfolio.
    buyHint(symbol, (err as Error).message);
    return;
  }

  // The acknowledgement, and the plan it was made against, saved before the snapshot is cut
  // so the frozen copy carries it.
  const saved = cardSymbolPlan(symbol);
  if (saved) {
    saved.reviewedAt = new Date().toISOString();
    saved.levels = { entry: e.entry, stop: e.stop, target: e.target };
    saved.reviewedGrade = effective;
    planStored.set(symbol, saved);
    void savePlan(ctx, saved);
  }

  // Freeze the plan against the new lot, so the Portfolio tab's ⎙ button on this row opens
  // the plan this trade was actually made on. Swallowed: a storage failure here must not be
  // reported as a failed trade, because the trade is already recorded.
  if (lotId && saved) {
    await savePlanSnapshot(ctx, {
      lotId,
      symbol,
      savedAt: new Date().toISOString(),
      date: planDate,
      plan: saved,
      grade,
      effective,
      levels: { entry: e.entry, stop: e.stop, target: e.target },
      shares,
      // Whatever the boxes were in when the trade was made — frozen with the levels, because
      // a stored 232.50 with no currency beside it is unreadable a month later.
      currency: planCcy,
      pctOfFull: effective ? ladderConfig().ratingPct[effective] : 100,
    }).catch(() => {});
  }

  // The account just paid for something: its cash, its open risk and therefore every card's
  // size are now different. Re-read from the live store (authoritative, post-write) and
  // recompute rather than re-render — a full render would re-fetch every symbol's bars.
  planAccounts = [...accounts];
  const sel = document.getElementById('tp-acct') as HTMLSelectElement | null;
  if (sel) { sel.innerHTML = `<option value="">${t('wl.plan.manualeq')}</option>${acctOptionsHtml()}`; }
  paintPlanStatus();
  for (const s of planEdits.keys()) recalcPlan(s);
  buyHint(symbol, t('wl.plan.buydone').replace('{acct}', account.name), false);
}

/**
 * The grade panel for one card.
 *
 * The markup itself is `gradePanelHtml`, shared with the Buy form — see `gradeView.ts` for
 * why the criteria are read-only where they are measured and tri-state where they are not.
 * What stays here is the part that is about THIS screen: finding the card's box, and the
 * card's own notion of which letter is in force.
 */
function paintGradePanel(
  symbol: string,
  grade: GradeResult | null,
  effective: ConvictionRating | null,
  vi: boolean,
): void {
  const box = document.querySelector<HTMLElement>(`[data-tp-grade="${CSS.escape(symbol)}"]`);
  const e = planEdits.get(symbol);
  if (!box || !e) return;
  box.innerHTML = gradePanelHtml(grade, {
    ns: 'tp',
    id: symbol,
    vi,
    open: e.criteriaOpen,
    override: e.gradeOverride,
    effective,
    // A dash is not a failure — an ungraded trade is planned at FULL size, so the headline
    // has to say 100%, not 0%.
    pctOfFull: effective ? ladderConfig().ratingPct[effective] : 100,
  });
}

/** Write a planner field without stealing the caret from someone typing in it. */
function setFieldValue(symbol: string, field: 'stop' | 'target' | 'shares', value: string): void {
  const el2 = document.querySelector<HTMLInputElement>(
    `input[data-tp="${field}"][data-sym="${CSS.escape(symbol)}"]`,
  );
  if (el2 && document.activeElement !== el2) el2.value = value;
}

/**
 * Live charts, one per card. Held so the levels can move without a rebuild.
 *
 * `drawCandles` creates a canvas, a ResizeObserver and up to nine series. `recalcPlan`
 * runs on every keystroke in the Entry box, so building one per call would leak a chart
 * per character typed — and `destroy()` has to be called, not just have the node
 * dropped, or the observer outlives the chart it resizes.
 */
const planCharts = new Map<string, CandleChart>();

function destroyPlanCharts(): void {
  for (const c of planCharts.values()) c.destroy();
  planCharts.clear();
}

/**
 * The plan, drawn on the same chart the rest of the app draws stocks on.
 *
 * ── WHY `drawCandles` AND NOT THE SVG MINI-CHART ─────────────────────────────
 * It was `candleChart`, the hand-rolled SVG used for the playbook's textbook figures.
 * That is the right tool for a diagram with six invented bars on it and the wrong one
 * here: a real setup is judged by zooming into the base, reading volume against its
 * average, and checking where price sits on the moving averages the rest of the app
 * shows. A figure the user cannot interrogate invites them to go and open the chart
 * somewhere else, which is where the plan stops matching what they are looking at.
 *
 * So this is the stock-detail chart, with the same candles, volume, volume MA and EMA
 * colours — plus the three price lines that are this panel's whole point.
 */
function paintPlanChart(symbol: string): void {
  const box = document.querySelector<HTMLElement>(`[data-tp-chart="${CSS.escape(symbol)}"]`);
  const e = planEdits.get(symbol);
  const bars = planBars.get(symbol);
  if (!box || !e) return;
  if (!bars?.length) { box.innerHTML = ''; return; }

  // Back to USD: these lines are drawn against the candles, and the candles are raw closes.
  // A €198 line on a $232 chart would be off the bottom of the axis.
  const overlay: TradeOverlay = {
    entry: e.entry === null ? null : levelToUsd(e.entry),
    stop: e.stop === null ? null : levelToUsd(e.stop),
    target: e.target === null ? null : levelToUsd(e.target),
  };

  // Already drawn: move the lines and leave the candles, the zoom and the scroll
  // position exactly where the user put them.
  const existing = planCharts.get(symbol);
  if (existing && box.firstChild) { existing.setOverlay(overlay); return; }

  existing?.destroy();
  // The six EMAs of the detail chart are too many for a card this size. These four are
  // the ones a swing entry is actually judged against: 10 and 21 for the trigger, 50 for
  // the trend the setup lives in, 200 for whether it should be a long at all.
  const emaState = { 5: false, 10: true, 21: true, 50: true, 150: false, 200: true };
  planCharts.set(symbol, drawCandles(box, bars.slice(-160), overlay, emaState, { height: 260 }));
}

/**
 * Clicks inside the grade panel, delegated from the container.
 *
 * ── WHY DELEGATED, AND WHY ONLY ONCE ────────────────────────────────────────
 * `paintGradePanel` replaces these buttons on every keystroke in the Entry box, so a
 * listener bound to a button itself would be gone by the time the user reached for it.
 * And the container SURVIVES a recompute — `computePlans` only rewrites its children — so
 * binding again on each pass would stack listeners, and the second one would toggle the
 * criteria list straight back shut. Hence the flag: one listener per container, for life.
 */
function wireGradeDelegates(root: HTMLElement): void {
  if (root.dataset.tpGradeWired === '1') return;
  root.dataset.tpGradeWired = '1';

  root.addEventListener('click', (ev) => {
    const hit = ev.target as HTMLElement | null;
    if (!hit) return;

    const toggle = hit.closest<HTMLElement>('[data-tp-crit]');
    if (toggle) {
      const sym = toggle.dataset.tpCrit!;
      if (!planEdits.has(sym)) return;
      const e = planEdits.get(sym)!;
      e.criteriaOpen = !e.criteriaOpen;
      recalcPlan(sym);
      return;
    }

    // Answering one of the questions the app cannot measure. Clicking the answer that is
    // already chosen clears it back to UNASKED — the state a checkbox cannot express, and
    // the one the user needs the moment they realise they were guessing.
    const btn = hit.closest<HTMLElement>('[data-tp-ans]');
    if (!btn) return;
    const sym = btn.dataset.tpAns!;
    const e = planEdits.get(sym);
    if (!e) return;
    const key = btn.dataset.key!;
    const want = btn.dataset.val === 'yes';
    if (e.answers[key] === want) delete e.answers[key];
    else e.answers[key] = want;
    // Saved, because this is the answer that took thought. It is also what makes the Buy form's
    // acknowledgement expire: the tick was against the grade these answers used to produce.
    persistPlan(sym);
    recalcPlan(sym);
  });
}

/** Wire input/blur/click handlers for every editable planner card. */
function wirePlanEdits(ctx: AppContext, root: HTMLElement): void {
  // Buy this plan. Disabled until there is something to buy — `recalcPlan` owns that.
  root.querySelectorAll<HTMLButtonElement>('[data-tp-buy]').forEach((b) =>
    b.addEventListener('click', () => {
      // Guarded against a double-press: the dialog is awaited, and a second click while it
      // is open would queue a second identical trade behind the first.
      if (b.disabled) return;
      const sym = b.dataset.tpBuy!;
      b.disabled = true;
      // Only the button comes back, not the hint: `buyFromPlan` has left either the
      // confirmation or the reason it failed there, and that is the one thing the user needs
      // to read. `paintBuyButton` would overwrite it with the ready line.
      void buyFromPlan(ctx, sym).finally(() => { b.disabled = buyBlocker(sym) !== null; });
    }),
  );

  // Field inputs (entry/stop/target/shares).
  root.querySelectorAll<HTMLInputElement>('input[data-tp][data-sym]').forEach((el2) => {
    el2.addEventListener('input', () => {
      const sym = el2.dataset.sym!;
      const e = planEdits.get(sym);
      if (!e) return;
      const key = el2.dataset.tp!;
      const raw = el2.value.trim();
      if (key === 'shares') {
        // Typing a share count is the user taking the size off the playbook. Say so by
        // dropping the chip highlight, so the screen does not claim the book chose this.
        e.shares = Number(raw) || 0;
        e.sizeMode = 'manual';
        el2.closest('.tp-card')?.querySelectorAll('[data-tp-size]').forEach((x) => x.classList.remove('active'));
        recalcPlan(sym);
        return;
      }
      const v = raw === '' ? null : Number(raw.replace(',', '.'));
      if (key === 'entry') e.entry = v;
      // A typed stop or target becomes theirs for good — until they clear the box,
      // which is the one gesture that plainly means "you take it back".
      if (key === 'stop') { e.stop = v; e.ownStop = raw !== ''; }
      if (key === 'target') { e.target = v; e.ownTarget = raw !== ''; }
      recalcPlan(sym);
    });
  });

  // Setup dropdown — a different playbook row, so different stop, target and size.
  root.querySelectorAll<HTMLSelectElement>('[data-tp-setup]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const sym = sel.dataset.tpSetup!;
      const e = planEdits.get(sym);
      if (!e) return;
      e.setup = isSetupKey(sel.value) ? sel.value : '';
      persistPlan(sym);
      recalcPlan(sym);
    });
  });

  // Grade dropdown — now an OVERRIDE of the computed letter, not the grade itself.
  // Blank means "use the score", which is the default and where it should normally stay.
  root.querySelectorAll<HTMLSelectElement>('[data-tp-rating]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const sym = sel.dataset.tpRating!;
      const e = planEdits.get(sym);
      if (!e) return;
      e.gradeOverride = isRating(sel.value) ? sel.value : null;
      persistPlan(sym);
      recalcPlan(sym);
    });
  });

  wireGradeDelegates(root);

  // Rich-text note — open the formatting editor; save back the HTML.
  root.querySelectorAll<HTMLElement>('[data-tp-noteedit]').forEach((b) => {
    b.addEventListener('click', async () => {
      const sym = b.dataset.tpNoteedit!;
      const e = planEdits.get(sym);
      if (!e) return;
      const res = await richNoteDialog(`${sym} · ${t('wl.plan.note')}`, e.note ?? '', { lang: getLang() === 'vi' ? 'vi' : 'en' });
      if (res === null) return;
      e.note = res;
      // From here the planner stops rewriting it. Regenerating over someone's own
      // words on the next keystroke would lose work with no way to get it back.
      e.noteEdited = true;
      // And this is the note the Buy form shows for this symbol — the user asked for one note,
      // not two. The generated version is deliberately NOT saved: both screens rebuild it from
      // the same `planLines`, so storing it would only let a stale copy of it come back.
      persistPlan(sym);
      const box = root.querySelector<HTMLElement>(`[data-tp-note="${CSS.escape(sym)}"]`);
      if (box) box.innerHTML = isNoteEmpty(res) ? `<span class="muted">${t('wl.plan.noteph')}</span>` : sanitizeNoteHtml(res);
    });
  });

  /**
   * Print the card as a standalone trade plan — the user's "a button to print as html or pdf
   * (similar to case study for the trade plan)".
   *
   * Built from the card as it stands rather than from what was last saved: the generated note
   * and the levels are never written to storage (see `cardSymbolPlan`), so printing the stored
   * plan would hand the user a document missing the numbers they are looking at.
   */
  root.querySelectorAll<HTMLElement>('[data-tp-print]').forEach((b) => {
    b.addEventListener('click', () => {
      const sym = b.dataset.tpPrint!;
      const e = planEdits.get(sym);
      const plan = cardSymbolPlan(sym);
      if (!e || !plan) return;
      const grade = cardGrade(sym);
      const rating = e.gradeOverride ?? grade?.grade ?? null;
      printPlanReport({
        plan,
        grade,
        effective: rating,
        levels: { entry: e.entry, stop: e.stop, target: e.target },
        shares: e.shares,
        // `planCcy`: the boxes and the report's money now agree, because the boxes are in the
        // currency the user is buying in and the report derives its money from these prices.
        currency: planCcy,
        // Only the chart needs it, and only in euros — see `PlanReportInput.fxRate`.
        ...(planRate() > 0 ? { fxRate: planRate() } : {}),
        date: planDate,
        bars: planBars.get(sym) ?? [],
        pctOfFull: rating ? ladderConfig().ratingPct[rating] : 100,
        vi: getLang() === 'vi',
      });
    });
  });

  // Size chips: the playbook's own number, or a % of equity.
  root.querySelectorAll<HTMLElement>('[data-tp-size]').forEach((b) => {
    b.addEventListener('click', () => {
      const sym = b.dataset.tpSize!;
      const e = planEdits.get(sym);
      if (!e) return;
      if (b.dataset.pct === 'book') { e.sizeMode = 'plan'; } else { e.sizeMode = 'pct'; e.sizePct = Number(b.dataset.pct); }
      const card = b.closest('.tp-card')!;
      card.querySelectorAll('[data-tp-size]').forEach((x) => x.classList.toggle('active', x === b));
      const custom = card.querySelector<HTMLInputElement>('[data-tp-sizeinput]');
      if (custom) custom.value = '';
      recalcPlan(sym);
    });
  });

  // Custom size % input.
  root.querySelectorAll<HTMLInputElement>('[data-tp-sizeinput]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const sym = inp.dataset.tpSizeinput!;
      const e = planEdits.get(sym);
      if (!e) return;
      const v = inp.value.trim();
      if (v === '') { return; }
      e.sizeMode = 'pct'; e.sizePct = Number(v.replace(',', '.')) || 0;
      inp.closest('.tp-card')!.querySelectorAll('[data-tp-size]').forEach((x) => x.classList.remove('active'));
      recalcPlan(sym);
    });
  });
}
