import {
  scanQm, qmToRow, fetchMany,
  type QmRow,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
// The Trade Planner panel. It used to live in this file; it moved out so the stock modal can
// mount it too — see the header of `tradePlanner.ts` for why the dependency runs that way.
import { closeTradePlanner, openTradePlanner } from '../portfolio/tradePlanner.js';
import { openStock } from '../ui/stockModal.js';
import { qmTable, type QmSortKey } from '../ui/qmTable.js';
import { sectionHead } from '../ui/sectionHead.js';
import { pageHero } from '../ui/pageHero.js';
import { cbButton } from '../ui/commandBar.js';
import { t, getLang } from '../ui/i18n.js';
import { GLOSSARY_GROUPS, gloss } from '../ui/glossary.js';
import { formDialog } from '../ui/forms.js';
import { loadIndex, loadItems, saveItems, saveIndex, itemsKey, newId } from '../ui/watchlists.js';
import { mountWatchAlerts, refreshWatchAlerts, watchAlertsHtml } from './watchAlerts.js';
import { swingPlaybookHtml, wireSwingPlaybook } from './swingPlaybook.js';
import { wirePlaybookTools } from './playbookTools.js';
import { platformGuideHtml, wirePlatformGuide } from './learnPlatform.js';
import { mountStickyToc } from '../ui/stickyToc.js';
import {
  bookCoverHtml,
  bookPartHtml,
  stampReadingTimes,
  wireBookContents,
  type BookPart,
} from '../ui/book.js';

let activeId: string | null = null;

export function renderWatchlist(ctx: AppContext): void {
  const root = $('#tab-watchlist')!;
  // The line below drops every node in this tab, including the planner's host and the charts
  // inside it. Scoped to this root so a planner open in the stock modal is left alone.
  closeTradePlanner(root);
  const vi = getLang() === 'vi';
  root.innerHTML = `
    ${pageHero({
      icon: '⭐', tone: 'var(--blue)',
      kicker: vi ? 'Giao dịch · Danh sách' : 'Trading · Lists',
      title: t('wl.title'), sub: t('wl.sub'),
    })}
    <div class="picks-config card pg-panel">
      <div class="picks-config-row">
        <span class="picks-config-label">${vi ? 'Danh sách' : 'Lists'}</span>
        <div class="picks-pill-group" id="wl-tabs"></div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${vi ? 'Thêm mã' : 'Add symbol'}</span>
        <div class="picks-pill-group">
          <input id="wl-symbol" class="field pg-field-wide" placeholder="${vi ? 'Thêm mã, ví dụ AMD' : 'Add symbol e.g. AMD'}" autocomplete="off" />
          <button id="wl-add" class="btn">${t('wl.add')}</button>
        </div>
      </div>
      <div class="picks-config-actions">
        ${cbButton({ id: 'wl-refresh', label: t('wl.refresh'), icon: 'refresh', primary: true })}
        ${cbButton({ id: 'wl-plan', label: t('wl.plan'), icon: 'clipboard' })}
        ${cbButton({ id: 'wl-export', label: t('wl.export'), icon: 'download', title: t('wl.export.tip') })}
        ${cbButton({ id: 'wl-import', label: t('wl.import'), icon: 'upload', title: t('wl.import.tip') })}
        <input id="wl-import-file" type="file" accept="application/json,.json" style="display:none" />
      </div>
    </div>
    ${watchAlertsHtml()}
    <div id="wl-plan-panel"></div>
    <div id="wl-results"></div>`;

  void refreshAll(ctx);
  void mountWatchAlerts(ctx, root);

  $('#wl-export')!.addEventListener('click', () => void exportWatchlists(ctx));
  const importFile = $('#wl-import-file') as HTMLInputElement;
  $('#wl-import')!.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => void importWatchlists(ctx, importFile));

  $('#wl-add')!.addEventListener('click', async () => {
    const input = $('#wl-symbol') as HTMLInputElement;
    const sym = input.value.trim().toUpperCase();
    if (!sym || !activeId) return;
    await saveItems(ctx, activeId, [...(await loadItems(ctx, activeId)), sym]);
    input.value = '';
    await refreshTabs(ctx);
    await refreshRows(ctx);
  });
  ($('#wl-symbol') as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ($('#wl-add') as HTMLButtonElement).click();
  });
  $('#wl-refresh')!.addEventListener('click', () => void refreshRows(ctx, true));
  $('#wl-plan')!.addEventListener('click', () => void planWholeList(ctx));
}

