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
import { t, getLang } from '../ui/i18n.js';
import { GLOSSARY_GROUPS, gloss } from '../ui/glossary.js';
import { formDialog } from '../ui/forms.js';
import { loadIndex, loadItems, saveItems, saveIndex, itemsKey, newId } from '../ui/watchlists.js';
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
  root.innerHTML = `
    <h1>${t('wl.title')}</h1>
    <p class="subtitle">${t('wl.sub')}</p>
    <div class="toolbar" id="wl-tabs"></div>
    <div class="card" style="margin-bottom:14px">
      <div class="row">
        <input id="wl-symbol" class="field" style="flex:1" placeholder="Add symbol e.g. AMD" autocomplete="off" />
        <button id="wl-add" class="btn">${t('wl.add')}</button>
        <button id="wl-refresh" class="btn-outline">↻ ${t('wl.refresh')}</button>
        <button id="wl-plan" class="btn-outline">📋 ${t('wl.plan')}</button>
        <button id="wl-export" class="btn-outline" title="${t('wl.export.tip')}">⬇ ${t('wl.export')}</button>
        <button id="wl-import" class="btn-outline" title="${t('wl.import.tip')}">⬆ ${t('wl.import')}</button>
        <input id="wl-import-file" type="file" accept="application/json,.json" style="display:none" />
      </div>
    </div>
    <div id="wl-plan-panel"></div>
    <div id="wl-results"></div>`;

  void refreshAll(ctx);

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
    ? `Bộ lọc <b>Qullamaggie (QM)</b> tìm các thiết lập có xác suất cao: mẫu hình <b>co thắt biến động (VCP)</b> sau một nhịp tăng mạnh, và <b>điểm xoay đột biến (Episodic Pivot)</b> — cú gap theo tin tức/lợi nhuận. Mỗi mã được chấm <b>điểm chất lượng 0–100</b> theo trọng số dưới đây.`
    : `The <b>Qullamaggie (QM)</b> screen finds high-probability setups: <b>Volatility Contraction Patterns (VCP)</b> after a strong advance, and <b>Episodic Pivots</b> — news/earnings gaps. Each stock gets a <b>Quality Score 0–100</b> from the weighted components below.`;

  const qmRows: [string, string, string][] = vi
    ? [
        ['Xu hướng (Trend)', '20', 'Giá > EMA50 > EMA150 > EMA200 và EMA200 đang lên.'],
        ['Nhịp tăng trước', '10', 'Nhịp tăng dẫn vào nền càng mạnh càng tốt (≥ 30%).'],
        ['Chất lượng VCP', '25', 'Số lần co thắt, độ chặt và độ co biến động của nền.'],
        ['Cạn thanh khoản', '15', 'Volume cạn dần trong nền.'],
        ['Sức mạnh tương đối (RS)', '15', 'Hiệu suất so với thị trường (SPY).'],
        ['Thanh khoản', '10', 'Giá trị giao dịch (giá × khối lượng) đủ lớn.'],
        ['Gần điểm bứt phá', '5', 'Càng sát pivot càng cao.'],
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
    ? `Bộ lọc <b>Động lượng (Momentum)</b> trả lời "mã nào đang chạy?". Điểm động lượng 0–100 kết hợp lợi nhuận <b>1 tháng (15)</b>, <b>3 tháng (25)</b>, <b>6 tháng (25)</b>, <b>RS so với SPY (25)</b> và <b>thanh khoản (10)</b>. Theo phân vị, mỗi mã được xếp loại: <b>Weak → Building → Strong → Explosive</b>.`
    : `The <b>Momentum</b> screen answers "what's running right now?". A 0–100 momentum score blends <b>1-month (15)</b>, <b>3-month (25)</b>, <b>6-month (25)</b> returns, <b>RS vs SPY (25)</b> and <b>liquidity (10)</b>. By percentile each name is classed <b>Weak → Building → Strong → Explosive</b>.`;

  // ── Surge screen. ──
  const surgeIntro = vi
    ? `Bộ lọc <b>Surge</b> tìm các mã đang <i>bứt tốc ngay bây giờ</i> — không cần hình thành mẫu hình VCP hay điểm xoay. Nó thu hẹp kết quả của Momentum xuống những mã thoả cả hai điều kiện:`
    : `The <b>Surge</b> screen finds stocks that are <i>surging right now</i> — no VCP or pivot pattern required. It narrows the Momentum result down to names passing both conditions:`;

  const surgeConditions = vi
    ? [
        `<b>Giữ trên EMA5 cả tuần:</b> mỗi phiên trong 5 ngày giao dịch gần nhất đều đóng cửa ≥ EMA5 — không ngày nào bị gãy xu hướng ngắn hạn.`,
        `<b>Tăng &gt;20% trong 2 tuần:</b> giá hiện tại cao hơn giá 10 nến trước ít nhất 20% — chứng tỏ đà bứt phá mạnh.`,
      ]
    : [
        `<b>Held above EMA5 all week:</b> every close of the last 5 trading days is ≥ EMA5 — no single day broke the short-term trend.`,
        `<b>&gt;20% gain in two weeks:</b> the current price is at least 20% above the close 10 bars ago — demonstrating real breakout momentum.`,
      ];

  const surgeWhen = vi
    ? `<b>Khi nào dùng Surge?</b> Khi bạn muốn bắt các mã đang vào đà sớm nhất — chúng thường nằm trên EMA5 và EMA10, chưa kịp hình thành nền VCP hoàn chỉnh. Đây là "cánh cửa hẹp" — ít mã pass hơn Momentum nhưng tín hiệu trực tiếp hơn.`
    : `<b>When to use Surge?</b> When you want to catch names early in a move — they're typically riding their EMA5/EMA10, not yet forming a full VCP base. It's a tighter filter — fewer names pass than Momentum but the signal is more immediate.`;

  // ── Market regime + sector rotation. ──
  const layers = vi
    ? [
        `<b>Bối cảnh thị trường (Regime)</b>: dùng SPY/QQQ để xác định <b>BULL / TRANSITION / BEAR</b> và cờ risk-on/off — biết <i>khi nào</i> nên mạnh tay.`,
        `<b>Luân chuyển ngành (Sector rotation)</b>: xếp hạng ngành theo lợi nhuận 1M/3M và RS, nêu bật ngành <b>nóng/lạnh</b> — biết <i>tiền đang chảy về đâu</i>.`,
        `<b>Pre-filter động lượng</b>: bộ lọc QM/VCP có thể thu hẹp vũ trụ về nhóm động lượng mạnh nhất trước khi quét mẫu hình.`,
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

    ${sectionHead(vi ? '🚀 Động lượng (Momentum)' : '🚀 Momentum')}
    <p class="muted" style="line-height:1.65;margin:0">${momIntro}</p>

    ${sectionHead(vi ? '⚡ Surge (bứt tốc)' : '⚡ Surge')}
    <p class="muted" style="line-height:1.65;margin:0 0 8px">${surgeIntro}</p>
    <ul class="analysis-list" style="margin:0 0 8px">${surgeConditions.map((c) => `<li>${c}</li>`).join('')}</ul>
    <p class="muted" style="line-height:1.65;margin:0;font-size:12px">${surgeWhen}</p>

    ${sectionHead(vi ? '🧭 Bối cảnh & luân chuyển' : '🧭 Regime & rotation')}
    <ul class="analysis-list">${layers.map((i) => `<li>${i}</li>`).join('')}</ul>

    <div class="muted" style="font-size:11px;margin-top:14px">${
      vi
        ? 'Mang tính giáo dục — không phải lời khuyên đầu tư.'
        : 'Educational use only — not financial advice.'
    }</div>
  </div>`;
}

function backtestGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  return `<div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 10px">⏱ ${vi ? 'Hướng dẫn Backtest — tại sao kết quả 0 giao dịch?' : 'Backtest guide — why do I get 0 trades?'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 10px">
      ${vi
        ? 'Backtest mô phỏng chiến lược trên dữ liệu ngày lịch sử mà <b>không nhìn trước</b>. Dưới đây là những lý do phổ biến nhất khiến kết quả trả về 0 giao dịch:'
        : 'The backtest simulates a strategy on historical daily bars with <b>no lookahead</b>. Here are the most common reasons you see 0 trades:'}
    </p>
    <table class="playbook-table">
      <thead><tr>
        <th>${vi ? 'Vấn đề' : 'Issue'}</th>
        <th>${vi ? 'Nguyên nhân' : 'Cause'}</th>
        <th>${vi ? 'Giải pháp' : 'Fix'}</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><b>${vi ? 'VCP hiếm trên 1 mã' : 'VCP is rare on 1 symbol'}</b></td>
          <td>${vi ? 'VCP cần: nhịp tăng 30%+, rồi ≥2 lần co thắt biến động với volume cạn dần. Một mã điển hình chỉ hình thành 0–2 VCP/năm.' : 'VCP requires: a 30%+ prior advance, then ≥2 contracting pullbacks with drying volume. A typical stock forms 0–2 VCPs per year.'}</td>
          <td>${vi ? 'Nhập 5–10 mã đang trong xu hướng tăng mạnh. Dùng "Max" hoặc "5Y" để có đủ dữ liệu.' : 'Enter 5–10 strong-trending stocks. Use "Max" or "5Y" for sufficient history.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Không đủ dữ liệu' : 'Insufficient data'}</b></td>
          <td>${vi ? 'VCP cần ≥100 nến (để tính EMA200 và phát hiện swing). Nếu chọn "2Y" nhưng mã chỉ có dữ liệu 1 năm, nó bị bỏ qua.' : 'VCP needs ≥100 bars (for EMA200 and swing detection). If you pick "2Y" but the stock only has 1Y of data, it is skipped.'}</td>
          <td>${vi ? 'Chọn "5Y" hoặc "Max". Xem thông báo skip trong dòng trạng thái.' : 'Use "5Y" or "Max". Check the skip notice in the status line.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? '"Max" đôi khi ít hơn "5Y"' : '"Max" sometimes gives fewer trades than "5Y"'}</b></td>
          <td>${vi ? 'API Yahoo trả về dữ liệu thưa hơn ở khoảng thời gian xa (split-adjusted, thiếu nến). Càng về xa, chất lượng bar càng kém.' : 'The Yahoo API returns sparser data for older periods (split-adjusted, missing bars). Data quality degrades further back in time.'}</td>
          <td>${vi ? 'Dùng "5Y" cho kết quả ổn định nhất. "Max" hữu ích khi mã còn mới (IPO trong 3–4 năm).' : 'Use "5Y" for most stable results. "Max" is useful for recent IPOs (3–4 years old).'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Mã trong downtrend cả kỳ' : 'Stock was in a downtrend the whole period'}</b></td>
          <td>${vi ? 'VCP yêu cầu giá > EMA50 và nhịp tăng 30%+ trước đó. Mã đang rơi suốt sẽ không bao giờ kích hoạt điều kiện này.' : 'VCP requires price > EMA50 and a 30%+ prior advance. A stock in a sustained decline never meets these conditions.'}</td>
          <td>${vi ? 'Chọn mã trong bull market (AAPL, NVDA, MSFT trong 2019–2023 là ví dụ tốt).' : 'Pick stocks in bull markets (AAPL, NVDA, MSFT during 2019–2023 are good examples).'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Chiến lược Momentum không entry' : 'Momentum strategy does not enter'}</b></td>
          <td>${vi ? 'Cần điểm momentum ≥65 VÀ giá > EMA50. Mã sideway hay downtrend cho điểm thấp hơn.' : 'Requires momentum score ≥65 AND price > EMA50. Sideways or downtrending stocks score below the threshold.'}</td>
          <td>${vi ? 'Thêm nhiều mã hơn, hoặc chọn giai đoạn khi mã đang tăng mạnh.' : 'Add more symbols, or choose a period when the stock was strongly trending.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Vị thế bị chặn bởi risk limits' : 'Position blocked by risk limits'}</b></td>
          <td>${vi ? 'Ngay cả khi có tín hiệu entry, vị thế bị bỏ qua nếu tính ra 0 cổ phiếu (rủi ro/cổ phiếu quá lớn so với vốn).' : 'Even when entry signals fire, a position is skipped if share count rounds down to 0 (risk per share too large relative to capital).'}</td>
          <td>${vi ? 'Tăng vốn ban đầu hoặc tăng % rủi ro/lệnh.' : 'Increase capital or raise the risk %/trade.'}</td>
        </tr>
      </tbody>
    </table>
    <div class="muted" style="font-size:11px;margin-top:12px">
      ${vi ? 'Gợi ý: thử NVDA, AAPL, MSFT với chiến lược VCP, chu kỳ 5Y — điển hình cho 3–6 giao dịch mỗi mã.' : 'Tip: try NVDA, AAPL, MSFT with VCP strategy, 5Y period — typically 3–6 trades per stock.'}
    </div>
  </div>`;
}

/** Explainer for as-of (point-in-time / historical) screening. */
function asOfGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  const intro = vi
    ? `Mặc định, mọi bộ lọc dùng dữ liệu <b>thời gian thực</b> (nến mới nhất là "hôm nay"). Chế độ <b>Tính đến ngày</b> cho phép bạn chọn một ngày trong quá khứ và coi ngày đó là "hôm nay" — bộ lọc chỉ dùng dữ liệu <i>tới và bao gồm</i> ngày đó. Tuyệt vời để nghiên cứu xem một mẫu hình trông như thế nào tại thời điểm trong quá khứ.`
    : `By default every screen uses <b>real-time</b> data (the latest bar is "today"). <b>As-of-date</b> mode lets you pick a past date and treat it as "now" — the screen uses only data <i>up to and including</i> that date. Ideal for studying what a setup looked like at a moment in the past.`;

  const points = vi
    ? [
        `<b>Có ở đâu:</b> Top Picks, Screener và Sectors — mỗi tab có bộ chọn ngày riêng. Đặt ngày, hoặc bấm <b>Trực tiếp</b> để quay lại dữ liệu thời gian thực.`,
        `<b>Độ sâu lịch sử (2/5/10 năm/Max):</b> chọn lượng dữ liệu tải về <i>trước</i> ngày đã chọn, để các chỉ báo như EMA200 đủ dữ liệu. Đây là lượng dữ liệu tải, không phải giới hạn ngày chọn.`,
        `<b>Cờ "Chế độ lịch sử":</b> khi bật, một nhãn vàng và viền kết quả giúp bạn không nhầm với dữ liệu trực tiếp. Kết quả quét lịch sử được lưu riêng (không lẫn với quét trực tiếp).`,
        `<b>Trang chi tiết mã:</b> mở một mã từ kết quả lịch sử thì biểu đồ, EMA, điểm QM/động lượng, phân tích và các mức mua/dừng/mục tiêu <i>đều</i> tính đến ngày đó. Lưới chỉ số cơ bản dùng số liệu <b>năm gần nhất trước ngày</b> (được ghi rõ).`,
        `<b>Giao dịch mô phỏng:</b> ô ngày trên form Mua/Bán cho phép ghi lệnh trong quá khứ — gợi ý giá sẽ tự lấy giá đóng cửa <i>của ngày đó</i>.`,
      ]
    : [
        `<b>Where:</b> Top Picks, Screener and Sectors — each tab has its own date picker. Set a date, or press <b>Live</b> to return to real-time data.`,
        `<b>History depth (2/5/10y/Max):</b> chooses how much data is fetched <i>before</i> the chosen date so indicators like EMA200 are well-defined. It's the fetch depth, not a limit on which date you can pick.`,
        `<b>"Historical mode" flag:</b> when active, an amber badge and a tinted results edge make sure you never confuse it with live data. Historical scans are cached separately from your live scans.`,
        `<b>Stock detail page:</b> open a name from historical results and the chart, EMAs, QM/momentum score, analysis and entry/stop/target levels are <i>all</i> computed as of that date. The fundamentals stat grid uses the <b>latest annual figures before the date</b> (clearly labeled).`,
        `<b>Paper Trading:</b> the date field on the Buy/Sell form lets you record a past transaction — the price hint auto-fills the close <i>on that date</i>.`,
      ];

  const caveat = vi
    ? `<b>Lưu ý về số liệu cơ bản:</b> Yahoo chỉ cung cấp chỉ số TTM/trực tiếp của <i>hôm nay</i>, nên ở chế độ lịch sử ta dùng báo cáo <b>năm gần nhất trước ngày</b> cho P/E, EPS, biên lợi nhuận… Vốn hóa, ROE và tỷ suất cổ tức không tái dựng được cho quá khứ nên hiển thị "—". Mọi thứ tính từ giá (xu hướng, mẫu hình, mức giao dịch) thì hoàn toàn chính xác theo thời điểm.`
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
        ? 'Từ môi trường thị trường xuống đến điểm vào lệnh, cùng checklist hằng tối và thư viện prompt.'
        : 'From the market environment down to the entry, with the evening checklist and the prompt library.',
    },
    {
      id: 'lb-part-2',
      numeral: 'II',
      icon: '🗺',
      title: vi ? 'Dùng nền tảng' : 'Working the platform',
      blurb: vi
        ? 'Đi lại trong app, từng trang theo nhóm, lọc theo một ngày trong quá khứ, và backtest.'
        : 'Getting around, every page by group, screening a past date, and the backtest.',
    },
    {
      id: 'lb-part-3',
      numeral: 'III',
      icon: '🎯',
      title: vi ? 'Điểm số được tính thế nào' : 'How the score is computed',
      blurb: vi
        ? 'Mở nắp máy: từng thành phần làm nên điểm QM và momentum.'
        : 'The lid off: every component that makes up the QM and momentum score.',
    },
    {
      id: 'lb-part-4',
      numeral: 'IV',
      icon: '🔤',
      title: vi ? 'Thuật ngữ' : 'Glossary',
      blurb: vi
        ? 'Mọi chỉ số và thuật ngữ, xếp theo nhóm — phần tra cứu ở cuối sách.'
        : 'Every metric and term, grouped — the back of the book.',
    },
  ];

  root.innerHTML = bookCoverHtml(
    lang,
    vi ? 'Tìm hiểu' : 'Learn',
    vi
      ? 'Một cuốn sổ tay: cẩm nang giao dịch trước, rồi hướng dẫn từng trang, cách tính điểm, và cuối cùng là thuật ngữ.'
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
  for (const group of GLOSSARY_GROUPS) {
    const section = el(`<div class="lb-gloss-group"></div>`);
    section.appendChild(
      el(`<h2 class="lb-gloss-h">${group.title[lang] ?? group.title.en}</h2>`),
    );
    const grid = el(`<div class="grid grid-cards"></div>`);
    for (const key of group.keys) {
      const g = gloss(key);
      if (!g) continue;
      grid.appendChild(
        el(`<div class="card"><strong>${g.term}</strong><p class="muted" style="margin:6px 0 0;line-height:1.55">${g.long}</p></div>`),
      );
    }
    section.appendChild(grid);
    p4.appendChild(section);
  }
  root.appendChild(p4);

  // Both of these read the finished DOM: the reading times are counted from the
  // words actually on the page, and the contents bar discovers its own entries.
  stampReadingTimes(root, lang);
  wireBookContents(root);
  mountStickyToc(root, lang);
}
