/**
 * Case Studies tab — a journal of annotated past setups. List view → editor
 * (symbol, key date, levels, dated catalysts, notes) → detail view with a
 * static SVG chart of the ±window around the key date, downloadable as a
 * self-contained HTML report (print → Save as PDF).
 */
import type { Bar, OHLCV } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { getLang } from '../ui/i18n.js';
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
import { caseStudyHtml } from '../caseStudies/report.js';
import { richNoteDialog, sanitizeNoteHtml, isNoteEmpty } from '../ui/richNote.js';

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
  const idx = await loadCaseIndex(ctx);

  root.innerHTML = `
    <h1>${vi ? 'Hồ sơ Setup' : 'Case Studies'}</h1>
    <p class="subtitle">${
      vi
        ? 'Ghi lại các thiết lập trong quá khứ: ngày then chốt, mức mua/cắt lỗ/mục tiêu, chất xúc tác và ghi chú — kèm biểu đồ và xuất báo cáo.'
        : 'Document past setups: the key date, entry/stop/target, catalysts and notes — with a chart and a downloadable report.'
    }</p>
    <div class="row" style="margin-bottom:16px">
      <button id="cs-new" class="btn">${vi ? '＋ Hồ sơ mới' : '＋ New case study'}</button>
    </div>
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
async function openDetail(ctx: AppContext, id: string): Promise<void> {
  const root = $('#tab-casestudies')!;
  const vi = getLang() === 'vi';
  const study = await loadCase(ctx, id);
  if (!study) return void renderList(ctx);

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
      <button id="cs-back" class="btn-outline">← ${vi ? 'Quay lại' : 'Back'}</button>
      <div class="row" style="gap:8px">
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
      ${detailStat(vi ? 'Mua' : 'Entry', money(study.entry), '#5b8cff')}
      ${detailStat(vi ? 'Cắt lỗ' : 'Stop', money(study.stop), 'var(--danger)')}
      ${detailStat(vi ? 'Mục tiêu' : 'Target', money(study.target), 'var(--accent)')}
      ${detailStat('R:R', plannedRr(study))}
      ${detailStat(vi ? 'Ngày thoát' : 'Exit date', study.exitDate ?? '—')}
      ${detailStat(vi ? 'Giá thoát' : 'Exit price', money(study.exitPrice))}
      ${detailStat(vi ? 'Kết quả R' : 'Result R', study.rMultiple != null ? study.rMultiple.toFixed(2) + 'R' : '—', study.rMultiple != null ? (study.rMultiple >= 0 ? 'var(--accent)' : 'var(--danger)') : undefined)}
      ${detailStat(vi ? 'Loại' : 'Setup', escapeAttr(study.setupType))}
      ${detailStat(vi ? 'Xếp hạng' : 'Rating', study.rating || '—', study.rating ? RATING_COLOR[study.rating] : undefined)}
    </div>
    <div class="section-title">${vi ? '📅 Chất xúc tác & tin tức' : '📅 Catalysts & news'}</div>
    <div class="card" style="margin-bottom:14px">${catalystListHtml(study, vi)}</div>
    <div class="section-title">${vi ? '📝 Ghi chú & bài học' : '📝 Notes & lessons'}</div>
    <div class="card note-html" style="line-height:1.7">${!isNoteEmpty(study.notes) ? sanitizeNoteHtml(study.notes) : `<span class="muted">${vi ? 'Chưa có ghi chú.' : 'No notes.'}</span>`}</div>`;

  $('#cs-back')!.addEventListener('click', () => void renderList(ctx));
  $('#cs-edit')!.addEventListener('click', () => openEditor(ctx, study));
  $('#cs-delete')!.addEventListener('click', async () => {
    if (!confirm(vi ? `Xóa hồ sơ ${study.symbol}?` : `Delete case study for ${study.symbol}?`)) return;
    await deleteCase(ctx, id);
    void renderList(ctx);
  });

  // Fetch bars and draw the chart; window buttons redraw from the same bars.
  const bars = await fetchBars(ctx, study.symbol);
  let windowMonths = study.windowMonths;
  const drawChart = () => {
    const win = windowBars(bars, study.keyDate, windowMonths);
    $('#cs-chart')!.innerHTML = caseSvgChart(win, { ...study, windowMonths });
  };
  drawChart();
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
    const html = caseStudyHtml({ ...study, windowMonths }, bars);
    downloadHtml(html, `case-study-${study.symbol}-${study.keyDate}`);
  });
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
        <div><label class="field-label">${vi ? 'Mua' : 'Entry'}</label><input id="f-entry" class="field" type="number" step="any" value="${study.entry ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Cắt lỗ' : 'Stop'}</label><input id="f-stop" class="field" type="number" step="any" value="${study.stop ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Mục tiêu' : 'Target'}</label><input id="f-target" class="field" type="number" step="any" value="${study.target ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Ngày thoát' : 'Exit date'}</label><input id="f-exitdate" class="field" type="date" max="${todayIso()}" value="${study.exitDate ?? ''}" /></div>
        <div><label class="field-label">${vi ? 'Giá thoát' : 'Exit price'}</label><input id="f-exitprice" class="field" type="number" step="any" value="${study.exitPrice ?? ''}" /></div>
        <div><label class="field-label" title="${vi ? '(exitPrice − entry) / (entry − stop). Tự động tính nếu để trống.' : '(exitPrice − entry) / (entry − stop). Auto-calculated if left blank.'}">${vi ? 'Kết quả R' : 'Result R'} <span class="muted" style="font-size:10px">${vi ? '(tự động)' : '(auto)'}</span></label><input id="f-rmult" class="field" type="number" step="any" value="${study.rMultiple ?? ''}" placeholder="${vi ? 'tự động' : 'auto'}" /></div>
      </div>
    </div>

    <div class="section-title">${vi ? '📅 Chất xúc tác & tin tức' : '📅 Catalysts & news'}</div>
    <div class="card" style="margin-bottom:14px">
      <div id="cs-cat-rows"></div>
      <div class="row" style="margin-top:8px;gap:8px;align-items:flex-start">
        <input id="cs-cat-date" class="field" type="date" max="${todayIso()}" style="width:160px" />
        <div class="cs-cat-input note-html field" id="cs-cat-text" contenteditable="true" data-placeholder="${vi ? 'Tin tức / lợi nhuận / chất xúc tác… (định dạng được)' : 'News / earnings / catalyst… (formatting supported)'}" style="flex:1;min-height:38px"></div>
        <button id="cs-cat-add" class="btn-outline">${vi ? '＋ Thêm' : '＋ Add'}</button>
      </div>
    </div>

    <div class="section-title">${vi ? '📝 Ghi chú & bài học' : '📝 Notes & lessons'}</div>
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
            <span style="font-family:var(--font-mono);color:var(--accent2,#c084fc);white-space:nowrap">${cat.date}</span>
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
function money(v: number | null): string {
  return v == null ? '—' : '$' + (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2));
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
        `<div class="row" style="gap:10px;padding:5px 0;align-items:flex-start"><span style="font-family:var(--font-mono);color:#c084fc;white-space:nowrap">${c.date}</span><span class="note-html" style="flex:1">${sanitizeNoteHtml(c.text)}</span></div>`,
    )
    .join('');
}
/** Escape for safe insertion into text/attribute contexts. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