/** The whole active list in one panel — the original ↑ toolbar button. */
async function planWholeList(ctx: AppContext): Promise<void> {
  if (!activeId) return;
  const id = activeId;
  const idx = await loadIndex(ctx);
  await openTradePlanner(ctx, {
    host: $('#wl-plan-panel')!,
    // Read at plan time, not now: removing a symbol from a row while the panel is open must
    // not leave ↻ Plan re-planning it.
    symbols: () => loadItems(ctx, id),
    title: idx.find((w) => w.id === id)?.name ?? '',
    onOpenSymbol: (sym) => void openStock(ctx, sym),
  });
}

/**
 * One symbol from the list, in the same panel — the user's "doi khi minh chi muon xem trade
 * plan cua mot co phieu trong mot watchlist nao do thoi chu khong muon xem ca".
 *
 * Deliberately the same host as the whole-list panel rather than an inline row expander: the
 * planner's cards are tall (a chart, a 26-row checklist, the sizing arithmetic), and unfolding
 * that inside a table row would push the rest of the list off the screen. So the panel appears
 * in its usual place above the table and is scrolled to.
 */
async function planOneSymbol(ctx: AppContext, symbol: string): Promise<void> {
  const host = $('#wl-plan-panel')!;
  await openTradePlanner(ctx, {
    host,
    symbols: () => [symbol],
    title: symbol,
    onOpenSymbol: (sym) => void openStock(ctx, sym),
  });
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function refreshAll(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  if (!activeId || !idx.some((w) => w.id === activeId)) activeId = idx[0]!.id;
  await refreshTabs(ctx);
  await refreshRows(ctx);
}

// ── Export / Import ─────────────────────────────────────────────────────────
// Watchlists live in per-origin storage (localStorage on web), so they don't
// survive switching to a different URL/origin. These let you back them up to a
// JSON file and restore them on any origin or device.

interface WatchlistBackup {
  type: 'screener-watchlists';
  version: 1;
  exportedAt: string;
  lists: { id: string; name: string; symbols: string[] }[];
}

async function exportWatchlists(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  const lists = [];
  for (const w of idx) lists.push({ id: w.id, name: w.name, symbols: await loadItems(ctx, w.id) });
  const backup: WatchlistBackup = {
    type: 'screener-watchlists',
    version: 1,
    exportedAt: new Date().toISOString(),
    lists,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `watchlists-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importWatchlists(ctx: AppContext, input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = ''; // allow re-importing the same file later
  if (!file) return;
  let backup: WatchlistBackup;
  try {
    backup = JSON.parse(await file.text()) as WatchlistBackup;
  } catch {
    alert('Could not read that file — it is not valid JSON.');
    return;
  }
  if (backup?.type !== 'screener-watchlists' || !Array.isArray(backup.lists)) {
    alert('That file is not a watchlist backup.');
    return;
  }

  const existing = await loadIndex(ctx);
  const merge = existing.length
    ? confirm(
        `Import ${backup.lists.length} watchlist(s)?\n\nOK = merge into your current lists (symbols combined).\nCancel = keep current lists unchanged.`,
      )
    : true;
  if (!merge) return;

  const byName = new Map(existing.map((w) => [w.name.toLowerCase(), w]));
  for (const imported of backup.lists) {
    const symbols = (imported.symbols ?? []).map((s) => String(s).toUpperCase());
    const match = byName.get(String(imported.name).toLowerCase());
    if (match) {
      // Merge symbols into the existing same-named list (saveItems de-dups).
      await saveItems(ctx, match.id, [...(await loadItems(ctx, match.id)), ...symbols]);
    } else {
      const id = newId();
      await saveIndex(ctx, [...(await loadIndex(ctx)), { id, name: imported.name || 'Imported' }]);
      await saveItems(ctx, id, symbols);
    }
  }
  rowCache.clear();
  await refreshAll(ctx);
}

async function refreshTabs(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  const tabs = $('#wl-tabs')!;
  tabs.innerHTML = '';
  for (const w of idx) {
    const count = (await loadItems(ctx, w.id)).length;
    const tab = el(
      `<span class="range-btn ${w.id === activeId ? 'active' : ''}" data-wl="${w.id}" style="display:inline-flex;gap:6px;align-items:center">
        <span data-open>${w.name}</span><span class="muted">${count}</span>
        <span data-rename title="Rename" style="cursor:pointer">✎</span>${
          idx.length > 1 ? `<span data-del title="Delete" style="cursor:pointer;color:var(--faint)">×</span>` : ''
        }</span>`,
    );
    tab.querySelector('[data-open]')!.addEventListener('click', async () => {
      activeId = w.id;
      // The open panel is planning the list that was active when it opened. Leaving it there
      // under a different list's rows would be a screenful of cards labelled with the wrong
      // list name — and ↻ Plan would re-plan the old one.
      closeTradePlanner($<HTMLElement>('#wl-plan-panel') ?? undefined);
      await refreshTabs(ctx);
      await refreshRows(ctx);
    });
    tab.querySelector('[data-rename]')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await formDialog('Rename watchlist', [{ key: 'name', label: 'Name', value: w.name }]);
      const name = res?.name?.trim();
      if (!name) return;
      await saveIndex(ctx, idx.map((x) => (x.id === w.id ? { ...x, name } : x)));
      await refreshTabs(ctx);
    });
    tab.querySelector('[data-del]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete watchlist "${w.name}"?`)) return;
      await ctx.storage.delete(itemsKey(w.id));
      const next = idx.filter((x) => x.id !== w.id);
      await saveIndex(ctx, next);
      if (activeId === w.id) activeId = next[0]?.id ?? null;
      await refreshAll(ctx);
    });
    tabs.appendChild(tab);
  }
  const add = el(`<button class="range-btn" title="New watchlist">＋ New list</button>`);
  add.addEventListener('click', async () => {
    const res = await formDialog('New watchlist', [{ key: 'name', label: 'List name', placeholder: 'e.g. Semis' }]);
    const name = res?.name?.trim();
    if (!name) return;
    const id = newId();
    await saveIndex(ctx, [...idx, { id, name }]);
    activeId = id;
    await refreshAll(ctx);
  });
  tabs.appendChild(add);
  // Counts, names and tickers all feed the alerts fold; it is cheap to redraw.
  void refreshWatchAlerts(ctx);
}

