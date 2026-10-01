/**
 * Case Studies tab — a journal of annotated past setups. List view → editor
 * (symbol, key date, levels, dated catalysts, notes) → detail view with a
 * static SVG chart of the ±window around the key date, downloadable as a
 * self-contained HTML report (print → Save as PDF).
 */
import type { Bar, OHLCV } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { getLang, t } from '../ui/i18n.js';
import { downloadHtml } from '../ui/exportFile.js';
import {
  blankCase,
  deleteCase,
  loadCase,
  loadCaseIndex,
  saveCase,
  type CaseStudy,
  type CaseOutcome,
  type CaseRating,
  type Catalyst,
} from '../caseStudies/store.js';
import { caseSvgChart, windowBars } from '../caseStudies/svgChart.js';
import { countChip, sectionHead } from '../ui/sectionHead.js';
import { cbButton, commandBar } from '../ui/commandBar.js';
import { caseStudyHtml } from '../caseStudies/report.js';
import { richNoteDialog, sanitizeNoteHtml, isNoteEmpty } from '../ui/richNote.js';
import {
  askChatGpt,
  copyToClipboard,
  gptBadgeHtml,
  loadGptUrl,
  wireGptBadge,
} from '../ui/askChatGpt.js';
import { buildCaseStudyPrompt, type CaseStudyPromptContext } from '@screener/core';
// A study filed from the Trade Planner carries the plan it was filed from. Rendered with the
// planner's own report so there is one trade-plan layout in the app, not two — see
// `portfolio/planReport.ts`.
import { openPlanReport } from '../portfolio/planReport.js';
// The study's levels are stored in dollars; the plan it came from was typed in the planner's
// currency, usually euros. Reading one document in two currencies needs the rate — see
// `planReportInputFor`.
import { ensureEurUsd, eurUsdForDate, hasEurUsd } from '../portfolio/fx.js';
// One window rule for a plan's chart, shared with the planner so a filed study draws the same
// picture the card it came from drew.
import { candleDivisor, inCurrency, planChartWindow } from '../portfolio/planExit.js';
// Read at render time, not imported as a constant: the list includes the user's own rows.
import { exitReasonKeyOfText, exitReasonList } from '../portfolio/exitReasons.js';
// Report dates for the chart's E flags. Same source the planner card and the stock modal use, so
// the three charts mark the same days — and it never throws, so a failed lookup just means no flags.
import { fetchEarningsReports } from '../adapters/earningsDates.js';
import { loadPlaybookConfig } from '../portfolio/playbook.js';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Selectable setup types. `value` is stored; `label` shown; `phrase` used to
 * build the auto title (e.g. "Feb 2024 VCP Breakout"). */
const SETUP_TYPES: { value: string; en: string; vi: string; phrase: string }[] = [
  { value: 'VCP', en: 'VCP', vi: 'VCP', phrase: 'VCP Breakout' },
  { value: 'EP', en: 'Episodic Pivot', vi: 'Điểm xoay đột biến', phrase: 'Episodic Pivot' },
  { value: 'Mean Reversion', en: 'Mean Reversion', vi: 'Hồi quy trung bình', phrase: 'Mean Reversion' },
  { value: 'Breakout', en: 'Breakout', vi: 'Bứt phá', phrase: 'Breakout' },
  { value: 'Pullback', en: 'Pullback', vi: 'Điều chỉnh', phrase: 'Pullback' },
  { value: 'Surge', en: 'Surge', vi: 'Tăng vọt', phrase: 'Surge' },
  { value: 'Other', en: 'Other', vi: 'Khác', phrase: 'Setup' },
];

/** Build "Feb 2024 VCP Breakout" from symbol + key date + setup type. */
function autoTitle(symbol: string, keyDate: string, setupType: string): string {
  const phrase = SETUP_TYPES.find((s) => s.value === setupType)?.phrase ?? setupType ?? 'Setup';
  const d = keyDate ? new Date(keyDate + 'T00:00:00') : null;
  const mon = d ? d.toLocaleString('en-US', { month: 'short' }) : '';
  const yr = d ? d.getFullYear() : '';
  const sym = symbol ? symbol.toUpperCase() + ' ' : '';
  return `${sym}${mon} ${yr} ${phrase}`.replace(/\s+/g, ' ').trim();
}

// Cache the fetched bars per symbol so editing/redrawing doesn't refetch.
const barCache = new Map<string, Bar[]>();

async function fetchBars(ctx: AppContext, symbol: string): Promise<Bar[]> {
  const key = symbol.toUpperCase();
  if (barCache.has(key)) return barCache.get(key)!;
  // 5y covers any ±6mo window for recent setups; max would be overkill per render.
  const ohlcv: OHLCV = await ctx.data.getOHLCV(key, '5y').catch(() => ({ symbol: key, bars: [] }));
  barCache.set(key, ohlcv.bars);
  return ohlcv.bars;
}

const OUTCOMES: CaseOutcome[] = ['open', 'win', 'loss', 'scratch'];
const OUTCOME_COLOR: Record<CaseOutcome, string> = {
  win: 'var(--accent)',
  loss: 'var(--danger)',
  open: '#5b8cff',
  scratch: 'var(--faint)',
};
function outcomeLabel(o: CaseOutcome, vi: boolean): string {
  if (vi) return { open: 'Đang mở', win: 'Thắng', loss: 'Thua', scratch: 'Hòa' }[o];
  return { open: 'Open', win: 'Win', loss: 'Loss', scratch: 'Scratch' }[o];
}

