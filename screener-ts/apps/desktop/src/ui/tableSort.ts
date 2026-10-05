/**
 * Click a column head to sort — on EVERY table, the user's "tat ca cac table columns nen co the
 * sort duoc nhe, standardize this also for all tables" (CHAT-98).
 *
 * ── ONE MECHANISM ────────────────────────────────────────────────────────────
 * Like the full-screen button (`tableFullscreen.ts`), this watches the page and upgrades every
 * table it finds, so no renderer has to opt in and a new table sorts on day one. Tables that
 * already sort themselves on their data (Screener, Top Picks, Momentum, QM, the sector table,
 * Financial Status — their heads carry `.sortable` or a `data-…sort` attribute) are left alone:
 * they sort before paging and keep their own state, which a DOM sort would fight.
 *
 * ── HOW A CELL BECOMES A VALUE ───────────────────────────────────────────────
 * `data-sort-value` on a cell wins. Otherwise the text is read: an ISO date sorts as a date;
 * anything that starts with a number (after a currency sign or a +/−) sorts as that number, in
 * either "1,234.5" or "1.234,5" notation; a dash or an empty cell always sorts last, whichever
 * way; everything else sorts as text in the page's language. First click = descending for a
 * number (biggest first is what one looks for), ascending for text; the second click flips.
 *
 * ── ROWS THAT BELONG TOGETHER ────────────────────────────────────────────────
 * A row made of one cell spanning the table (an opened detail, a chart under a row) travels
 * with the row above it. The order survives a re-render: it is remembered per page and table
 * and applied again when the table is rebuilt (Portfolio redraws when prices land).
 */
import { getLang } from './i18n.js';

type Dir = 1 | -1;
interface SortState { col: number; dir: Dir }

const remembered = new Map<string, SortState>();
let scheduled = false;

const DASH = /^[—–\-−]*$/;

