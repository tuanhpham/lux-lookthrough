import { screen, fetchMany, type ScreenRow } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { openStock } from '../ui/stockModal.js';
import { sortableTable, type SortKey } from '../ui/sortableTable.js';
import { t, getLang } from '../ui/i18n.js';
import { GLOSSARY_GROUPS, gloss } from '../ui/glossary.js';
import { formDialog } from '../ui/forms.js';
import { loadIndex, loadItems, saveItems, saveIndex, itemsKey, newId } from '../ui/watchlists.js';

let activeId: string | null = null;

export function renderWatchlist(ctx: AppContext): void {
  const root = $('#tab-watchlist')!;
  root.innerHTML = `
    <h1>${t('wl.title')}</h1>
    <p class="subtitle">${t('wl.sub')}</p>
    <div class="toolbar" id="wl-tabs"></div>
    <div class="card" style="margin-bottom:14px">
      <div class="row">
        <input id="wl-symbol" class="field" style="flex:1" placeholder="Add symbol e.g. AMD" autocomplete="off" />
        <button id="wl-add" class="btn">${t('wl.add')}</button>
        <button id="wl-refresh" class="btn-outline">↻ Refresh quotes</button>
        <button id="wl-export" class="btn-outline" title="Download all watchlists as a JSON backup">⬇ Export</button>
        <button id="wl-import" class="btn-outline" title="Restore watchlists from a JSON backup">⬆ Import</button>
        <input id="wl-import-file" type="file" accept="application/json,.json" style="display:none" />
      </div>
    </div>
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
const rowCache = new Map<string, { syms: string[]; rows: ScreenRow[] }>();
let wlSort: { key: SortKey; desc: boolean } = { key: 'score', desc: true };

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
        rows.push(screen([ohlcv], { minScore: -1000, limit: 1 }).results[0]!);
      } else {
        // Keep the symbol visible even if data is missing/short.
        rows.push({ symbol: sym, stage: 0, stageLabel: 'INSUFFICIENT_DATA', price: 0, score: 0, signal: 'NO_SIGNAL',
          entryPrice: null, stopLoss: null, targetPrice: null, riskReward: null, pivotHigh: null,
          distanceToPivotPct: null, priceRangePct: null, atrContractionPct: null, volumeDryUpPct: null,
          vcpContractions: null, daysInBase: null } as ScreenRow);
      }
    }
    rowCache.set(activeId, { syms: [...syms], rows });
  }

  out.innerHTML = '';
  out.appendChild(
    sortableTable(rows!, {
      sortKey: wlSort.key,
      sortDesc: wlSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym),
      onSortChange: (key, desc) => {
        wlSort = { key, desc };
      },
      action: {
        header: '',
        html: (r) => `<button class="icon-btn" data-row-action data-del="${r.symbol}" title="Remove from list">✕</button>`,
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
}

// ── Learn (full bilingual glossary, grouped) ────────────────────────────────────
/**
 * "How the Conviction Score works" explainer for the Learn page. Mirrors the
 * exact rubric in packages/core/src/scoring/score.ts so users can understand
 * (and trust) why a stock scores what it does — and why some names (e.g. a
 * large-cap not currently in a tight base, or one whose volatility expanded)
 * legitimately score low or even negative and thus don't pass the filters.
 */
function scoreExplainerHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  const hl = (s: string) => `<span class="hl">${s}</span>`;

  const intro = vi
    ? `Mỗi cổ phiếu được chấm một <b>điểm tin cậy (Conviction Score) từ 0–100</b>. Điểm này <b>không</b> đo "tốt/xấu" của công ty — nó đo mức độ cổ phiếu đang ở trong một <b>nền giá chặt, ít biến động, gần điểm bứt phá</b> theo phương pháp VCP / Stage Analysis (Minervini / Weinstein). Điểm cao = thiết lập kỹ thuật đẹp <i>ngay lúc này</i>.`
    : `Every stock gets a <b>Conviction Score from 0–100</b>. It does <b>not</b> measure whether the company is "good" — it measures how tightly the stock is coiled in a low-volatility base near a breakout, in the VCP / Stage-Analysis style (Minervini / Weinstein). A high score = a clean technical setup <i>right now</i>.`;

  const rows: [string, string, string][] = vi
    ? [
        ['Giai đoạn (Stage)', '+25 / +10 / 0', 'Stage 2 (đang tăng giá) +25 · Stage 1 (tạo nền) +10 · còn lại 0'],
        ['Co thắt biến động (ATR)', '0 → +20', 'Biến động càng co lại càng tốt (đạt tối đa khi co ~30%). Nếu biến động <b>giãn ra</b>, mục này <b>âm</b> và có thể kéo tổng điểm xuống dưới 0.'],
        ['Độ chặt biên độ giá', '0 → +15', 'Biên độ nền càng hẹp càng cao (5% → +15, 30% → 0).'],
        ['Cạn thanh khoản', '0 → +15', 'Volume cạn dần trong nền (đạt tối đa khi cạn ~40%).'],
        ['Số lần co thắt VCP', '0 → +15', 'Mỗi lần co thắt +5 (tối đa 3 lần).'],
        ['Gần điểm pivot', '0 → +10', 'Càng sát điểm bứt phá càng cao (trong vòng 5%).'],
      ]
    : [
        ['Stage', '+25 / +10 / 0', 'Stage 2 (advancing) +25 · Stage 1 (basing) +10 · otherwise 0'],
        ['ATR volatility contraction', '0 → +20', 'The more volatility tightens, the better (maxes out around a 30% contraction). If volatility <b>expanded</b>, this term goes <b>negative</b> and can drag the total below 0.'],
        ['Price-range tightness', '0 → +15', 'Tighter base = higher (5% range → +15, 30% → 0).'],
        ['Volume dry-up', '0 → +15', 'Volume drying up through the base (maxes around 40%).'],
        ['VCP contractions', '0 → +15', '+5 per successive contraction (capped at 3).'],
        ['Proximity to pivot', '0 → +10', 'Closer to the breakout pivot = higher (within 5%).'],
      ];

  const tableRows = rows
    .map(
      ([k, pts, desc]) =>
        `<tr><td style="white-space:nowrap"><b>${k}</b></td><td style="white-space:nowrap" class="accent">${pts}</td><td class="muted">${desc}</td></tr>`,
    )
    .join('');

  const formula = vi
    ? `Điểm = Stage + ATR + Biên độ + Thanh khoản + VCP + Pivot, sau đó <b>giới hạn trên ≤ 100</b>. Lưu ý: <b>không có giới hạn dưới</b> — nên điểm có thể <b>âm</b> (ví dụ ${hl('STX')}, ${hl('INTC')} khi biến động đang giãn ra).`
    : `Score = Stage + ATR + Range + Volume + VCP + Pivot, then <b>capped at ≤ 100</b>. Note: there is <b>no lower clamp</b> — so the score can go <b>negative</b> (e.g. ${hl('STX')}, ${hl('INTC')} when volatility is expanding).`;

  const whyEmpty = vi
    ? [
        `<b>Top Picks</b> dùng ngưỡng có sẵn: Breakout cần điểm ${hl('≥ 70')}, Momentum ${hl('≥ 55')}, VCP ${hl('≥ 60')}. Cổ phiếu vốn hoá lớn không ở trong nền chặt (vd ${hl('MSFT')}) thường <b>dưới ngưỡng</b> nên không hiện — đây là <b>đúng thiết kế</b>, không phải lỗi.`,
        `<b>Screener</b>: để trống ô "Min score" = <b>không giới hạn</b> điểm, nên kể cả cổ phiếu điểm âm vẫn hiện. Nếu gõ một mã mà <b>không ra gì</b>, dòng trạng thái sẽ nói rõ lý do: không tải được (rate-limit Yahoo → bấm Run lại), quá ít dữ liệu (&lt;60 phiên), hay bị lọc bởi điểm/tín hiệu/giai đoạn.`,
        `Một số mã bị <b>bỏ qua âm thầm</b> khi nhà cung cấp dữ liệu trả lỗi/0 dữ liệu trong lần quét đó. Bấm <b>Run</b> lại thường là hiện.`,
      ]
    : [
        `<b>Top Picks</b> uses preset thresholds: Breakout needs score ${hl('≥ 70')}, Momentum ${hl('≥ 55')}, VCP ${hl('≥ 60')}. A large-cap that isn't in a tight base (e.g. ${hl('MSFT')}) is usually <b>below the threshold</b> and won't show — that's <b>by design</b>, not a bug.`,
        `<b>Screener</b>: leaving "Min score" blank means <b>no score limit</b>, so even negative-scoring names appear. If you type a ticker and get <b>nothing</b>, the status line tells you exactly why: couldn't be fetched (Yahoo rate-limit → click Run again), too little history (&lt;60 bars), or filtered out by score/signal/stage.`,
        `Some tickers are <b>silently dropped</b> when the data provider errors / returns no data that run. Clicking <b>Run</b> again usually fixes it.`,
      ];

  const coverage = vi
    ? `Ứng dụng quét <b>không phải toàn bộ</b> ~6000+ mã niêm yết ở Mỹ. Mặc định quét <b>~543 mã chọn lọc</b> (nhanh); bật ô <b>"Broad"</b> ở Top Picks để quét <b>S&P 500 + 400 + 600 (~1500 mã)</b> lấy từ Wikipedia (chậm hơn). Mã ngoài các danh sách này vẫn xem được chi tiết bằng cách <b>gõ trực tiếp vào Screener</b>.`
    : `The app does <b>not</b> scan all ~6000+ US-listed tickers. By default it scans a <b>curated ~543 names</b> (fast); turn on the <b>"Broad"</b> toggle in Top Picks to scan the <b>S&P 500 + 400 + 600 (~1500 names)</b> pulled from Wikipedia (slower). Any ticker outside these lists can still be opened by <b>typing it directly into the Screener</b>.`;

  return `
  <div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 8px">${vi ? '🎯 Điểm được tính như thế nào?' : '🎯 How the Conviction Score works'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 14px">${intro}</p>

    <div class="section-title" style="margin-top:0">${vi ? 'Thang điểm' : 'The rubric'}</div>
    <div style="overflow-x:auto">
      <table class="playbook-table">
        <thead><tr><th>${vi ? 'Thành phần' : 'Component'}</th><th>${vi ? 'Điểm' : 'Points'}</th><th>${vi ? 'Ý nghĩa' : 'Meaning'}</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <p class="muted" style="line-height:1.6;margin:12px 0 0">${formula}</p>

    <div class="section-title">${vi ? 'Vì sao một số mã không hiện?' : 'Why do some stocks not show up?'}</div>
    <ul class="analysis-list">${whyEmpty.map((i) => `<li>${i}</li>`).join('')}</ul>

    <div class="section-title">${vi ? 'Phạm vi quét (universe)' : 'Scan coverage (universe)'}</div>
    <p class="muted" style="line-height:1.65;margin:0">${coverage}</p>

    <div class="muted" style="font-size:11px;margin-top:14px">${
      vi
        ? 'Mang tính giáo dục — không phải lời khuyên đầu tư.'
        : 'Educational use only — not financial advice.'
    }</div>
  </div>`;
}

export function renderLearn(): void {
  const root = $('#tab-learn')!;
  const lang = getLang();
  root.innerHTML = `<h1>${lang === 'vi' ? 'Tìm hiểu' : 'Learn'}</h1>
    <p class="subtitle">${lang === 'vi' ? 'Cách tính điểm, cách lọc, và mọi chỉ số — giải thích dễ hiểu.' : 'How the score is computed, how filtering works, and every metric — in plain English.'}</p>`;
  root.appendChild(el(scoreExplainerHtml(lang)));
  for (const group of GLOSSARY_GROUPS) {
    const section = el(`<div style="margin-bottom:18px"></div>`);
    section.appendChild(
      el(
        `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin:0 0 8px">${
          group.title[lang] ?? group.title.en
        }</h2>`,
      ),
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
    root.appendChild(section);
  }
}
