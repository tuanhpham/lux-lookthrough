/**
 * Case Studies tab — a journal of annotated past setups. List view → editor
 * (symbol, key date, levels, dated catalysts, notes) → detail view with a
 * static SVG chart of the ±window around the key date, downloadable as a
 * self-contained HTML report (print → Save as PDF).
 */
import { openEventFinder } from '../ui/eventFinder.js';
import { mergeCatalysts } from '../caseStudies/eventNotes.js';
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
import { cbButton, cbIcon, commandBar } from '../ui/commandBar.js';
import { setupName } from '../portfolio/planWords.js';
import type { SetupKey } from '@screener/core';
import { pageHero } from '../ui/pageHero.js';
import { askInChat } from '../ui/chatPanel.js';
import { lblOf, promptActsHtml } from '../ui/promptActions.js';
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
  { value: 'EP', en: 'Episodic Pivot', vi: 'Episodic Pivot', phrase: 'Episodic Pivot' },
  { value: 'Mean Reversion', en: 'Mean Reversion', vi: 'Mean Reversion', phrase: 'Mean Reversion' },
  { value: 'Breakout', en: 'Breakout', vi: 'Breakout', phrase: 'Breakout' },
  { value: 'Pullback', en: 'Pullback', vi: 'Pullback', phrase: 'Pullback' },
  { value: 'Surge', en: 'Surge', vi: 'Surge', phrase: 'Surge' },
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
  // A gain is --up, never the brand violet.
  win: 'var(--up)',
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
  A: 'var(--up)',
  B: '#5b8cff',
  C: 'var(--warn, #ffb648)',
  D: 'var(--danger)',
};
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
    ${pageHero({
      icon: '🗂', tone: 'var(--violet)',
      kicker: vi ? 'Giao dịch · Nhật ký' : 'Trading · Journal',
      title: vi ? 'Case Studies' : 'Case Studies',
      sub: vi
        ? 'Ghi lại các setup đã qua: ngày then chốt, giá vào/cắt lỗ/mục tiêu, catalyst và ghi chú — kèm chart và báo cáo tải về.'
        : 'Document past setups: the key date, entry/stop/target, catalysts and notes — with a chart and a downloadable report.',
    })}
    ${commandBar({
      actions: [cbButton({ id: 'cs-new', label: vi ? 'Case Study mới' : 'New case study', icon: 'plus', primary: true })],
      meta: `<span class="cb-hint">${idx.length} ${vi ? 'case study' : idx.length === 1 ? 'study' : 'studies'}</span>`,
    })}
    <div id="cs-list"></div>`;

  $('#cs-new')!.addEventListener('click', () => openEditor(ctx, blankCase(todayIso())));

  const list = $('#cs-list')!;
  if (!idx.length) {
    list.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">${
      vi ? 'Chưa có case study nào. Bấm “＋ Case Study mới” để bắt đầu.' : 'No case studies yet. Click “＋ New case study” to start.'
    }</div>`;
    return;
  }

  /*
   * One glass list, one row per study: a symbol tile, the title over a quiet meta line, and the
   * chips on the right. The request-65 cards had a coloured bar down the left edge and a glow,
   * which the user found too loud; the outcome is now a dot in its chip. `hasPlan` / `setupType` /
   * `rMultiple` come from the index and are absent on studies saved before they were copied
   * there, so a row simply shows less until that study is saved again.
   */
  const wrap = el(`<div class="cs-list"></div>`);
  for (const m of idx) {
    const meta = [
      m.setupType ? escapeAttr(m.setupType) : '',
      `<span class="mono">${m.keyDate}</span>`,
      m.rMultiple != null
        ? `<span class="mono" style="color:${m.rMultiple >= 0 ? 'var(--up)' : 'var(--danger)'}">${m.rMultiple >= 0 ? '+' : ''}${m.rMultiple.toFixed(2)}R</span>`
        : '',
    ].filter(Boolean).join('<i class="cs-dot-sep">·</i>');
    const row = el(`
      <button type="button" class="cs-row" style="--tone:${OUTCOME_COLOR[m.outcome]}">
        <span class="cs-tile">${escapeAttr(m.symbol)}</span>
        <span class="cs-main">
          <span class="cs-name">${escapeAttr(m.title || m.symbol)}</span>
          <span class="cs-meta">${meta}</span>
        </span>
        <span class="cs-chips">
          ${m.hasPlan ? `<span class="cs-chip cs-chip--plan" title="${vi ? 'Có trade plan đã chốt' : 'Has a frozen trade plan'}">${cbIcon('file', 12)}${vi ? 'Kế hoạch' : 'Plan'}</span>` : ''}
          ${m.rating ? `<span class="cs-chip" style="--c:${RATING_COLOR[m.rating]}">${vi ? 'Hạng' : 'Grade'} ${m.rating}</span>` : ''}
          <span class="cs-chip cs-chip--out" style="--c:${OUTCOME_COLOR[m.outcome]}"><i></i>${outcomeLabel(m.outcome, vi)}</span>
        </span>
        <svg class="cs-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>`);
    row.addEventListener('click', () => void openDetail(ctx, m.id));
    wrap.appendChild(row);
  }
  list.appendChild(wrap);
}