/** A sortable value: a number, an ISO date string, a text, or null (missing — always last). */
function valueOf(cell: Element | undefined): number | string | null {
  if (!cell) return null;
  // A cell holding a field (an editable reading) is read from the field.
  const field = (cell as HTMLElement).querySelector?.<HTMLInputElement | HTMLSelectElement>('input:not([type=checkbox]), select');
  const raw = (cell as HTMLElement).dataset?.sortValue ?? (field ? field.value : cell.textContent ?? '');
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t || DASH.test(t)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  // A leading number, after an optional currency sign; "€-5,960.00 (−99%)" → -5960.
  const m = t.replace(/[−–]/g, '-').match(/^[^\d+\-.,]{0,3}\s*([+-]?)\s*[€$£¥₫]?\s*([+-]?)(\d[\d.,\s']*)/);
  if (m) {
    const sign = m[1] === '-' || m[2] === '-' ? -1 : 1;
    let n = m[3]!.replace(/[\s']/g, '');
    const lastDot = n.lastIndexOf('.'), lastComma = n.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      n = lastComma > lastDot ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
    } else if (lastComma >= 0) {
      // "1,234" (thousands) vs "13,6" (decimal): groups of exactly three after every comma = thousands.
      n = /^\d{1,3}(,\d{3})+$/.test(n) ? n.replace(/,/g, '') : n.replace(',', '.');
    } else if ((n.match(/\./g) ?? []).length > 1) {
      n = n.replace(/\./g, '');                                  // "3.337.740" thousands
    }
    const v = Number.parseFloat(n);
    if (Number.isFinite(v)) {
      // a suffix that scales: 1.2M, 3.5B, 12K
      const suf = t.slice(m[0].length).trim().charAt(0).toUpperCase();
      const k = suf === 'K' ? 1e3 : suf === 'M' ? 1e6 : suf === 'B' ? 1e9 : suf === 'T' ? 1e12 : 1;
      return sign * v * k;
    }
  }
  return t.toLocaleLowerCase();
}

function compare(a: number | string | null, b: number | string | null, dir: Dir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;                                    // missing last, both directions
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
  if (typeof a === 'number') return -1;                       // numbers before words
  if (typeof b === 'number') return 1;
  return a.localeCompare(b, getLang() === 'vi' ? 'vi' : 'en', { numeric: true }) * dir;
}

// ── <table> ───────────────────────────────────────────────────────────────────

/** The cell under logical column `col`, counting colspans. */
function cellAt(row: HTMLTableRowElement, col: number): HTMLTableCellElement | undefined {
  let x = 0;
  for (const c of Array.from(row.cells)) {
    if (col < x + c.colSpan) return c.colSpan > 1 && x !== col ? undefined : c;
    x += c.colSpan;
  }
  return undefined;
}

function ownSorted(table: HTMLTableElement): boolean {
  return !!table.querySelector('th.sortable:not(.th-auto), th[data-sort], th[data-vsort], th[data-w-sort], th[data-sec-sort]')
    || [...table.querySelectorAll('th')].some((th) => [...th.attributes].some((a) => /^data-.*sort/.test(a.name) && a.name !== 'data-sort-value'));
}

function sortTable(table: HTMLTableElement, col: number, dir: Dir): void {
  const body = table.tBodies[0];
  if (!body) return;
  const width = table.tHead?.rows[0] ? [...table.tHead.rows[0].cells].reduce((s, c) => s + c.colSpan, 0) : 0;
  // Group a full-width single-cell row (a detail, an empty-state line) with the row above it.
  const groups: HTMLTableRowElement[][] = [];
  for (const r of Array.from(body.rows)) {
    const lone = r.cells.length === 1 && r.cells[0]!.colSpan > 1 && r.cells[0]!.colSpan >= width - 1;
    if (lone && groups.length) groups[groups.length - 1]!.push(r);
    else groups.push([r]);
  }
  // An "add a row" line or a totals line stays at the bottom, in its own order.
  const pinned = (r: HTMLTableRowElement): boolean => /(^|[-_\s])(add|new|total|sum|foot)/i.test(r.className);
  const keyed = groups.filter((g) => !pinned(g[0]!)).map((g, i) => ({ g, i, v: valueOf(cellAt(g[0]!, col)) }));
  keyed.sort((a, b) => compare(a.v, b.v, dir) || a.i - b.i);
  const frag = document.createDocumentFragment();
  for (const k of keyed) for (const r of k.g) frag.appendChild(r);
  for (const g of groups) if (pinned(g[0]!)) for (const r of g) frag.appendChild(r);
  body.appendChild(frag);
}

function paintHeads(heads: HTMLElement[], st: SortState | undefined): void {
  heads.forEach((th, i) => {
    const on = !!st && st.col === Number(th.dataset.autoCol ?? i);
    th.classList.toggle('sorted', on);
    th.dataset.adir = on ? (st!.dir === 1 ? 'asc' : 'desc') : '';
    th.setAttribute('aria-sort', on ? (st!.dir === 1 ? 'ascending' : 'descending') : 'none');
  });
}

function keyOf(el: Element, idx: number): string {
  const sig = [...el.querySelectorAll('th, .stn-row-h > span')].map((h) => h.textContent?.trim().slice(0, 12)).join('|');
  return `${location.hash}#${idx}#${sig}`;
}

function firstDir(sample: number | string | null): Dir {
  return typeof sample === 'number' ? -1 : 1;
}

function upgradeTable(table: HTMLTableElement, idx: number): void {
  const headRow = table.tHead?.rows[0];
  if (!headRow || !table.tBodies[0] || ownSorted(table)) return;
  const key = keyOf(table, idx);
  const heads: HTMLElement[] = [];
  let x = 0;
  for (const th of Array.from(headRow.cells)) {
    const col = x;
    x += th.colSpan;
    if (!th.textContent?.trim() || th.colSpan > 1) continue;     // the actions column, a group head
    if (!th.classList.contains('th-auto')) {
      th.classList.add('sortable', 'th-auto');
      th.dataset.autoCol = String(col);
      th.tabIndex = 0;
      const go = (): void => {
        const cur = remembered.get(key);
        const sample = valueOf(Array.from(table.tBodies[0]?.rows ?? []).map((r) => cellAt(r, col)).find((c) => valueOf(c) !== null));
        const dir: Dir = cur && cur.col === col ? (cur.dir === 1 ? -1 : 1) : firstDir(sample);
        remembered.set(key, { col, dir });
        sortTable(table, col, dir);
        if (table.tBodies[0]) table.tBodies[0].dataset.autoSorted = `${col}:${dir}`;
        paintHeads(heads, remembered.get(key));
      };
      th.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button, a, input, select')) go(); });
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
    heads.push(th);
  }
  // A rebuilt table: put the remembered order back, once per build.
  // Marked on the tbody, which is what a renderer replaces when it refills the same table.
  const st = remembered.get(key);
  const body = table.tBodies[0]!;
  if (st && body.dataset.autoSorted !== `${st.col}:${st.dir}`) {
    sortTable(table, st.col, st.dir);
    body.dataset.autoSorted = `${st.col}:${st.dir}`;
  }
  paintHeads(heads, st);
}

// ── the station's grid tables (.stn-table: a head row of spans, rows of spans) ─────

function upgradeGrid(grid: HTMLElement, idx: number): void {
  const head = grid.querySelector<HTMLElement>(':scope > .stn-row-h');
  if (!head) return;
  const key = keyOf(grid, idx);
  const heads = [...head.children] as HTMLElement[];
  const rows = (): HTMLElement[] => [...grid.querySelectorAll<HTMLElement>(':scope > .stn-row:not(.stn-row-h)')];
  const sort = (col: number, dir: Dir): void => {
    const keyed = rows().map((r, i) => ({ r, i, v: valueOf(r.children[col]) }));
    keyed.sort((a, b) => compare(a.v, b.v, dir) || a.i - b.i);
    for (const k of keyed) grid.appendChild(k.r);
  };
  heads.forEach((h, col) => {
    if (!h.textContent?.trim() || h.classList.contains('th-auto')) return;
    h.classList.add('th-auto', 'grid-sort');
    h.dataset.autoCol = String(col);
    h.tabIndex = 0;
    const go = (): void => {
      const cur = remembered.get(key);
      const sample = rows().map((r) => valueOf(r.children[col])).find((v) => v !== null) ?? null;
      const dir: Dir = cur && cur.col === col ? (cur.dir === 1 ? -1 : 1) : firstDir(sample);
      remembered.set(key, { col, dir });
      sort(col, dir);
      grid.dataset.autoSorted = `${col}:${dir}`;
      paintHeads(heads, remembered.get(key));
    };
    h.addEventListener('click', go);
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  const st = remembered.get(key);
  if (st && grid.dataset.autoSorted !== `${st.col}:${st.dir}`) { sort(st.col, st.dir); grid.dataset.autoSorted = `${st.col}:${st.dir}`; }
  paintHeads(heads, st);
}

function scan(): void {
  scheduled = false;
  document.querySelectorAll<HTMLTableElement>('#main table, .modal table').forEach((t, i) => upgradeTable(t, i));
  document.querySelectorAll<HTMLElement>('#main .stn-table').forEach((g, i) => upgradeGrid(g, i));
}

export function initTableSort(): void {
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
}

/** Exposed for tests: how a cell's text is read. */
export const _valueOf = (text: string): number | string | null => valueOf({ textContent: text } as Element);
