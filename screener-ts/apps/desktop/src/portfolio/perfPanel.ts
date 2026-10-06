/**
 * Performance by period — the card on an account and on the overview, and the overview's
 * accounts × periods matrix (CHAT-105: "daily, weekly, monthly, 3 month, 6 month, YTD, 1Y,
 * 3Y, 5Y, SI … if available … really professional, modern").
 *
 * The numbers come from core `periodPerformance` (time-weighted, so a deposit is never a gain);
 * this file only draws them. Each period is a glass tile: the code (1D, YTD…) and its words,
 * the % in gain/loss colour, the money it earned, the yearly rate for periods of a year or more,
 * and a bar whose length is the period's size against the largest move on the card — so the
 * eye reads the shape of the record before it reads a digit. A period the account is too young
 * for is drawn, dimmed, with a dash and the reason on hover, rather than left out: the row keeps
 * its shape and says what is missing.
 */
import type { PerformanceSummary, PeriodKey, PeriodResult } from '@screener/core';
import { getLang } from '../ui/i18n.js';

const WORDS: Record<PeriodKey, { en: string; vi: string }> = {
  '1D': { en: '1 day', vi: '1 ngày' },
  '1W': { en: '1 week', vi: '1 tuần' },
  '1M': { en: '1 month', vi: '1 tháng' },
  '3M': { en: '3 months', vi: '3 tháng' },
  '6M': { en: '6 months', vi: '6 tháng' },
  YTD: { en: 'Year to date', vi: 'Đầu năm' },
  '1Y': { en: '1 year', vi: '1 năm' },
  '3Y': { en: '3 years', vi: '3 năm' },
  '5Y': { en: '5 years', vi: '5 năm' },
  SI: { en: 'Since inception', vi: 'Từ khi mở' },
};

const vi = (): boolean => getLang() === 'vi';
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pctText(v: number, d = 2): string {
  const s = Math.abs(v).toLocaleString(vi() ? 'vi-VN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}%`;
}
const tone = (v: number | null): string => (v === null ? 'none' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

function dateText(d: string | null): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return vi() ? `${day}/${m}/${y}` : `${day}.${m}.${y}`;
}

function tile(p: PeriodResult, max: number, money: (v: number) => string, inception: string | null): string {
  const w = WORDS[p.key][vi() ? 'vi' : 'en'];
  if (p.pct === null) {
    const why = vi() ? `Chưa đủ lịch sử: tài khoản có dữ liệu từ ${dateText(inception)}.` : `Not enough history: data starts ${dateText(inception)}.`;
    return `<div class="pp-tile none" title="${esc(why)}"><div class="pp-h"><b>${p.key}</b><span>${esc(w)}</span></div><div class="pp-v">—</div><div class="pp-m">${vi() ? 'chưa có' : 'n/a'}</div><div class="pp-bar"><i></i></div><div class="pp-a"></div></div>`;
  }
  const t = tone(p.pct);
  const width = max > 0 ? Math.max(4, Math.min(100, (Math.abs(p.pct) / max) * 100)) : 0;
  const from = p.from ? dateText(p.from) : vi() ? 'vốn ban đầu' : 'opening capital';
  const tip = vi() ? `${w}: từ ${from} đến ${dateText(p.to)}` : `${w}: from ${from} to ${dateText(p.to)}`;
  return `<div class="pp-tile ${t}${p.key === 'SI' ? ' si' : ''}${p.key === 'YTD' ? ' ytd' : ''}" title="${esc(tip)}">
      <div class="pp-h"><b>${p.key}</b><span>${esc(w)}</span></div>
      <div class="pp-v">${pctText(p.pct)}</div>
      <div class="pp-m">${p.pnl === null ? '' : `${p.pnl > 0 ? '+' : p.pnl < 0 ? '−' : ''}${money(Math.abs(p.pnl))}`}</div>
      <div class="pp-bar"><i style="width:${width.toFixed(1)}%"></i></div>
      <div class="pp-a">${p.annualizedPct !== null && p.key !== '1Y' ? `≈ ${pctText(p.annualizedPct, 1)} / ${vi() ? 'năm' : 'yr'}` : ''}</div>
    </div>`;
}

/** The card: ten tiles, with what the numbers are and up to when. */
export function perfPanelHtml(s: PerformanceSummary, money: (v: number) => string, title?: string): string {
  const L = (en: string, v: string): string => (vi() ? v : en);
  if (!s.asOf) {
    return `<div class="card pp-card pp-empty">
        <div class="pp-head"><div><b>📈 ${esc(title ?? L('Performance', 'Hiệu suất theo kỳ'))}</b></div></div>
        <div class="muted">${L('No daily snapshots yet — press Update once and the periods fill in from then on.', 'Chưa có dữ liệu theo ngày — bấm Cập nhật một lần, các kỳ sẽ được tính từ đó.')}</div>
      </div>`;
  }
  const max = Math.max(0, ...s.periods.map((p) => Math.abs(p.pct ?? 0)));
  const si = s.periods.find((p) => p.key === 'SI');
  return `<div class="card pp-card">
      <div class="pp-head">
        <div><b>📈 ${esc(title ?? L('Performance', 'Hiệu suất theo kỳ'))}</b>
          <small>${L('Time-weighted: deposits and withdrawals are taken out, so the % is the trading alone. The money is what was earned in the window.',
            'Tính theo TWR: đã loại nạp/rút, nên % chỉ phản ánh giao dịch. Số tiền là phần lãi/lỗ thật trong kỳ.')}</small></div>
        <div class="pp-asof"><span>${L('as of', 'tính đến')}</span><b>${dateText(s.asOf)}</b>${si?.pct !== null && si?.pct !== undefined ? `<span class="pp-si ${tone(si.pct)}">SI ${pctText(si.pct, 1)}</span>` : ''}</div>
      </div>
      <div class="pp-grid">${s.periods.map((p) => tile(p, max, money, s.inception)).join('')}</div>
    </div>`;
}

/**
 * The overview's matrix: one row per account (and the total first), one column per period.
 * Each cell carries its value as `data-sort-value`, so the table's sort works on the numbers
 * and a missing period sorts last.
 */
export function perfMatrixHtml(rows: { id: string; name: string; summary: PerformanceSummary; total?: boolean }[]): string {
  if (!rows.length) return '';
  const keys = rows[0]!.summary.periods.map((p) => p.key);
  const max = Math.max(0, ...rows.flatMap((r) => r.summary.periods.map((p) => Math.abs(p.pct ?? 0))));
  const cell = (p: PeriodResult): string => {
    if (p.pct === null) return `<td class="pm-c none" data-sort-value="">—</td>`;
    const w = max > 0 ? Math.max(6, Math.min(100, (Math.abs(p.pct) / max) * 100)) : 0;
    return `<td class="pm-c ${tone(p.pct)}" data-sort-value="${p.pct}"><span>${pctText(p.pct, 1)}</span><i style="width:${w.toFixed(0)}%"></i></td>`;
  };
  return `<div class="card pm-card" style="overflow-x:auto">
      <table class="pm-table"><thead><tr><th>${vi() ? 'Tài khoản' : 'Account'}</th>${keys.map((k) => `<th class="pm-h" title="${esc(WORDS[k][vi() ? 'vi' : 'en'])}">${k}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.total ? 'pm-total' : ''}"><td>${r.total ? `<b>${esc(r.name)}</b>` : `<a href="#" class="link-ticker" data-acct-open="${esc(r.id)}">${esc(r.name)}</a>`}</td>${r.summary.periods.map(cell).join('')}</tr>`).join('')}</tbody></table>
    </div>`;
}