const RATINGS: CaseRating[] = ['', 'A', 'B', 'C', 'D'];
/** Grade → colour: A green, B blue, C amber, D red. */
const RATING_COLOR: Record<string, string> = {
  A: 'var(--accent)',
  B: '#5b8cff',
  C: 'var(--warn, #ffb648)',
  D: 'var(--danger)',
};
/** A small "Rating A" badge, or '' when ungraded. */
function ratingBadge(r: CaseRating | undefined, vi: boolean): string {
  if (!r) return '';
  const col = RATING_COLOR[r] ?? 'var(--faint)';
  return `<span class="badge" style="border-color:${col};color:${col}" title="${vi ? 'Xếp hạng' : 'Rating'}">${vi ? 'Hạng' : 'Grade'} ${r}</span>`;
}

export function renderCaseStudies(ctx: AppContext): void {
  void renderList(ctx);
}

// ── List view ─────────────────────────────────────────────────────────────────
async function renderList(ctx: AppContext): Promise<void> {
  const root = $('#tab-casestudies')!;
  const vi = getLang() === 'vi';
  // The exit-reason datalist in the editor includes the user's own rows, which live in the
  // playbook config. Loaded once when the tab opens rather than in the editor, because it is a
  // read of already-synced storage and a dropdown that silently drops the custom half of the list
  // on a cold start is the kind of bug nobody reports.
  await loadPlaybookConfig(ctx).catch(() => null);
  const idx = await loadCaseIndex(ctx);

  root.innerHTML = `
    <h1>${vi ? 'Hồ sơ Setup' : 'Case Studies'}</h1>
    <p class="subtitle">${
      vi
        ? 'Ghi lại các thiết lập trong quá khứ: ngày then chốt, mức mua/cắt lỗ/mục tiêu, chất xúc tác và ghi chú — kèm biểu đồ và xuất báo cáo.'
        : 'Document past setups: the key date, entry/stop/target, catalysts and notes — with a chart and a downloadable report.'
    }</p>
    ${commandBar({
      actions: [cbButton({ id: 'cs-new', label: vi ? 'Hồ sơ mới' : 'New case study', icon: 'plus', primary: true })],
      meta: `<span class="cb-hint">${idx.length} ${vi ? 'hồ sơ' : idx.length === 1 ? 'study' : 'studies'}</span>`,
    })}
    <div id="cs-list"></div>`;

  $('#cs-new')!.addEventListener('click', () => openEditor(ctx, blankCase(todayIso())));

  const list = $('#cs-list')!;
  if (!idx.length) {
    list.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">${
      vi ? 'Chưa có hồ sơ nào. Bấm “＋ Hồ sơ mới” để bắt đầu.' : 'No case studies yet. Click “＋ New case study” to start.'
    }</div>`;
    return;
  }

  for (const m of idx) {
    const card = el(`
      <div class="card cs-card" style="margin-bottom:10px;cursor:pointer">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div>
            <strong style="font-size:15px">${m.symbol}</strong>
            <span class="muted" style="margin-left:8px">${m.title ? escapeAttr(m.title) : ''}</span>
          </div>
          <div class="row" style="gap:8px">
            ${ratingBadge(m.rating, vi)}
            <span class="badge" style="border-color:${OUTCOME_COLOR[m.outcome]};color:${OUTCOME_COLOR[m.outcome]}">${outcomeLabel(m.outcome, vi)}</span>
            <span class="muted" style="font-size:12px">${m.keyDate}</span>
          </div>
        </div>
      </div>`);
    card.addEventListener('click', () => void openDetail(ctx, m.id));
    list.appendChild(card);
  }
}

// ── Detail view ─────────────────────────────────────────────────────────────────
/**
 * Which detail view is the current one. Bumped on every open so a late fetch that belongs to the
 * study the user has already navigated away from stays out of the one now on screen — the element
 * check alone cannot tell "my chart" from "somebody else's chart with my id's name on it".
 */
let detailToken = 0;

async function openDetail(ctx: AppContext, id: string): Promise<void> {
  const root = $('#tab-casestudies')!;
  const vi = getLang() === 'vi';
  const token = ++detailToken;
  const study = await loadCase(ctx, id);
  if (!study) return void renderList(ctx);

  /*
   * The study's own currency, and the rate its chart needs.
   *
   * Bars are dollars, always. A study whose levels were typed in euros (`CaseStudy.currency`) is
   * therefore drawn by converting the CANDLES at the key date's rate — the same direction, and the
   * same one-rate-for-the-window rule, as the planner and the printed plan. From the device cache
   * only: opening a journal entry must not start a market-data download, and a euro study with no
   * cached rate shows a note instead of a chart whose lines would be off the axis.
   */
  const sym = caseSym(study);
  const eurCase = study.currency === 'EUR';
  // A rate is needed whenever the study's currency is not the ticker's quote currency: a euro
  // study of AAPL, or a dollar study of ALV.DE.
  const caseCcy = eurCase ? 'EUR' : 'USD';
  const needsFx = candleDivisor(study.symbol, caseCcy, 1) !== 0;
  if (needsFx) await ensureEurUsd(ctx).catch(() => {});
  const caseFx = needsFx && hasEurUsd() ? eurUsdForDate(study.keyDate) : 0;
  const caseDiv = candleDivisor(study.symbol, caseCcy, caseFx);

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
      <button id="cs-back" class="btn-outline">← ${vi ? 'Quay lại' : 'Back'}</button>
      <div class="row" style="gap:8px">
        ${study.plan
          ? `<button id="cs-plan" class="btn-outline" title="${
            vi
              ? 'Xem kế hoạch giao dịch đã được đóng băng khi lưu hồ sơ này — hạng, bảng tiêu chí và các mức giá lúc đó'
              : 'Read the trade plan frozen when this study was filed — the grade, the scorecard and the levels as they stood'
          }">👁 ${vi ? 'Xem kế hoạch' : 'View plan'}</button>`
          : ''}
        <button id="cs-edit" class="btn-outline">${vi ? '✎ Sửa' : '✎ Edit'}</button>
        <button id="cs-download" class="btn-outline">${vi ? '⬇ Tải HTML' : '⬇ Download HTML'}</button>
        <button id="cs-delete" class="btn-outline" style="color:var(--danger)">🗑</button>
      </div>
    </div>
    <h1 style="margin-bottom:2px">${study.symbol} <span class="badge" style="border-color:${OUTCOME_COLOR[study.outcome]};color:${OUTCOME_COLOR[study.outcome]};vertical-align:middle">${outcomeLabel(study.outcome, vi)}</span>${study.rating ? ` <span style="vertical-align:middle">${ratingBadge(study.rating, vi)}</span>` : ''}</h1>
    <p class="subtitle">${escapeAttr(study.title || '')} ${study.title ? '·' : ''} ${escapeAttr(study.setupType)} · ${vi ? 'ngày then chốt' : 'key date'} <b>${study.keyDate}</b></p>
    <div class="card" style="padding:10px;margin-bottom:14px">
      <div class="row" style="gap:6px;margin-bottom:8px">
        <span class="muted" style="font-size:12px">${vi ? 'Cửa sổ' : 'Window'}:</span>
        ${[1, 3, 6].map((mo) => `<button class="range-btn ${mo === study.windowMonths ? 'active' : ''}" data-win="${mo}">±${mo}M</button>`).join('')}
      </div>
      <div id="cs-chart">${vi ? 'Đang tải…' : 'Loading…'}</div>
    </div>
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      ${detailStat(vi ? 'Mua' : 'Entry', money(study.entry, sym), '#5b8cff')}
      ${detailStat(vi ? 'Cắt lỗ' : 'Stop', money(study.stop, sym), 'var(--danger)')}
      ${detailStat(vi ? 'Mục tiêu' : 'Target', money(study.target, sym), 'var(--accent)')}
      ${detailStat('R:R', plannedRr(study))}
      ${detailStat(vi ? 'Ngày thoát' : 'Exit date', study.exitDate ?? '—')}
      ${detailStat(vi ? 'Giá thoát' : 'Exit price', money(study.exitPrice, sym))}
      ${detailStat(vi ? 'Kết quả R' : 'Result R', study.rMultiple != null ? study.rMultiple.toFixed(2) + 'R' : '—', study.rMultiple != null ? (study.rMultiple >= 0 ? 'var(--up)' : 'var(--danger)') : undefined)}
      ${detailStat(vi ? 'Loại' : 'Setup', escapeAttr(study.setupType))}
      ${detailStat(vi ? 'Xếp hạng' : 'Rating', study.rating || '—', study.rating ? RATING_COLOR[study.rating] : undefined)}
    </div>
    ${study.exitReason
      ? `<div class="card" style="padding:10px;margin-bottom:14px;border-left:3px solid var(--violet)">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">${vi ? 'Lý do thoát' : 'Why it was closed'}</div>
          <div>${escapeAttr(study.exitReason)}</div>
        </div>`
      : ''}
    ${sectionHead(vi ? '📅 Chất xúc tác & tin tức' : '📅 Catalysts & news', [countChip(study.catalysts.length, undefined, vi ? 'mốc' : 'dated')])}
    <div class="card" style="margin-bottom:14px">${catalystListHtml(study, vi)}</div>
    ${sectionHead(vi ? '📝 Ghi chú & bài học' : '📝 Notes & lessons')}
    <div class="card note-html" style="line-height:1.7">${!isNoteEmpty(study.notes) ? sanitizeNoteHtml(study.notes) : `<span class="muted">${vi ? 'Chưa có ghi chú.' : 'No notes.'}</span>`}</div>
    <div id="cs-ask" style="margin-top:14px"></div>`;

  $('#cs-back')!.addEventListener('click', () => void renderList(ctx));
  $('#cs-edit')!.addEventListener('click', () => openEditor(ctx, study));
  $('#cs-delete')!.addEventListener('click', async () => {
    if (!confirm(vi ? `Xóa hồ sơ ${study.symbol}?` : `Delete case study for ${study.symbol}?`)) return;
    await deleteCase(ctx, id);
    void renderList(ctx);
  });

  // Needed for the ask section's comparison table; a failure there must not cost the
  // user the chart, so an empty index just means no comparison.
  const idx = await loadCaseIndex(ctx).catch(() => []);

  // Fetch bars and draw the chart; window buttons redraw from the same bars.
  const bars = await fetchBars(ctx, study.symbol);
  let windowMonths = study.windowMonths;
  /*
   * Earnings report dates, filled in AFTER the first draw rather than awaited beside the bars.
   * The chart is the reason this view exists, so it must not wait on a second network call to
   * appear; when the dates land the chart is simply drawn again with them. Empty until then, and
   * empty forever for a symbol Nasdaq has nothing on — either way the picture is the old one.
   */
  let earnDates: readonly string[] = [];
  const drawChart = () => {
    if (caseDiv === null) {
      $('#cs-chart')!.innerHTML = `<p class="muted" style="margin:0">${
        vi
          ? 'Không vẽ được đồ thị: hồ sơ này ghi giá bằng EUR nhưng chưa có tỷ giá EUR/USD của ngày then chốt trong bộ nhớ.'
          : 'No chart: this study’s prices are in EUR and no cached EUR/USD rate for the key date was found.'
      }</p>`;
      return;
    }
    const win = inCurrency(windowBars(bars, study.keyDate, windowMonths), caseDiv);
    // `study` itself, not a spread with the live `windowMonths` folded in: the renderer takes
    // levels and dates only (see `ChartSubject`), and `windowBars` above has already applied
    // the window. The spread was copying a field the chart never read.
    // The one field that IS spread in is `earnings`: report dates are not part of a stored study
    // (see `ChartSubject.earnings` for why they are not catalysts), they are looked up per view.
    const svg = caseSvgChart(win, { ...study, earnings: earnDates });
    // Caption, because an SVG glyph cannot be hovered: it says what E means, where it came from,
    // and — when nothing falls inside the window — why, since Nasdaq's four quarters cannot reach
    // a study from two years ago and a silently flagless chart reads as a broken feature.
    const lo = win[0]?.date ?? '';
    const hi = win[win.length - 1]?.date ?? '';
    const note = !earnDates.length || !win.length
      ? ''
      : earnDates.some((d) => d >= lo && d <= hi)
        ? `<div class="tp-earnhint">${t('wl.plan.earn')} <span class="muted">· ${t('wl.plan.earnsrc')}</span></div>`
        : `<div class="tp-earnhint"><span class="muted">${t('wl.plan.earnnone')}</span></div>`;
    $('#cs-chart')!.innerHTML = svg + note;
  };
  drawChart();
  void fetchEarningsReports(study.symbol).then((rows) => {
    if (token !== detailToken) return;
    earnDates = rows.map((r) => r.date);
    // The view may also have gone back to the list, which leaves the token alone.
    if (earnDates.length && $('#cs-chart')) drawChart();
  });
  root.querySelectorAll<HTMLElement>('[data-win]').forEach((b) =>
    b.addEventListener('click', async () => {
      windowMonths = Number(b.dataset.win);
      root.querySelectorAll('[data-win]').forEach((x) => x.classList.toggle('active', x === b));
      drawChart();
      // Persist the preferred window so the export matches.
      if (windowMonths !== study.windowMonths) {
        study.windowMonths = windowMonths;
        await saveCase(ctx, { ...study, updatedAt: todayIso() });
      }
    }),
  );

  $('#cs-download')!.addEventListener('click', () => {
    // Whatever the chart on screen is marking, the downloaded file marks too — including nothing,
    // if the lookup found nothing or has not landed yet.
    // The rate too: the file is standalone and cannot look one up, so a euro study exported
    // without it would arrive with no chart at all.
    const html = caseStudyHtml({ ...study, windowMonths }, bars, earnDates, caseFx);
    downloadHtml(html, `case-study-${study.symbol}-${study.keyDate}`);
  });

  // The frozen plan, read back in the planner's own layout. Only present on studies filed
  // from the Trade Planner — the button is not rendered otherwise.
  $('#cs-plan')?.addEventListener('click', async () => {
    const p = study.plan;
    if (!p) return;
    // A rate is needed only when the study and the plan disagree about the currency — which now
    // happens only on OLD studies, filed when the planner converted its euro levels to dollars
    // before writing them (`CaseStudy.currency` did not exist yet). On anything filed since, both
    // halves are in one currency and nothing is converted. Cache only: opening a report must not
    // start a market-data download.
    await ensureEurUsd(ctx).catch(() => {});
    const eur = p.currency === 'EUR';
    const sameCcy = (study.currency ?? 'USD') === p.currency;
    // Two different jobs, and conflating them was a bug worth naming: `planFx` lets the report draw
    // euro levels on dollar candles (needed for EVERY euro plan), while `rate` restates the study's
    // exit price in the plan's currency (needed only when the two disagree). One variable for both
    // meant a same-currency euro study was printed with no chart.
    // Any plan may need it now, not just a euro one: a dollar plan of ALV.DE draws euro candles.
    const planFx = hasEurUsd() ? eurUsdForDate(p.date) : 0;
    const rate = sameCcy ? 0 : planFx;
    // Back to the plan's currency with the PLAN date's rate — the same one the levels beside it
    // are in. The exit-date rate would be more literal and less useful: an R multiple built from
    // an entry at one rate and an exit at another is part FX move.
    const toPlanCcy = (v: number | null): number | null =>
      v === null || sameCcy ? v : rate > 0 ? Math.round((v / rate) * 100) / 100 : eur ? null : v;
    const entry = study.entry;
    openPlanReport(
      {
        plan: p.plan,
        grade: p.grade,
        effective: p.effective,
        levels: p.levels,
        shares: p.shares,
        currency: p.currency,
        ...(planFx > 0 ? { fxRate: planFx } : {}),
        date: p.date,
        // The same window the planner card drew — four months of the base before the trade date,
        // two after it (or past the exit on a longer hold). One shared function rather than a
        // filter written twice, because a post-mortem that framed the chart differently from the
        // card it was filed from would be a second opinion nobody asked for.
        // Raw dollar bars: `planReportHtml` does its own conversion from `fxRate`, so converting
        // here would divide by the rate twice.
        bars: planChartWindow(bars, p.date, study.exitDate),
        // Report dates are looked up now, not frozen into the plan when it was filed: a stored
        // plan records what the app DECIDED, and where the earnings fell is a fact about the
        // market that no amount of re-reading changes.
        earnings: earnDates,
        pctOfFull: p.pctOfFull,
        vi,
        exit: {
          date: study.exitDate,
          // null rather than the dollar number when euro levels meet an unknown rate: printing
          // "€214.30" over a USD price is a wrong statement, where a dash is only a missing one.
          price: toPlanCcy(study.exitPrice),
          reason: study.exitReason ?? '',
          outcome: study.outcome,
          rMultiple: study.rMultiple,
          // A ratio of two prices in the SAME currency, whichever that is, so no rate is needed.
          pctGain: study.exitPrice != null && entry != null && entry > 0
            ? Math.round(((study.exitPrice - entry) / entry) * 10000) / 100
            : null,
        },
      },
      {
        title: `${study.symbol} · ${t('plan.viewttl')}`,
        print: t('pf.tx.planprint'),
        close: t('pf.tx.planclose'),
      },
    );
  });

  // Last, and not awaited above: the ask section needs the configured GPT link from
  // storage, and the chart is what the user is waiting to see.
  void renderAskSection(ctx, study, idx);
}

// ── Ask ChatGPT ─────────────────────────────────────────────────────────────────
/**
 * The "have ChatGPT analyse this case" section of the detail view.
 *
 * The prompt is built from the record itself (`buildCaseStudyPrompt` in core), so it
 * arrives carrying the symbol, key date, setup, levels and recorded catalysts — and
 * asks the model to VERIFY those against real looked-up data rather than accept
 * them. A case study analysed around the wrong session, or from invented volume
 * ratios, is worse than none: it gets filed and cited later.
 *
 * `otherCases` feeds the comparison table. Titles only — the other studies' notes
 * would blow past any URL length and are not what a comparison needs.
 */
async function renderAskSection(
  ctx: AppContext,
  study: CaseStudy,
  idx: readonly { id: string; symbol: string; title: string; keyDate: string }[],
): Promise<void> {
  const host = $('#cs-ask');
  if (!host) return;
  const vi = getLang() === 'vi';
  await loadGptUrl(ctx);
  // The detail view can be replaced while storage was in flight (Back, Edit); a
  // detached host would take the listeners with it and paint nothing.
  if (!host.isConnected) return;

  const context: CaseStudyPromptContext = {
    symbol: study.symbol,
    keyDate: study.keyDate,
    setupType: study.setupType,
    title: study.title,
    entry: study.entry,
    stop: study.stop,
    target: study.target,
    exitDate: study.exitDate,
    exitPrice: study.exitPrice,
    rMultiple: study.rMultiple,
    outcome: study.outcome,
    rating: study.rating,
    // So the model is not asked to verify euro prices against the dollar quotes it will look up,
    // and answer that the user's own record is wrong.
    currency: study.currency ?? 'USD',
    catalysts: study.catalysts,
    otherCases: idx
      .filter((m) => m.id !== study.id)
      .slice(0, 8)
      .map((m) => `${m.symbol} ${m.keyDate}${m.title ? ` (${m.title})` : ''}`),
  };
  const prompt = buildCaseStudyPrompt(context, vi ? 'vi' : 'en');

  const paint = (): void => {
    host.innerHTML = `
      ${sectionHead(vi ? '🤖 Nhờ ChatGPT phân tích' : '🤖 Have ChatGPT analyse this')}
      <div class="card" style="padding:12px">
        <p class="muted" style="margin:0 0 10px;font-size:12px;line-height:1.55">${
          vi
            ? 'Gửi hồ sơ này cho ChatGPT để nó tra dữ liệu giá/khối lượng thật quanh ngày then chốt, tính tỷ lệ volume breakout, dựng chuỗi chất xúc tác theo ngày và nêu cả điểm mạnh lẫn cờ đỏ.'
            : 'Send this case to ChatGPT so it looks up the real price/volume around the key date, computes the breakout volume ratios, reconstructs the dated catalyst chain, and names the red flags as well as the strengths.'
        }</p>
        ${gptBadgeHtml()}
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn" id="cs-ask-go">${t('prompts.ask')}</button>
          <button class="btn-outline" id="cs-ask-copy">${t('prompts.copy')}</button>
          <button class="range-btn" id="cs-ask-show">${t('prompts.show')}</button>
        </div>
        <pre id="cs-ask-text" class="hidden" style="white-space:pre-wrap;font-size:11px;line-height:1.5;
          background:var(--surface);border-radius:8px;padding:10px;margin:10px 0 0;max-height:280px;overflow:auto">${escapeAttr(prompt)}</pre>
        <p class="muted" style="font-size:10px;margin:8px 0 0;line-height:1.5">${t('prompts.ask.hint')}</p>
        <p class="muted" style="font-size:10px;margin:6px 0 0;line-height:1.5">${t('prompts.disclaimer')}</p>
      </div>`;

    $('#cs-ask-go')!.addEventListener('click', (e) =>
      askChatGpt(prompt, e.currentTarget as HTMLElement),
    );
    $('#cs-ask-copy')!.addEventListener('click', (e) =>
      void copyToClipboard(prompt, e.currentTarget as HTMLElement),
    );
    $('#cs-ask-show')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      const hidden = $('#cs-ask-text')!.classList.toggle('hidden');
      btn.textContent = hidden ? t('prompts.show') : t('prompts.hide');
    });
    wireGptBadge(host, ctx, paint);
  };

  paint();
}

// ── Editor view ─────────────────────────────────────────────────────────────────
function openEditor(ctx: AppContext, study: CaseStudy): void {
  const root = $('#tab-casestudies')!;
  const vi = getLang() === 'vi';
  // Local working copy of catalysts so add/remove is live before save.
  const catalysts: Catalyst[] = study.catalysts.map((c) => ({ ...c }));

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
      <button id="cs-cancel" class="btn-outline">← ${vi ? 'Hủy' : 'Cancel'}</button>
      <button id="cs-save" class="btn">${vi ? 'Lưu hồ sơ' : 'Save case study'}</button>
    </div>
    <h1>${study.symbol ? (vi ? 'Sửa hồ sơ' : 'Edit case study') : vi ? 'Hồ sơ mới' : 'New case study'}</h1>
    <div class="card" style="margin-bottom:14px">
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px">
        <div><label class="field-label">${vi ? 'Mã' : 'Symbol'}</label><input id="f-symbol" class="field" value="${escapeAttr(study.symbol)}" placeholder="NVDA" /></div>
        <div><label class="field-label">${vi ? 'Ngày then chốt' : 'Key date'}</label><input id="f-keydate" class="field" type="date" max="${todayIso()}" value="${study.keyDate}" /></div>
        <div><label class="field-label">${vi ? 'Loại thiết lập' : 'Setup type'}</label><select id="f-setup" class="field pf-acct-select">${
          SETUP_TYPES.map((s) => `<option value="${s.value}" ${s.value === study.setupType ? 'selected' : ''}>${vi ? s.vi : s.en}</option>`).join('')
        }${SETUP_TYPES.some((s) => s.value === study.setupType) ? '' : `<option value="${escapeAttr(study.setupType)}" selected>${escapeAttr(study.setupType)}</option>`}</select></div>
        <div style="grid-column:span 3"><label class="field-label">${vi ? 'Tiêu đề' : 'Title'} <span class="muted" style="font-weight:400">${vi ? '(tự động — có thể sửa)' : '(auto — editable)'}</span></label>
          <div class="row" style="gap:8px"><input id="f-title" class="field" style="flex:1" value="${escapeAttr(study.title)}" placeholder="${vi ? 'VD: NVDA Feb 2024 VCP Breakout' : 'e.g. NVDA Feb 2024 VCP Breakout'}" />
          <button id="f-title-auto" type="button" class="btn-outline" title="${vi ? 'Tạo tiêu đề tự động' : 'Generate title'}">↻</button></div></div>
        <div><label class="field-label">${vi ? 'Kết quả' : 'Outcome'}</label><select id="f-outcome" class="field">${OUTCOMES.map((o) => `<option value="${o}" ${o === study.outcome ? 'selected' : ''}>${outcomeLabel(o, vi)}</option>`).join('')}</select></div>
        <div><label class="field-label">${vi ? 'Xếp hạng' : 'Rating'}</label><select id="f-rating" class="field">${RATINGS.map((r) => `<option value="${r}" ${r === (study.rating ?? '') ? 'selected' : ''}>${r === '' ? (vi ? '— Chưa xếp' : '— Ungraded') : r}</option>`).join('')}</select></div>
        <div><label class="field-label" title="${
          vi
            ? 'Đồng tiền của các mức giá bên dưới. Chọn EUR thì đồ thị được quy đổi theo tỷ giá ngày then chốt, chứ không phải đổi giá của anh.'
            : 'The currency of the prices below. Choose EUR and the CHART is converted at the key date’s rate — your prices are left exactly as typed.'
        }">${vi ? 'Đồng tiền' : 'Currency'}</label><select id="f-ccy" class="field">${
          (['USD', 'EUR'] as const).map((c) =>
            `<option value="${c}" ${c === (study.currency ?? 'USD') ? 'selected' : ''}>${c === 'EUR' ? '€ EUR' : '$ USD'}</option>`).join('')
        }</select></div>
        <div><label class="field-label">${vi ? 'Mua' : 'Entry'}</label><input id="f-entry" class="field" type="number" step="any" value="${study.entry ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Cắt lỗ' : 'Stop'}</label><input id="f-stop" class="field" type="number" step="any" value="${study.stop ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Mục tiêu' : 'Target'}</label><input id="f-target" class="field" type="number" step="any" value="${study.target ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Ngày thoát' : 'Exit date'}</label><input id="f-exitdate" class="field" type="date" max="${todayIso()}" value="${study.exitDate ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Giá thoát' : 'Exit price'}</label><input id="f-exitprice" class="field" type="number" step="any" value="${study.exitPrice ?? ''}" /></div>
        <div><label class="field-label" title="${vi ? '(exitPrice − entry) / (entry − stop). Tự động tính nếu để trống.' : '(exitPrice − entry) / (entry − stop). Auto-calculated if left blank.'}">${vi ? 'Kết quả R' : 'Result R'} <span class="muted" style="font-size:10px">${vi ? '(tự động)' : '(auto)'}</span></label><input id="f-rmult" class="field" type="number" step="any" value="${study.rMultiple ?? ''}" placeholder="${vi ? 'tự động' : 'auto'}" /></div>
        <div style="grid-column:span 3"><label class="field-label" title="${
          vi
            ? 'Vì sao đã đóng vị thế. Chọn một lý do có sẵn rồi viết thêm, hoặc tự viết hẳn.'
            : 'Why the position was closed. Pick one of the listed reasons and add to it, or write your own.'
        }">${vi ? 'Lý do thoát' : 'Why it was closed'}</label>
          <input id="f-exitreason" class="field" list="f-exitreason-list" value="${escapeAttr(study.exitReason ?? '')}" placeholder="${
            vi ? 'VD: Chạm cắt lỗ — nhảy gap qua luôn sau tin lợi nhuận' : 'e.g. Stop hit — gapped straight through it on earnings'
          }" />
          <datalist id="f-exitreason-list">${
            // The same vocabulary the planner offers — shipped rows plus the user's own — as
            // suggestions rather than a dropdown: a free-text field is what carries the lesson,
            // and the list is what makes the journal countable later. Called rather than imported
            // as a constant, because the user's rows can change while the app is open. See
            // `portfolio/exitReasons.ts`.
            exitReasonList().map((r) => `<option value="${escapeAttr(vi ? r.vi : r.en)}"></option>`).join('')
          }</datalist></div>
      </div>
    </div>

    <!-- No count chip on this one, unlike the read view: the editor's list is a DRAFT that
         renderCatRows() repaints on its own, so a number baked into the heading would go
         stale the moment a row is added or deleted. -->
    ${sectionHead(vi ? '📅 Chất xúc tác & tin tức' : '📅 Catalysts & news')}
    <div class="card" style="margin-bottom:14px">
      <div id="cs-cat-rows"></div>
      <div class="row" style="margin-top:8px;gap:8px;align-items:flex-start">
        <input id="cs-cat-date" class="field" type="date" max="${todayIso()}" style="width:160px" />
        <div class="cs-cat-input note-html field" id="cs-cat-text" contenteditable="true" data-placeholder="${vi ? 'Tin tức / lợi nhuận / chất xúc tác… (định dạng được)' : 'News / earnings / catalyst… (formatting supported)'}" style="flex:1;min-height:38px"></div>
        <button id="cs-cat-add" class="btn-outline">${vi ? '＋ Thêm' : '＋ Add'}</button>
      </div>
    </div>

    ${sectionHead(vi ? '📝 Ghi chú & bài học' : '📝 Notes & lessons')}
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="muted" style="font-size:12px">${vi ? 'Hỗ trợ định dạng (đậm, danh sách, màu…)' : 'Rich text (bold, lists, color…)'}</span>
        <button id="f-notes-edit" type="button" class="note-btn has-note" title="${vi ? 'Sửa ghi chú' : 'Edit note'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div id="f-notes" class="note-html cs-notes-view">${isNoteEmpty(study.notes) ? `<span class="muted">${vi ? 'Chưa có ghi chú — bấm ✎ để thêm.' : 'No notes — click ✎ to add.'}</span>` : sanitizeNoteHtml(study.notes)}</div>
    </div>`;

  const catRowsEl = $('#cs-cat-rows')!;
  const renderCatRows = () => {
    if (!catalysts.length) {
      catRowsEl.innerHTML = `<p class="muted" style="margin:0">${vi ? 'Chưa có chất xúc tác.' : 'No catalysts yet.'}</p>`;
      return;
    }
    catRowsEl.innerHTML = '';
    catalysts
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .forEach((cat) => {
        const row = el(`
          <div class="row" style="gap:10px;padding:6px 0;border-bottom:1px solid var(--border-soft);align-items:flex-start">
            <span style="font-family:var(--font-mono);color:var(--violet);white-space:nowrap">${cat.date}</span>
            <span class="note-html" style="flex:1">${sanitizeNoteHtml(cat.text)}</span>
            <button class="link-btn cs-cat-edit" style="color:var(--accent2)" title="${vi ? 'Sửa' : 'Edit'}">✎</button>
            <button class="link-btn cs-cat-del" style="color:var(--danger)">✕</button>
          </div>`);
        row.querySelector('.cs-cat-del')!.addEventListener('click', () => {
          const i = catalysts.indexOf(cat);
          if (i >= 0) catalysts.splice(i, 1);
          renderCatRows();
        });
        row.querySelector('.cs-cat-edit')!.addEventListener('click', async () => {
          const res = await richNoteDialog(vi ? 'Chất xúc tác' : 'Catalyst', cat.text, { lang: vi ? 'vi' : 'en' });
          if (res === null) return;
          cat.text = res;
          renderCatRows();
        });
        catRowsEl.appendChild(row);
      });
  };
  renderCatRows();

  $('#cs-cat-add')!.addEventListener('click', () => {
    const date = ($('#cs-cat-date') as HTMLInputElement).value;
    const text = sanitizeNoteHtml(($('#cs-cat-text') as HTMLElement).innerHTML);
    if (!date || isNoteEmpty(text)) return;
    catalysts.push({ date, text });
    ($('#cs-cat-text') as HTMLElement).innerHTML = '';
    renderCatRows();
  });

  // Rich-text notes editor + live view.
  let notesHtml = study.notes;
  $('#f-notes-edit')!.addEventListener('click', async () => {
    const res = await richNoteDialog(vi ? 'Ghi chú & bài học' : 'Notes & lessons', notesHtml, { lang: vi ? 'vi' : 'en' });
    if (res === null) return;
    notesHtml = res;
    const view = $('#f-notes')!;
    view.innerHTML = isNoteEmpty(res)
      ? `<span class="muted">${vi ? 'Chưa có ghi chú — bấm ✎ để thêm.' : 'No notes — click ✎ to add.'}</span>`
      : sanitizeNoteHtml(res);
  });

  // Auto-title: (re)generate from symbol + key date + setup type.
  const titleInput = $('#f-title') as HTMLInputElement;
  const symInput = $('#f-symbol') as HTMLInputElement;
  const dateInput = $('#f-keydate') as HTMLInputElement;
  const setupSel = $('#f-setup') as HTMLSelectElement;
  // Track whether the title was auto-filled so we don't clobber manual edits.
  let titleAuto = !study.title.trim();
  const regenTitle = () => {
    titleInput.value = autoTitle(symInput.value, dateInput.value, setupSel.value);
    titleAuto = true;
  };
  if (titleAuto) regenTitle();
  [symInput, dateInput, setupSel].forEach((elm) =>
    elm.addEventListener('input', () => { if (titleAuto) regenTitle(); }),
  );
  setupSel.addEventListener('change', () => { if (titleAuto) regenTitle(); });
  titleInput.addEventListener('input', () => { titleAuto = false; });
  $('#f-title-auto')!.addEventListener('click', regenTitle);

  $('#cs-cancel')!.addEventListener('click', () => void renderList(ctx));
  $('#cs-save')!.addEventListener('click', async () => {
    const symbol = ($('#f-symbol') as HTMLInputElement).value.trim().toUpperCase();
    if (!symbol) {
      alert(vi ? 'Nhập mã cổ phiếu.' : 'Enter a symbol.');
      return;
    }
    const numOrNull = (sel: string): number | null => {
      const v = ($(sel) as HTMLInputElement).value.trim();
      return v === '' ? null : Number(v);
    };
    const entry = numOrNull('#f-entry');
    const stop = numOrNull('#f-stop');
    const exitPrice = numOrNull('#f-exitprice');
    const rManual = numOrNull('#f-rmult');
    // Auto-calculate Result R when left blank and we have all three values.
    const rMultiple =
      rManual != null
        ? rManual
        : entry != null && stop != null && exitPrice != null && entry !== stop
          ? parseFloat(((exitPrice - entry) / (entry - stop)).toFixed(2))
          : null;
    const exitReasonTyped = ($('#f-exitreason') as HTMLInputElement).value.trim();
    const keyDate = ($('#f-keydate') as HTMLInputElement).value || todayIso();
    const setupType = ($('#f-setup') as HTMLSelectElement).value.trim() || 'Setup';
    const title = ($('#f-title') as HTMLInputElement).value.trim() || autoTitle(symbol, keyDate, setupType);
    const updated: CaseStudy = {
      ...study,
      symbol,
      title,
      keyDate,
      setupType,
      outcome: ($('#f-outcome') as HTMLSelectElement).value as CaseOutcome,
      rating: ($('#f-rating') as HTMLSelectElement).value as CaseRating,
      entry,
      stop,
      target: numOrNull('#f-target'),
      exitDate: ($('#f-exitdate') as HTMLInputElement).value || null,
      exitPrice,
      rMultiple,
      exitReason: exitReasonTyped,
      // Countable when the words happen to BE one of the list's labels — which is what picking
      // from the datalist produces. Matched rather than asked for: the field is free text on
      // purpose, and a study whose reason is the user's own sentence simply has no key. Set on
      // every save, including to undefined, because this object spreads `study`: a key left over
      // from a previous edit would go on claiming a reason the sentence no longer says.
      exitReasonKey: exitReasonKeyOfText(exitReasonTyped),
      // Dollars are written as the ABSENCE of the field, which is what every study filed before
      // this picker existed looks like — so a USD study saved today is indistinguishable from one
      // saved last year, and there is only ever one representation of "in dollars" to read.
      ...(($('#f-ccy') as HTMLSelectElement | null)?.value === 'EUR'
        ? { currency: 'EUR' as const }
        : { currency: undefined }),
      catalysts,
      notes: sanitizeNoteHtml(notesHtml),
      updatedAt: todayIso(),
    };
    // If the symbol changed, drop the cached bars so the chart refetches.
    if (symbol !== study.symbol) barCache.delete(symbol);
    await saveCase(ctx, updated);
    void openDetail(ctx, updated.id);
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────────
function detailStat(k: string, v: string, color?: string): string {
  return `<div class="stat"><div class="k">${k}</div><div class="v"${color ? ` style="color:${color}"` : ''}>${v}</div></div>`;
}
/** A study's price, in the study's own currency — `sym` comes from `caseSym`, never hardcoded. */
function money(v: number | null, sym: string): string {
  return v == null ? '—' : sym + (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));
}

/**
 * € or $ for a study. Absent `currency` means dollars — every study filed before 2026-09-29.
 *
 * One function rather than the expression inline, because the detail view, the export and the
 * editor must agree: a study whose stats said "€" and whose chart was drawn in dollars is the bug
 * this field was added to fix.
 */
function caseSym(study: CaseStudy): string {
  return study.currency === 'EUR' ? '€' : '$';
}
function plannedRr(s: CaseStudy): string {
  if (s.entry == null || s.stop == null || s.target == null || s.entry === s.stop) return '—';
  return ((s.target - s.entry) / (s.entry - s.stop)).toFixed(1) + 'R';
}
function catalystListHtml(study: CaseStudy, vi: boolean): string {
  if (!study.catalysts.length) return `<p class="muted" style="margin:0">${vi ? 'Chưa có chất xúc tác.' : 'No catalysts recorded.'}</p>`;
  return study.catalysts
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(
      (c) =>
        `<div class="row" style="gap:10px;padding:5px 0;align-items:flex-start"><span style="font-family:var(--font-mono);color:var(--violet);white-space:nowrap">${c.date}</span><span class="note-html" style="flex:1">${sanitizeNoteHtml(c.text)}</span></div>`,
    )
    .join('');
}
/** Escape for safe insertion into text/attribute contexts. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