// Cache scan rows per list so switching tabs is instant. Each entry remembers
// the symbol set it was built for, so a change (e.g. a stock added from the
// detail modal) is detected and the rows refetched automatically.
const rowCache = new Map<string, { syms: string[]; rows: QmRow[] }>();
let wlSort: { key: QmSortKey; desc: boolean } = { key: 'qualityScore', desc: true };

/** Render the active list as a sortable one-row-per-stock quick-info table. */
async function refreshRows(ctx: AppContext, force = false): Promise<void> {
  const out = $('#wl-results')!;
  if (!activeId) {
    out.innerHTML = '';
    return;
  }
  const syms = await loadItems(ctx, activeId);
  if (!syms.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:28px">No symbols yet — add some above.</div>`;
    return;
  }

  const cached = rowCache.get(activeId);
  // Refetch when forced, when nothing cached, or when the symbol set changed
  // (e.g. a stock was just added/removed from the detail modal).
  const stale = !cached || cached.syms.join(',') !== syms.join(',');
  let rows = cached?.rows;
  if (stale || force) {
    out.innerHTML = `<div class="muted" style="padding:10px"><span class="spinner"></span> ${t('msg.scanning')} ${syms.length}…</div>`;
    const data = await fetchMany(ctx.data, syms, '1y', 8);
    rows = [];
    for (const sym of syms) {
      const ohlcv = data.get(sym);
      if (ohlcv && ohlcv.bars.length >= 60) {
        rows.push(qmToRow(scanQm(sym, ohlcv.bars)));
      } else {
        // Keep the symbol visible even if data is missing/short.
        rows.push({
          symbol: sym, price: 0, qualityScore: 0, setupType: 'NONE',
          previousAdvancePct: null, vcpContractions: null, atrContractionPct: null,
          volumeContractionPct: null, pivot: null, entryPrice: null, stopLoss: null,
          riskPct: null, relativeStrength: null, gapPct: null, catalyst: null,
        } as QmRow);
      }
    }
    rowCache.set(activeId, { syms: [...syms], rows });
  }

  out.innerHTML = '';
  out.appendChild(
    qmTable(rows!, {
      sortKey: wlSort.key,
      sortDesc: wlSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym),
      onSortChange: (key, desc) => {
        wlSort = { key, desc };
      },
      action: {
        header: '',
        // Two buttons in the one action column `qmTable` offers. `data-row-action` on the
        // wrapper is what stops a click here from also opening the stock detail.
        html: (r) => `<span data-row-action style="display:inline-flex;gap:4px;align-items:center">
          <button class="icon-btn" data-plan="${r.symbol}" title="${t('wl.plan.one')}">📋</button>
          <button class="icon-btn" data-del="${r.symbol}" title="Remove from list">✕</button>
        </span>`,
      },
    }),
  );

  // Wire the remove buttons (the table forwards row clicks but leaves actions to us).
  out.querySelectorAll<HTMLElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sym = b.dataset.del!;
      await saveItems(ctx, activeId!, (await loadItems(ctx, activeId!)).filter((x) => x !== sym));
      rowCache.delete(activeId!);
      await refreshTabs(ctx);
      await refreshRows(ctx);
    }),
  );

  // Plan just this row.
  out.querySelectorAll<HTMLElement>('[data-plan]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      void planOneSymbol(ctx, b.dataset.plan!);
    }),
  );
}