// ── Detail view ─────────────────────────────────────────────────────────────────
/**
 * Which detail view is the current one. Bumped on every open so a late fetch that belongs to the
 * study the user has already navigated away from stays out of the one now on screen — the element
 * check alone cannot tell "my chart" from "somebody else's chart with my id's name on it".
 */
let detailToken = 0;

/** Open one study from outside this tab — the Trade Station's Case study list. */
export async function openCaseStudy(ctx: AppContext, id: string): Promise<void> {
  await loadPlaybookConfig(ctx).catch(() => null);
  await openDetail(ctx, id);
}

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

  const oc = OUTCOME_COLOR[study.outcome];
  const subBits = [
    study.title ? escapeAttr(study.title) : '',
    study.setupType ? escapeAttr(study.setupType) : '',
    `${vi ? 'ngày then chốt' : 'key date'} <b class="mono">${study.keyDate}</b>`,
  ].filter(Boolean).join(' · ');
  root.innerHTML = `
    ${pageHero({
      icon: '🗂', tone: oc,
      kicker: vi ? 'Case Study' : 'Case study',
      title: `${escapeAttr(study.symbol)}<span class="cs-hero-chips"><span class="cs-chip cs-chip--out" style="--c:${oc}"><i></i>${outcomeLabel(study.outcome, vi)}</span>${
        study.rating ? `<span class="cs-chip" style="--c:${RATING_COLOR[study.rating]}">${vi ? 'Hạng' : 'Grade'} ${study.rating}</span>` : ''}${
        study.plan ? `<span class="cs-chip cs-chip--plan">${cbIcon('file', 12)}${vi ? 'Đã lưu plan' : 'Plan filed'}</span>` : ''}</span>`,
      sub: subBits,
    })}
    ${commandBar({
      actions: [
        cbButton({ id: 'cs-back', label: vi ? 'Quay lại' : 'Back', icon: 'back' }),
        ...(study.plan
          ? [cbButton({
            id: 'cs-plan', label: vi ? 'Xem kế hoạch' : 'View plan', icon: 'eye', primary: true,
            title: vi
              ? 'Xem trade plan đã chốt lúc lưu case study này — hạng, bảng tiêu chí và các mức giá khi đó'
              : 'Read the trade plan frozen when this study was filed — the grade, the scorecard and the levels as they stood',
          })]
          : []),
        cbButton({ id: 'cs-edit', label: vi ? 'Sửa' : 'Edit', icon: 'edit' }),
        cbButton({ id: 'cs-download', label: vi ? 'Tải HTML' : 'Download HTML', icon: 'download' }),
        cbButton({ id: 'cs-delete', label: vi ? 'Xóa' : 'Delete', icon: 'trash' }),
      ],
    })}
    <div class="card cs-chart-card">
      <div class="cs-chart-bar">
        <span class="cs-k">${vi ? 'Chart' : 'Chart'}</span>
        <div class="seg">${[1, 3, 6].map((mo) => `<button class="range-btn ${mo === study.windowMonths ? 'active' : ''}" data-win="${mo}">±${mo}M</button>`).join('')}</div>
      </div>
      <div id="cs-chart">${vi ? 'Đang tải…' : 'Loading…'}</div>
    </div>
    <div class="cs-stat-groups">
      <section class="cs-stat-group">
        <div class="cs-k">${vi ? 'Kế hoạch' : 'The plan'}</div>
        <div class="cs-stats">
          ${detailStat(vi ? 'Giá vào' : 'Entry', money(study.entry, sym), '#5b8cff')}
          ${detailStat(vi ? 'Cắt lỗ' : 'Stop', money(study.stop, sym), 'var(--danger)')}
          ${detailStat(vi ? 'Mục tiêu' : 'Target', money(study.target, sym), 'var(--up)')}
          ${detailStat('R:R', plannedRr(study))}
        </div>
      </section>
      <section class="cs-stat-group">
        <div class="cs-k">${vi ? 'Kết quả' : 'The result'}</div>
        <div class="cs-stats">
          ${detailStat(vi ? 'Ngày bán' : 'Exit date', study.exitDate ?? '—')}
          ${detailStat(vi ? 'Giá bán' : 'Exit price', money(study.exitPrice, sym))}
          ${detailStat(vi ? 'Kết quả R' : 'Result R', study.rMultiple != null ? study.rMultiple.toFixed(2) + 'R' : '—', study.rMultiple != null ? (study.rMultiple >= 0 ? 'var(--up)' : 'var(--danger)') : undefined)}
          ${detailStat(vi ? 'Hạng' : 'Rating', study.rating || '—', study.rating ? RATING_COLOR[study.rating] : undefined)}
        </div>
      </section>
    </div>
    ${study.exitReason
      ? `<div class="card cs-why">
          <span class="cs-why-ic" aria-hidden="true">${cbIcon('clipboard', 16)}</span>
          <div><div class="cs-k">${vi ? 'Vì sao bán' : 'Why it was closed'}</div>
          <div class="cs-why-t">${escapeAttr(study.exitReason)}</div></div>
        </div>`
      : ''}
    ${sectionHead(vi ? '📋 Trade plan' : '📋 Trade plan')}
    ${planSectionHtml(study, vi)}
    ${sectionHead(vi ? '📅 Catalyst & tin tức' : '📅 Catalysts & news', [countChip(study.catalysts.length, undefined, vi ? 'mốc' : 'dated')])}
    <div class="card cs-cats">${catalystListHtml(study, vi)}</div>
    ${sectionHead(vi ? '📝 Ghi chú & bài học' : '📝 Notes & lessons')}
    <div class="card note-html cs-notes">${!isNoteEmpty(study.notes) ? sanitizeNoteHtml(study.notes) : `<span class="muted">${vi ? 'Chưa có ghi chú.' : 'No notes.'}</span>`}</div>
    <div id="cs-ask" style="margin-top:14px"></div>`;

  $('#cs-back')!.addEventListener('click', () => void renderList(ctx));
  $('#cs-edit')!.addEventListener('click', () => openEditor(ctx, study));
  $('#cs-delete')!.addEventListener('click', async () => {
    if (!confirm(vi ? `Xóa case study ${study.symbol}?` : `Delete case study for ${study.symbol}?`)) return;
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
          ? 'Không vẽ được chart: case study này ghi giá bằng EUR nhưng trong cache chưa có tỷ giá EUR/USD của ngày then chốt.'
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
  // from the Trade Planner — the buttons (command bar + the plan section) are not rendered otherwise.
  const openPlan = async () => {
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
  };
  root.querySelectorAll('#cs-plan, [data-cs-plan]').forEach((b) => b.addEventListener('click', () => void openPlan()));

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
            ? 'Gửi case study này cho ChatGPT để tra giá/khối lượng thật quanh ngày then chốt, tính tỷ lệ volume breakout, dựng lại chuỗi catalyst theo ngày và chỉ ra cả điểm mạnh lẫn cờ đỏ.'
            : 'Send this case to ChatGPT so it looks up the real price/volume around the key date, computes the breakout volume ratios, reconstructs the dated catalyst chain, and names the red flags as well as the strengths.'
        }</p>
        ${gptBadgeHtml()}
        ${promptActsHtml({ ask: 'id="cs-ask-go"', assistant: 'id="cs-ask-bot"', copy: 'id="cs-ask-copy"', show: 'id="cs-ask-show"' })}
        <pre id="cs-ask-text" class="hidden" style="white-space:pre-wrap;font-size:11px;line-height:1.5;
          background:var(--surface);border-radius:8px;padding:10px;margin:10px 0 0;max-height:280px;overflow:auto">${escapeAttr(prompt)}</pre>
        <p class="muted" style="font-size:10px;margin:8px 0 0;line-height:1.5">${t('prompts.ask.hint')}</p>
        <p class="muted" style="font-size:10px;margin:6px 0 0;line-height:1.5">${t('prompts.disclaimer')}</p>
      </div>`;

    $('#cs-ask-go')!.addEventListener('click', (e) =>
      askChatGpt(prompt, e.currentTarget as HTMLElement),
    );
    $('#cs-ask-bot')!.addEventListener('click', () =>
      void askInChat(ctx, prompt, `${study.symbol} · ${study.title || study.keyDate}`),
    );
    $('#cs-ask-copy')!.addEventListener('click', (e) =>
      void copyToClipboard(prompt, e.currentTarget as HTMLElement),
    );
    $('#cs-ask-show')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      const hidden = $('#cs-ask-text')!.classList.toggle('hidden');
      lblOf(btn).textContent = hidden ? t('prompts.show') : t('prompts.hide');
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
      <button id="cs-save" class="btn">${vi ? 'Lưu case study' : 'Save case study'}</button>
    </div>
    <h1>${study.symbol ? (vi ? 'Sửa case study' : 'Edit case study') : vi ? 'Case Study mới' : 'New case study'}</h1>
    <div class="card" style="margin-bottom:14px">
      <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px">
        <div><label class="field-label">${vi ? 'Mã' : 'Symbol'}</label><input id="f-symbol" class="field" value="${escapeAttr(study.symbol)}" placeholder="NVDA" /></div>
        <div><label class="field-label">${vi ? 'Ngày then chốt' : 'Key date'}</label><input id="f-keydate" class="field" type="date" max="${todayIso()}" value="${study.keyDate}" /></div>
        <div><label class="field-label">${vi ? 'Loại setup' : 'Setup type'}</label><select id="f-setup" class="field pf-acct-select">${
          SETUP_TYPES.map((s) => `<option value="${s.value}" ${s.value === study.setupType ? 'selected' : ''}>${vi ? s.vi : s.en}</option>`).join('')
        }${SETUP_TYPES.some((s) => s.value === study.setupType) ? '' : `<option value="${escapeAttr(study.setupType)}" selected>${escapeAttr(study.setupType)}</option>`}</select></div>
        <div style="grid-column:span 3"><label class="field-label">${vi ? 'Tiêu đề' : 'Title'} <span class="muted" style="font-weight:400">${vi ? '(tự động — có thể sửa)' : '(auto — editable)'}</span></label>
          <div class="row" style="gap:8px"><input id="f-title" class="field" style="flex:1" value="${escapeAttr(study.title)}" placeholder="${vi ? 'VD: NVDA Feb 2024 VCP Breakout' : 'e.g. NVDA Feb 2024 VCP Breakout'}" />
          <button id="f-title-auto" type="button" class="btn-outline" title="${vi ? 'Tạo tiêu đề tự động' : 'Generate title'}">↻</button></div></div>
        <div><label class="field-label">${vi ? 'Kết quả' : 'Outcome'}</label><select id="f-outcome" class="field">${OUTCOMES.map((o) => `<option value="${o}" ${o === study.outcome ? 'selected' : ''}>${outcomeLabel(o, vi)}</option>`).join('')}</select></div>
        <div><label class="field-label">${vi ? 'Xếp hạng' : 'Rating'}</label><select id="f-rating" class="field">${RATINGS.map((r) => `<option value="${r}" ${r === (study.rating ?? '') ? 'selected' : ''}>${r === '' ? (vi ? '— Chưa xếp' : '— Ungraded') : r}</option>`).join('')}</select></div>
        <div><label class="field-label" title="${
          vi
            ? 'Đơn vị tiền của các mức giá bên dưới. Chọn EUR thì CHART được quy đổi theo tỷ giá ngày then chốt — giá bạn nhập vẫn giữ nguyên.'
            : 'The currency of the prices below. Choose EUR and the CHART is converted at the key date’s rate — your prices are left exactly as typed.'
        }">${vi ? 'Tiền tệ' : 'Currency'}</label><select id="f-ccy" class="field">${
          (['USD', 'EUR'] as const).map((c) =>
            `<option value="${c}" ${c === (study.currency ?? 'USD') ? 'selected' : ''}>${c === 'EUR' ? '€ EUR' : '$ USD'}</option>`).join('')
        }</select></div>
        <div><label class="field-label">${vi ? 'Giá vào' : 'Entry'}</label><input id="f-entry" class="field" type="number" step="any" value="${study.entry ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Cắt lỗ' : 'Stop'}</label><input id="f-stop" class="field" type="number" step="any" value="${study.stop ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Mục tiêu' : 'Target'}</label><input id="f-target" class="field" type="number" step="any" value="${study.target ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Ngày bán' : 'Exit date'}</label><input id="f-exitdate" class="field" type="date" max="${todayIso()}" value="${study.exitDate ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Giá bán' : 'Exit price'}</label><input id="f-exitprice" class="field" type="number" step="any" value="${study.exitPrice ?? ''}" /></div>
        <div><label class="field-label" title="${vi ? '(exitPrice − entry) / (entry − stop). Để trống thì tự tính.' : '(exitPrice − entry) / (entry − stop). Auto-calculated if left blank.'}">${vi ? 'Kết quả R' : 'Result R'} <span class="muted" style="font-size:10px">${vi ? '(tự động)' : '(auto)'}</span></label><input id="f-rmult" class="field" type="number" step="any" value="${study.rMultiple ?? ''}" placeholder="${vi ? 'tự động' : 'auto'}" /></div>
        <div style="grid-column:span 3"><label class="field-label" title="${
          vi
            ? 'Vì sao đóng vị thế. Chọn một lý do có sẵn rồi viết thêm, hoặc tự viết.'
            : 'Why the position was closed. Pick one of the listed reasons and add to it, or write your own.'
        }">${vi ? 'Vì sao bán' : 'Why it was closed'}</label>
          <input id="f-exitreason" class="field" list="f-exitreason-list" value="${escapeAttr(study.exitReason ?? '')}" placeholder="${
            vi ? 'VD: Chạm cắt lỗ — gap xuyên qua luôn sau KQKD' : 'e.g. Stop hit — gapped straight through it on earnings'
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
    ${sectionHead(vi ? '📅 Catalyst & tin tức' : '📅 Catalysts & news')}
    <div class="card" style="margin-bottom:14px">
      <div id="cs-cat-rows"></div>
      <div class="row" style="margin-top:8px;gap:8px;align-items:flex-start">
        <input id="cs-cat-date" class="field" type="date" max="${todayIso()}" style="width:160px" />
        <div class="cs-cat-input note-html field" id="cs-cat-text" contenteditable="true" data-placeholder="${vi ? 'Tin tức / KQKD / catalyst… (định dạng được)' : 'News / earnings / catalyst… (formatting supported)'}" style="flex:1;min-height:38px"></div>
        <button id="cs-cat-add" class="btn-outline">${vi ? '＋ Thêm' : '＋ Add'}</button>
      </div>
      <div class="row" style="margin-top:10px;gap:8px;align-items:center">
        <button id="cs-cat-ai" class="ai-find-btn"><span class="ai-find-ic" aria-hidden="true">✦</span>${vi ? 'Tìm sự kiện & catalyst bằng trợ lý' : 'Find events & catalysts with the assistant'}</button>
        <span class="muted" style="font-size:12px">${vi ? 'Quanh ngày then chốt ở trên — bạn chọn sự kiện nào giữ lại.' : 'Around the key date above — you choose which to keep.'}</span>
      </div>
    </div>

    ${sectionHead(vi ? '📝 Ghi chú & bài học' : '📝 Notes & lessons')}
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="muted" style="font-size:12px">${vi ? 'Định dạng được (đậm, danh sách, màu…)' : 'Rich text (bold, lists, color…)'}</span>
        <button id="f-notes-edit" type="button" class="note-btn has-note" title="${vi ? 'Sửa ghi chú' : 'Edit note'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div id="f-notes" class="note-html cs-notes-view">${isNoteEmpty(study.notes) ? `<span class="muted">${vi ? 'Chưa có ghi chú — bấm ✎ để thêm.' : 'No notes — click ✎ to add.'}</span>` : sanitizeNoteHtml(study.notes)}</div>
    </div>`;

  const catRowsEl = $('#cs-cat-rows')!;
  const renderCatRows = () => {
    if (!catalysts.length) {
      catRowsEl.innerHTML = `<p class="muted" style="margin:0">${vi ? 'Chưa có catalyst nào.' : 'No catalysts yet.'}</p>`;
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
          const res = await richNoteDialog(vi ? 'Catalyst' : 'Catalyst', cat.text, { lang: vi ? 'vi' : 'en' });
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
  const paintNotes = (): void => {
    const view = $('#f-notes')!;
    view.innerHTML = isNoteEmpty(notesHtml)
      ? `<span class="muted">${vi ? 'Chưa có ghi chú — bấm ✎ để thêm.' : 'No notes — click ✎ to add.'}</span>`
      : sanitizeNoteHtml(notesHtml);
  };

  // The event finder: the assistant searches around the key date, the user ticks what to keep.
  $('#cs-cat-ai')!.addEventListener('click', async () => {
    const sym = ($('#f-symbol') as HTMLInputElement).value.trim().toUpperCase();
    const date = ($('#f-keydate') as HTMLInputElement).value;
    if (!sym || !date) return;
    const num = (id: string): number | null => { const v = Number(($(id) as HTMLInputElement).value); return v > 0 ? v : null; };
    const res = await openEventFinder(ctx, {
      symbol: sym, date, setup: ($('#f-setup') as HTMLSelectElement).value,
      entry: num('#f-entry'), stop: num('#f-stop'), currency: ($('#f-ccy') as HTMLSelectElement).value,
    }, [
      { id: 'cats', what: 'events', label: vi ? 'Catalyst của case study này' : 'This case study’s catalysts', on: true },
      { id: 'notes', what: 'note', label: vi ? 'Ghi chú & bài học' : 'Notes & lessons', on: true },
    ]);
    if (!res) return;
    if (res.targets.has('cats')) {
      const merged = mergeCatalysts(catalysts, res.events);
      catalysts.splice(0, catalysts.length, ...merged);
      renderCatRows();
    }
    if (res.targets.has('notes') && res.noteHtml) { notesHtml = (notesHtml || '') + res.noteHtml; paintNotes(); }
  });
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
/**
 * The detail view's "Trade plan" section — the answer to "where do I read the plan back?".
 *
 * The plan used to be reachable only from a small outline button that is rendered only when the
 * study carries one, so a study written by hand (New case study) showed nothing at all and the
 * feature looked gone. Now the section is always there: the frozen grade, levels and size with a
 * large button into the full report, or — with no plan — a line saying how a plan gets frozen.
 */
function planSectionHtml(study: CaseStudy, vi: boolean): string {
  const p = study.plan;
  if (!p) {
    return `<div class="card cs-plan cs-plan--none">
      <span class="cs-plan-grade" aria-hidden="true">${cbIcon('file', 20)}</span>
      <div class="cs-plan-body">
        <b>${vi ? 'Case study này không kèm trade plan' : 'No trade plan was filed with this study'}</b>
        <p>${vi
          ? 'Chỉ case study lưu bằng nút <b>“Lưu thành case study”</b> trong Trade Planner (trang cổ phiếu) mới chốt lại plan — hạng, bảng tiêu chí và các mức giá. Case study tạo bằng “Case Study mới” thì không có.'
          : 'Only a study filed with <b>“Save as case study”</b> in the Trade Planner (stock page) freezes its plan — the grade, the scorecard and the levels. One made with “New case study” has none.'}</p>
      </div>
    </div>`;
  }
  const ps = p.currency === 'EUR' ? '€' : '$';
  const letter = p.effective ?? '—';
  const col = p.effective ? RATING_COLOR[p.effective] : 'var(--faint)';
  const lv = (k: string, v: number | null, c: string) =>
    `<span class="cs-plan-lv"><i>${k}</i><b class="mono" style="color:${c}">${money(v, ps)}</b></span>`;
  return `<div class="card cs-plan" style="--c:${col}">
    <span class="cs-plan-grade" title="${vi ? 'Hạng đang áp dụng' : 'Letter in force'}">${letter}</span>
    <div class="cs-plan-body">
      <b>${vi ? 'Plan chốt ngày' : 'Plan frozen on'} <span class="mono">${p.date}</span>${p.plan.setup ? ` · ${setupName(p.plan.setup as SetupKey, vi)}` : ''}</b>
      <p>${p.grade
        ? `${vi ? 'Điểm' : 'Score'} <b class="mono">${p.grade.score.toFixed(0)}</b>/100 · ${vi ? 'size' : 'size'} <b class="mono">${p.pctOfFull}%</b>`
        : `<span style="color:var(--warn,#ffb648)">${vi ? 'Chưa chấm điểm khi lưu' : 'Never graded when filed'}</span> · ${vi ? 'size' : 'size'} <b class="mono">${p.pctOfFull}%</b>`}${
        p.shares > 0 ? ` · <b class="mono">${p.shares}</b> ${vi ? 'cổ' : 'shares'}` : ''}</p>
      <div class="cs-plan-lvs">
        ${lv(vi ? 'Giá vào' : 'Entry', p.levels.entry, '#5b8cff')}
        ${lv(vi ? 'Cắt lỗ' : 'Stop', p.levels.stop, 'var(--danger)')}
        ${lv(vi ? 'Mục tiêu' : 'Target', p.levels.target, 'var(--up)')}
      </div>
    </div>
    <button type="button" class="btn cs-plan-open" data-cs-plan>${cbIcon('eye', 16)}<span>${vi ? 'Mở kế hoạch đầy đủ' : 'Open the full plan'}</span></button>
  </div>`;
}
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
  if (!study.catalysts.length) return `<p class="muted" style="margin:0">${vi ? 'Chưa ghi catalyst nào.' : 'No catalysts recorded.'}</p>`;
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
