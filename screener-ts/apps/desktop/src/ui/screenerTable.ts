import type { QmSetupType, MomentumClassification } from '@screener/core';
import { num, fmtPrice, scoreColor } from './dom.js';
import { setupBadge, classBadge, SETUP_RANK, CLASS_RANK } from './badges.js';

/**
 * Combined QM + Momentum row for the Custom Screener. One row per scanned symbol,
 * carrying both the Qullamaggie setup/quality fields and the momentum metrics so
 * the screener can filter and sort on either dimension.
 */
export interface ScreenerRow {
  symbol: string;
  price: number;
  qualityScore: number;
  setupType: QmSetupType;
  trendPassed: boolean;
  pivot: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  riskPct: number | null;
  momentumScore: number;
  classification: MomentumClassification;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  relativeStrength: number;
  distanceFrom52wHighPct: number;
  atrPct: number;
  /** Recent-vs-baseline volume ratio from detectVolumeSurge (0 = not computed). */
  volRatio?: number;
  /** Sector 3m-vs-6m volume change %, for industry comparison. */
  sectorVolChangePct?: number | null;
}

export type ScreenerSortKey =
  | 'symbol' | 'qualityScore' | 'setupType' | 'momentumScore' | 'classification'
  | 'return1m' | 'return3m' | 'return6m' | 'relativeStrength'
  | 'pivot' | 'entryPrice' | 'riskPct' | 'distanceFrom52wHighPct' | 'volRatio';

interface Column {
  key: ScreenerSortKey;
  label: string;
  defaultDesc: boolean;
}

const COLUMNS: Column[] = [
  { key: 'symbol', label: 'Symbol', defaultDesc: false },
  { key: 'qualityScore', label: 'Quality', defaultDesc: true },
  { key: 'setupType', label: 'Setup', defaultDesc: true },
  { key: 'momentumScore', label: 'Momentum', defaultDesc: true },
  { key: 'classification', label: 'Class', defaultDesc: true },
  { key: 'return1m', label: '1M', defaultDesc: true },
  { key: 'return3m', label: '3M', defaultDesc: true },
  { key: 'return6m', label: '6M', defaultDesc: true },
  { key: 'relativeStrength', label: 'RS', defaultDesc: true },
  { key: 'volRatio', label: 'Vol×', defaultDesc: true },
  { key: 'pivot', label: 'Pivot', defaultDesc: true },
  { key: 'entryPrice', label: 'Entry', defaultDesc: true },
  { key: 'riskPct', label: 'Risk %', defaultDesc: false },
];

function cellValue(r: ScreenerRow, key: ScreenerSortKey): number | string | null {
  if (key === 'symbol') return r.symbol;
  if (key === 'setupType') return SETUP_RANK[r.setupType] ?? 0;
  if (key === 'classification') return CLASS_RANK[r.classification] ?? 0;
  return (r[key] as number | null) ?? null;
}

function compare(a: ScreenerRow, b: ScreenerRow, key: ScreenerSortKey, desc: boolean): number {
  const av = cellValue(a, key);
  const bv = cellValue(b, key);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  let c: number;
  if (typeof av === 'string' || typeof bv === 'string') c = String(av).localeCompare(String(bv));
  else c = (av as number) - (bv as number);
  return desc ? -c : c;
}

export interface ScreenerTableOptions {
  sortKey?: ScreenerSortKey;
  sortDesc?: boolean;
  onRowClick: (sym: string) => void;
  onSortChange?: (key: ScreenerSortKey, desc: boolean) => void;
}

/** Combined QM + Momentum results table for the Custom Screener. */
export function screenerTable(rows: ScreenerRow[], options: ScreenerTableOptions): HTMLElement {
  let sortKey: ScreenerSortKey = options.sortKey ?? 'qualityScore';
  let sortDesc = options.sortDesc ?? true;

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.overflowX = 'auto';

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No matches.</div>`;
    return wrap;
  }

  const retCell = (v: number | null): string => {
    if (v == null) return '—';
    const color = v >= 0 ? 'var(--accent)' : 'var(--danger)';
    return `<span style="color:${color}">${num(v, 1)}%</span>`;
  };

  const render = () => {
    const sorted = [...rows].sort((a, b) => compare(a, b, sortKey, sortDesc));
    const arrow = (k: ScreenerSortKey) => (k === sortKey ? (sortDesc ? ' ▾' : ' ▴') : '');
    const head = COLUMNS.map(
      (c) =>
        `<th class="sortable ${c.key === sortKey ? 'sorted' : ''}" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`,
    ).join('');

    const volCell = (r: ScreenerRow): string => {
      if (!r.volRatio) return '—';
      const color = r.volRatio >= 3 ? 'var(--accent)' : r.volRatio >= 2 ? 'var(--warn)' : 'inherit';
      const secPart = r.sectorVolChangePct != null
        ? ` <span class="muted" style="font-size:10px">(sec ${r.sectorVolChangePct >= 0 ? '+' : ''}${r.sectorVolChangePct.toFixed(1)}%)</span>`
        : '';
      return `<span style="color:${color};font-weight:700">${r.volRatio.toFixed(2)}×</span>${secPart}`;
    };

    const body = sorted
      .map(
        (r) => `<tr data-sym="${r.symbol}">
        <td><strong>${r.symbol}</strong></td>
        <td><span class="scorebar"><span style="width:${Math.max(0, r.qualityScore)}%;background:${scoreColor(r.qualityScore)}"></span></span> <span style="color:${scoreColor(r.qualityScore)};font-weight:700">${num(r.qualityScore, 0)}</span></td>
        <td>${setupBadge(r.setupType)}</td>
        <td>${num(r.momentumScore, 0)}</td>
        <td>${classBadge(r.classification)}</td>
        <td>${retCell(r.return1m)}</td>
        <td>${retCell(r.return3m)}</td>
        <td>${retCell(r.return6m)}</td>
        <td>${num(r.relativeStrength, 1)}</td>
        <td>${volCell(r)}</td>
        <td>${fmtPrice(r.pivot, r.symbol)}</td>
        <td>${fmtPrice(r.entryPrice, r.symbol)}</td>
        <td>${r.riskPct != null ? num(r.riskPct, 1) + '%' : '—'}</td>
      </tr>`,
      )
      .join('');

    wrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

    wrap.querySelectorAll<HTMLElement>('th.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.sort as ScreenerSortKey;
        if (key === sortKey) {
          sortDesc = !sortDesc;
        } else {
          sortKey = key;
          sortDesc = COLUMNS.find((c) => c.key === key)!.defaultDesc;
        }
        options.onSortChange?.(sortKey, sortDesc);
        render();
      }),
    );
    wrap.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) =>
      tr.addEventListener('click', () => options.onRowClick(tr.dataset.sym!)),
    );
  };

  render();
  return wrap;
}