// ── Learn (full bilingual glossary, grouped) ────────────────────────────────────
/**
 * "How the system works" explainer for the Learn page. Mirrors the QM Quality
 * Score (packages/core/src/qm) and the Momentum engine + regime + sector
 * rotation (packages/core/src/momentum) so users understand what the scans
 * measure and why a name does or doesn't surface.
 */
function scoreExplainerHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';

  // ── QM Quality Score rubric (weights total 100). ──
  const qmIntro = vi
    ? `Bộ lọc <b>Qullamaggie (QM)</b> tìm các setup xác suất cao: mẫu hình <b>co thắt biến động (VCP)</b> sau một nhịp tăng mạnh, và <b>Episodic Pivot</b> — cú gap nhờ tin tức/KQKD. Mỗi mã nhận <b>điểm chất lượng 0–100</b> theo trọng số dưới đây.`
    : `The <b>Qullamaggie (QM)</b> screen finds high-probability setups: <b>Volatility Contraction Patterns (VCP)</b> after a strong advance, and <b>Episodic Pivots</b> — news/earnings gaps. Each stock gets a <b>Quality Score 0–100</b> from the weighted components below.`;

  const qmRows: [string, string, string][] = vi
    ? [
        ['Xu hướng (Trend)', '20', 'Giá > EMA50 > EMA150 > EMA200 và EMA200 đang lên.'],
        ['Nhịp tăng trước', '10', 'Nhịp tăng trước khi vào base càng mạnh càng tốt (≥ 30%).'],
        ['Chất lượng VCP', '25', 'Số lần co thắt, độ chặt và mức co biến động của base.'],
        ['Cạn thanh khoản', '15', 'Volume cạn dần trong base.'],
        ['Sức mạnh tương đối (RS)', '15', 'Mạnh/yếu so với thị trường (SPY).'],
        ['Thanh khoản', '10', 'Giá trị giao dịch (giá × volume) đủ lớn.'],
        ['Gần pivot', '5', 'Càng sát pivot càng cao.'],
      ]
    : [
        ['Trend', '20', 'Price > EMA50 > EMA150 > EMA200 with EMA200 rising.'],
        ['Previous advance', '10', 'A strong advance into the base (≥ 30%).'],
        ['VCP quality', '25', 'Contraction count, base tightness and volatility contraction.'],
        ['Volume dry-up', '15', 'Volume drying up through the base.'],
        ['Relative strength (RS)', '15', 'Performance vs the market (SPY).'],
        ['Liquidity', '10', 'Sufficient dollar volume (price × volume).'],
        ['Breakout proximity', '5', 'Closer to the pivot = higher.'],
      ];

  const qmTableRows = qmRows
    .map(
      ([k, pts, desc]) =>
        `<tr><td style="white-space:nowrap"><b>${k}</b></td><td style="white-space:nowrap" class="accent">${pts}</td><td class="muted">${desc}</td></tr>`,
    )
    .join('');

  // ── Momentum engine. ──
  const momIntro = vi
    ? `Bộ lọc <b>Momentum</b> trả lời câu hỏi "mã nào đang chạy?". Điểm momentum 0–100 gộp mức tăng <b>1 tháng (15)</b>, <b>3 tháng (25)</b>, <b>6 tháng (25)</b>, <b>RS so với SPY (25)</b> và <b>thanh khoản (10)</b>. Theo phân vị, mỗi mã rơi vào một nhóm: <b>Weak → Building → Strong → Explosive</b>.`
    : `The <b>Momentum</b> screen answers "what's running right now?". A 0–100 momentum score blends <b>1-month (15)</b>, <b>3-month (25)</b>, <b>6-month (25)</b> returns, <b>RS vs SPY (25)</b> and <b>liquidity (10)</b>. By percentile each name is classed <b>Weak → Building → Strong → Explosive</b>.`;

  // ── Surge screen. ──
  const surgeIntro = vi
    ? `Bộ lọc <b>Surge</b> tìm các mã đang <i>bứt tốc ngay lúc này</i> — không cần có VCP hay pivot. Nó lọc tiếp kết quả Momentum, chỉ giữ mã thoả cả hai điều kiện:`
    : `The <b>Surge</b> screen finds stocks that are <i>surging right now</i> — no VCP or pivot pattern required. It narrows the Momentum result down to names passing both conditions:`;

  const surgeConditions = vi
    ? [
        `<b>Giữ trên EMA5 cả tuần:</b> 5 phiên gần nhất đều đóng cửa ≥ EMA5 — không phiên nào gãy xu hướng ngắn hạn.`,
        `<b>Tăng &gt;20% trong 2 tuần:</b> giá hiện tại cao hơn giá 10 nến trước ít nhất 20% — đà bứt phá rõ ràng.`,
      ]
    : [
        `<b>Held above EMA5 all week:</b> every close of the last 5 trading days is ≥ EMA5 — no single day broke the short-term trend.`,
        `<b>&gt;20% gain in two weeks:</b> the current price is at least 20% above the close 10 bars ago — demonstrating real breakout momentum.`,
      ];

  const surgeWhen = vi
    ? `<b>Khi nào dùng Surge?</b> Khi muốn bắt mã vừa vào đà sớm nhất — chúng thường nằm trên EMA5 và EMA10, chưa kịp tạo base VCP hoàn chỉnh. Đây là "cửa hẹp" — ít mã pass hơn Momentum nhưng tín hiệu thẳng hơn.`
    : `<b>When to use Surge?</b> When you want to catch names early in a move — they're typically riding their EMA5/EMA10, not yet forming a full VCP base. It's a tighter filter — fewer names pass than Momentum but the signal is more immediate.`;

  // ── Market regime + sector rotation. ──
  const layers = vi
    ? [
        `<b>Bối cảnh thị trường (Regime)</b>: dựa vào SPY/QQQ để xác định <b>BULL / TRANSITION / BEAR</b> và cờ risk-on/off — biết <i>lúc nào</i> nên mạnh tay.`,
        `<b>Xoay vòng ngành (Sector rotation)</b>: xếp hạng ngành theo mức tăng 1M/3M và RS, làm nổi ngành <b>nóng/lạnh</b> — biết <i>dòng tiền đang chảy về đâu</i>.`,
        `<b>Pre-filter momentum</b>: bộ lọc QM/VCP có thể thu hẹp rổ về nhóm momentum mạnh nhất trước khi quét mẫu hình.`,
      ]
    : [
        `<b>Market regime</b>: SPY/QQQ define <b>BULL / TRANSITION / BEAR</b> and a risk-on/off flag — knowing <i>when</i> to be aggressive.`,
        `<b>Sector rotation</b>: sectors are ranked by 1M/3M return and RS, highlighting <b>hot/cold</b> groups — knowing <i>where money flows</i>.`,
        `<b>Momentum pre-filter</b>: the QM/VCP scan can first narrow the universe to the strongest-momentum names before looking for patterns.`,
      ];

  return `
  <div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 8px">${vi ? '🎯 Điểm chất lượng Qullamaggie' : '🎯 The Qullamaggie Quality Score'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 14px">${qmIntro}</p>
    <div style="overflow-x:auto">
      <table class="playbook-table">
        <thead><tr><th>${vi ? 'Thành phần' : 'Component'}</th><th>${vi ? 'Trọng số' : 'Weight'}</th><th>${vi ? 'Ý nghĩa' : 'Meaning'}</th></tr></thead>
        <tbody>${qmTableRows}</tbody>
      </table>
    </div>

    ${sectionHead(vi ? '🚀 Momentum' : '🚀 Momentum')}
    <p class="muted" style="line-height:1.65;margin:0">${momIntro}</p>

    ${sectionHead(vi ? '⚡ Surge (bứt tốc)' : '⚡ Surge')}
    <p class="muted" style="line-height:1.65;margin:0 0 8px">${surgeIntro}</p>
    <ul class="analysis-list" style="margin:0 0 8px">${surgeConditions.map((c) => `<li>${c}</li>`).join('')}</ul>
    <p class="muted" style="line-height:1.65;margin:0;font-size:12px">${surgeWhen}</p>

    ${sectionHead(vi ? '🧭 Bối cảnh & xoay vòng ngành' : '🧭 Regime & rotation')}
    <ul class="analysis-list">${layers.map((i) => `<li>${i}</li>`).join('')}</ul>

    <div class="muted" style="font-size:11px;margin-top:14px">${
      vi
        ? 'Chỉ để học — không phải khuyến nghị đầu tư.'
        : 'Educational use only — not financial advice.'
    }</div>
  </div>`;
}

function backtestGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  return `<div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 10px">⏱ ${vi ? 'Hướng dẫn Backtest — vì sao ra 0 giao dịch?' : 'Backtest guide — why do I get 0 trades?'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 10px">
      ${vi
        ? 'Backtest chạy thử chiến lược trên dữ liệu ngày trong quá khứ, <b>không nhìn trước tương lai</b>. Đây là những lý do hay gặp nhất khiến kết quả ra 0 giao dịch:'
        : 'The backtest simulates a strategy on historical daily bars with <b>no lookahead</b>. Here are the most common reasons you see 0 trades:'}
    </p>
    <table class="playbook-table">
      <thead><tr>
        <th>${vi ? 'Vấn đề' : 'Issue'}</th>
        <th>${vi ? 'Nguyên nhân' : 'Cause'}</th>
        <th>${vi ? 'Cách xử lý' : 'Fix'}</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><b>${vi ? 'VCP hiếm trên 1 mã' : 'VCP is rare on 1 symbol'}</b></td>
          <td>${vi ? 'VCP cần: một nhịp tăng 30%+, rồi ≥2 lần co thắt với volume cạn dần. Một mã thường chỉ tạo 0–2 VCP mỗi năm.' : 'VCP requires: a 30%+ prior advance, then ≥2 contracting pullbacks with drying volume. A typical stock forms 0–2 VCPs per year.'}</td>
          <td>${vi ? 'Nhập 5–10 mã đang tăng mạnh. Chọn "Max" hoặc "5Y" cho đủ dữ liệu.' : 'Enter 5–10 strong-trending stocks. Use "Max" or "5Y" for sufficient history.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Không đủ dữ liệu' : 'Insufficient data'}</b></td>
          <td>${vi ? 'VCP cần ≥100 nến (để tính EMA200 và dò swing). Chọn "2Y" mà mã chỉ có 1 năm dữ liệu thì mã đó bị bỏ qua.' : 'VCP needs ≥100 bars (for EMA200 and swing detection). If you pick "2Y" but the stock only has 1Y of data, it is skipped.'}</td>
          <td>${vi ? 'Chọn "5Y" hoặc "Max". Xem thông báo skip ở dòng trạng thái.' : 'Use "5Y" or "Max". Check the skip notice in the status line.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? '"Max" đôi khi ít hơn "5Y"' : '"Max" sometimes gives fewer trades than "5Y"'}</b></td>
          <td>${vi ? 'API Yahoo trả dữ liệu thưa hơn ở các giai đoạn xa (split-adjusted, thiếu nến). Càng lùi xa, dữ liệu càng kém.' : 'The Yahoo API returns sparser data for older periods (split-adjusted, missing bars). Data quality degrades further back in time.'}</td>
          <td>${vi ? '"5Y" cho kết quả ổn định nhất. "Max" hợp với mã mới (IPO trong 3–4 năm).' : 'Use "5Y" for most stable results. "Max" is useful for recent IPOs (3–4 years old).'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Mã trong downtrend cả kỳ' : 'Stock was in a downtrend the whole period'}</b></td>
          <td>${vi ? 'VCP cần giá > EMA50 và một nhịp tăng 30%+ trước đó. Mã rơi suốt kỳ thì không bao giờ thoả.' : 'VCP requires price > EMA50 and a 30%+ prior advance. A stock in a sustained decline never meets these conditions.'}</td>
          <td>${vi ? 'Chọn mã trong bull market (AAPL, NVDA, MSFT giai đoạn 2019–2023 là ví dụ tốt).' : 'Pick stocks in bull markets (AAPL, NVDA, MSFT during 2019–2023 are good examples).'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Chiến lược Momentum không entry' : 'Momentum strategy does not enter'}</b></td>
          <td>${vi ? 'Cần điểm momentum ≥65 VÀ giá > EMA50. Mã sideway hay downtrend sẽ dưới ngưỡng.' : 'Requires momentum score ≥65 AND price > EMA50. Sideways or downtrending stocks score below the threshold.'}</td>
          <td>${vi ? 'Thêm mã, hoặc chọn giai đoạn mã đang tăng mạnh.' : 'Add more symbols, or choose a period when the stock was strongly trending.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Lệnh bị chặn vì risk limits' : 'Position blocked by risk limits'}</b></td>
          <td>${vi ? 'Dù có tín hiệu entry, lệnh vẫn bị bỏ nếu size làm tròn ra 0 cổ phiếu (rủi ro mỗi cổ quá lớn so với vốn).' : 'Even when entry signals fire, a position is skipped if share count rounds down to 0 (risk per share too large relative to capital).'}</td>
          <td>${vi ? 'Tăng vốn ban đầu hoặc nâng % rủi ro mỗi lệnh.' : 'Increase capital or raise the risk %/trade.'}</td>
        </tr>
      </tbody>
    </table>
    <div class="muted" style="font-size:11px;margin-top:12px">
      ${vi ? 'Gợi ý: thử NVDA, AAPL, MSFT với chiến lược VCP, kỳ 5Y — thường ra 3–6 giao dịch mỗi mã.' : 'Tip: try NVDA, AAPL, MSFT with VCP strategy, 5Y period — typically 3–6 trades per stock.'}
    </div>
  </div>`;
}

/** Explainer for as-of (point-in-time / historical) screening. */
function asOfGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  const intro = vi
    ? `Mặc định, mọi bộ lọc dùng dữ liệu <b>realtime</b> (nến mới nhất là "hôm nay"). Chế độ <b>Tính đến ngày</b> cho phép chọn một ngày trong quá khứ và coi đó là "hôm nay" — bộ lọc chỉ dùng dữ liệu <i>đến hết</i> ngày đó. Rất hợp để xem lại một mẫu hình trông thế nào vào đúng thời điểm ấy.`
    : `By default every screen uses <b>real-time</b> data (the latest bar is "today"). <b>As-of-date</b> mode lets you pick a past date and treat it as "now" — the screen uses only data <i>up to and including</i> that date. Ideal for studying what a setup looked like at a moment in the past.`;

  const points = vi
    ? [
        `<b>Có ở đâu:</b> Top Picks, Screener và Sectors — mỗi tab có ô chọn ngày riêng. Chọn ngày, hoặc bấm <b>Trực tiếp</b> để quay về dữ liệu realtime.`,
        `<b>Độ sâu dữ liệu (2/5/10 năm/Max):</b> lượng dữ liệu tải về <i>trước</i> ngày đã chọn, để chỉ báo như EMA200 có đủ nến. Đây là lượng dữ liệu tải, không giới hạn ngày được chọn.`,
        `<b>Cờ "Chế độ xem quá khứ":</b> khi bật, nhãn vàng và viền quanh kết quả giúp không nhầm với dữ liệu trực tiếp. Kết quả quét quá khứ lưu riêng, không lẫn với lần quét trực tiếp.`,
        `<b>Trang chi tiết mã:</b> mở một mã từ kết quả quá khứ thì chart, EMA, điểm QM/momentum, phần phân tích và các mức entry/stop/target <i>đều</i> tính đến ngày đó. Bảng chỉ số cơ bản dùng số liệu <b>năm gần nhất trước ngày đó</b> (có ghi rõ).`,
        `<b>Giao dịch giả lập:</b> ô ngày trên form Mua/Bán cho phép ghi lệnh với ngày trong quá khứ — giá gợi ý tự lấy giá đóng cửa <i>của ngày đó</i>.`,
      ]
    : [
        `<b>Where:</b> Top Picks, Screener and Sectors — each tab has its own date picker. Set a date, or press <b>Live</b> to return to real-time data.`,
        `<b>History depth (2/5/10y/Max):</b> chooses how much data is fetched <i>before</i> the chosen date so indicators like EMA200 are well-defined. It's the fetch depth, not a limit on which date you can pick.`,
        `<b>"Historical mode" flag:</b> when active, an amber badge and a tinted results edge make sure you never confuse it with live data. Historical scans are cached separately from your live scans.`,
        `<b>Stock detail page:</b> open a name from historical results and the chart, EMAs, QM/momentum score, analysis and entry/stop/target levels are <i>all</i> computed as of that date. The fundamentals stat grid uses the <b>latest annual figures before the date</b> (clearly labeled).`,
        `<b>Paper Trading:</b> the date field on the Buy/Sell form lets you record a past transaction — the price hint auto-fills the close <i>on that date</i>.`,
      ];

  const caveat = vi
    ? `<b>Lưu ý về số liệu cơ bản:</b> Yahoo chỉ có chỉ số TTM/hiện tại của <i>hôm nay</i>, nên khi xem quá khứ app dùng báo cáo <b>năm gần nhất trước ngày đó</b> cho P/E, EPS, biên lợi nhuận… Vốn hóa, ROE và tỷ suất cổ tức không dựng lại được cho quá khứ nên hiện "—". Còn mọi thứ tính từ giá (xu hướng, mẫu hình, các mức giá) thì đúng chính xác theo thời điểm.`
    : `<b>Note on fundamentals:</b> Yahoo only exposes <i>today's</i> live/TTM figures, so historical mode uses the <b>latest annual statement before the date</b> for P/E, EPS, margin, etc. Market cap, ROE and dividend yield can't be reconstructed for the past, so they show "—". Everything price-derived (trend, patterns, trade levels) is exact for the point in time.`;

  return `<div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 8px">${vi ? '📅 Lọc theo ngày trong quá khứ (Tính đến ngày)' : '📅 Point-in-time screening (As of date)'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 12px">${intro}</p>
    <ul class="analysis-list">${points.map((p) => `<li>${p}</li>`).join('')}</ul>
    <p class="muted" style="line-height:1.65;margin:8px 0 0;font-size:12px">${caveat}</p>
  </div>`;
}

/**
 * Learn, bound as a book in four parts (see `ui/book.ts` for why).
 *
 * The order is the whole argument: the PLAYBOOK IS PART I. It used to be last, on
 * the theory that a reader arrives to look a term up — but the playbook is the
 * thing that gets reread and rewritten, and putting twenty-five reference cards in
 * front of it meant scrolling past all of them every single time. The glossary is
 * back matter now, which is where a glossary has always belonged.
 */
export function renderLearn(ctx: AppContext): void {
  const root = $('#tab-learn')!;
  const lang = getLang();
  const vi = lang === 'vi';

  const parts: BookPart[] = [
    {
      id: 'lb-part-1',
      numeral: 'I',
      icon: '📘',
      title: vi ? 'Cẩm nang swing trading' : 'The swing-trading playbook',
      blurb: vi
        ? 'Từ bối cảnh thị trường đến điểm entry, kèm checklist mỗi tối và thư viện prompt.'
        : 'From the market environment down to the entry, with the evening checklist and the prompt library.',
    },
    {
      id: 'lb-part-2',
      numeral: 'II',
      icon: '🗺',
      title: vi ? 'Dùng nền tảng' : 'Working the platform',
      blurb: vi
        ? 'Cách đi lại trong app, từng trang theo nhóm, lọc theo một ngày trong quá khứ, và backtest.'
        : 'Getting around, every page by group, screening a past date, and the backtest.',
    },
    {
      id: 'lb-part-3',
      numeral: 'III',
      icon: '🎯',
      title: vi ? 'Điểm số được tính thế nào' : 'How the score is computed',
      blurb: vi
        ? 'Mổ xẻ từng thành phần tạo nên điểm QM và momentum.'
        : 'The lid off: every component that makes up the QM and momentum score.',
    },
    {
      id: 'lb-part-4',
      numeral: 'IV',
      icon: '🔤',
      title: vi ? 'Thuật ngữ' : 'Glossary',
      blurb: vi
        ? 'Mọi chỉ số và thuật ngữ, xếp theo nhóm — phần tra cứu cuối sách.'
        : 'Every metric and term, grouped — the back of the book.',
    },
  ];

  root.innerHTML = bookCoverHtml(
    lang,
    vi ? 'Tìm hiểu' : 'Learn',
    vi
      ? 'Một cuốn sổ tay: cẩm nang giao dịch trước, rồi hướng dẫn từng trang, cách tính điểm, cuối cùng là thuật ngữ.'
      : 'One handbook: the trading playbook first, then the platform page by page, how the score is built, and the glossary at the back.',
    parts,
  );

  // Part I — the playbook.
  const p1 = el(bookPartHtml(parts[0]!));
  const playbook = el(swingPlaybookHtml(lang));
  p1.appendChild(playbook);
  root.appendChild(p1);
  wireSwingPlaybook(playbook, lang, ctx);
  wirePlaybookTools(playbook, ctx, lang);

  // Part II — the platform, page by page.
  const p2 = el(bookPartHtml(parts[1]!));
  const guide = el(platformGuideHtml(lang));
  p2.appendChild(guide);
  wirePlatformGuide(guide);
  p2.appendChild(el(asOfGuideHtml(lang)));
  p2.appendChild(el(backtestGuideHtml(lang)));
  root.appendChild(p2);

  // Part III — the score.
  const p3 = el(bookPartHtml(parts[2]!));
  p3.appendChild(el(scoreExplainerHtml(lang)));
  root.appendChild(p3);

  // Part IV — the glossary, as an index at the back.
  const p4 = el(bookPartHtml(parts[3]!));
  // Each group is a chapter card like the other parts' (an emoji-led <h2> that folds
  // the card), with its terms as tiles inside rather than cards inside a card.
  for (const group of GLOSSARY_GROUPS) {
    const terms = group.keys.map((k) => gloss(k)).filter((g): g is NonNullable<typeof g> => !!g);
    p4.appendChild(
      el(`<div class="card analysis-card lb-gloss-group">
        <h2 class="lb-gloss-h">${group.icon} ${group.title[lang] ?? group.title.en}</h2>
        <p class="lb-gloss-lede">${vi ? `${terms.length} thuật ngữ` : `${terms.length} terms`}</p>
        <div class="lb-gloss-grid">${terms
          .map((g) => `<div class="lb-gloss-term"><strong>${g.term}</strong><p>${g.long}</p></div>`)
          .join('')}</div>
      </div>`),
    );
  }
  root.appendChild(p4);

  // Both of these read the finished DOM: the reading times are counted from the
  // words actually on the page, and the contents bar discovers its own entries.
  stampReadingTimes(root, lang);
  wireBookContents(root);
  mountStickyToc(root, lang);
}
