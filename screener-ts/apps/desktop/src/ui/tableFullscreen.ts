/**
 * ⛶ Full screen for the big tables — the user's "cac table lon ay, minh nen co nut full screen
 * … de xem cho no duoc ro hon" (CHAT-97).
 *
 * ── ONE MECHANISM, NO PER-TABLE WIRING ───────────────────────────────────────
 * Tables are drawn by a dozen tabs, each rebuilding its HTML on every refresh. Adding a button to
 * each renderer would be a dozen edits that drift apart, and every new table would start without
 * one. So this module watches `#main` and gives every card holding a BIG table (enough columns
 * or rows to be cramped) the button itself, after any render. A table that is re-drawn simply
 * gets it again; a small one (a 3-column legend) never does.
 *
 * ── WHY A WRAPPER ────────────────────────────────────────────────────────────
 * The card is the table's horizontal scroller, so a button placed inside it scrolls away with the
 * columns. The card is wrapped once in `.tbl-fs` (position: relative, no box of its own) and the
 * button sits on the wrapper, on the card's top edge, where it stays put.
 *
 * ── FULL SCREEN IS A CLASS, NOT THE FULLSCREEN API ──────────────────────────
 * `requestFullscreen` hides the app's own bar, is refused inside some embedded views, and on iOS
 * works only for video. A fixed layer over the page does the job everywhere: the card is pinned
 * to the viewport (`.tbl-full`), a blurred backdrop covers the page, Esc / ✕ / the backdrop
 * close it, and the page underneath does not scroll meanwhile.
 */

import { getLang } from './i18n.js';

const MIN_COLS = 6;
const MIN_ROWS = 12;

let active: HTMLElement | null = null;
let backdrop: HTMLDivElement | null = null;
let scheduled = false;
/**
 * The table to put back after a re-render: its position among the page's big tables, and the
 * page it was on. Portfolio redraws itself when prices land, which replaced the card the user had
 * just opened full screen — it closed by itself a second later.
 */
let reopen: { index: number; hash: string } | null = null;

const hosts = (): HTMLElement[] => [...(document.getElementById('main')?.querySelectorAll<HTMLElement>('.tbl-fs') ?? [])];

const vi = (): boolean => getLang() === 'vi';

/** Whether a card's table is big enough to deserve the button. */
function isBig(card: HTMLElement): boolean {
  const table = card.querySelector<HTMLTableElement>('table');
  if (table) {
    const cols = table.tHead?.rows[0]?.cells.length ?? table.rows[0]?.cells.length ?? 0;
    const rows = table.tBodies[0]?.rows.length ?? 0;
    return cols >= MIN_COLS || rows >= MIN_ROWS;
  }
  // The station's grid tables: a head row plus at least one line.
  return !!card.querySelector('.stn-table');
}

function label(full: boolean): string {
  return full ? (vi() ? 'Thu nhỏ (Esc)' : 'Exit full screen (Esc)') : (vi() ? 'Xem toàn màn hình' : 'Full screen');
}

const ICON_OPEN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

function close(keep = false): void {
  if (!keep) reopen = null;
  if (!active) return;
  const host = active.closest<HTMLElement>('.tbl-fs');
  active.classList.remove('tbl-full');
  host?.classList.remove('on');
  const b = host?.querySelector<HTMLButtonElement>(':scope > .tbl-fs-btn');
  if (b) { b.innerHTML = ICON_OPEN; b.title = label(false); b.setAttribute('aria-label', label(false)); }
  active = null;
  document.querySelectorAll('.tbl-fs-anc').forEach((e) => e.classList.remove('tbl-fs-anc'));
  backdrop?.remove();
  backdrop = null;
  document.documentElement.classList.remove('tbl-fs-on');
}

function open(card: HTMLElement, animate = true): void {
  close();
  active = card;
  const host0 = card.closest<HTMLElement>('.tbl-fs');
  reopen = host0 ? { index: hosts().indexOf(host0), hash: location.hash } : null;
  card.classList.toggle('tbl-full-quiet', !animate);
  // A fixed layer is pinned to the viewport only if no ancestor has a transform, a filter or
  // containment — and the page-entrance animation leaves an identity transform on .tab and its
  // children, which made the "full screen" card a fixed box INSIDE its section. Neutralise them
  // while it is open; `close` gives them back.
  for (let e = card.parentElement; e && e !== document.body; e = e.parentElement) e.classList.add('tbl-fs-anc');
  card.classList.add('tbl-full');
  const host = card.closest<HTMLElement>('.tbl-fs');
  host?.classList.add('on');
  const b = host?.querySelector<HTMLButtonElement>(':scope > .tbl-fs-btn');
  if (b) { b.innerHTML = ICON_CLOSE; b.title = label(true); b.setAttribute('aria-label', label(true)); }
  backdrop = document.createElement('div');
  backdrop.className = 'tbl-fs-backdrop';
  backdrop.addEventListener('click', () => close());
  card.parentElement!.insertBefore(backdrop, card);
  document.documentElement.classList.add('tbl-fs-on');
  card.dataset.fsTitle = titleOf(host);
  card.scrollTop = 0;
}

/** The heading the table sits under — shown on top of it full screen, where the page is hidden. */
function titleOf(host: HTMLElement | null): string {
  for (let e = host?.previousElementSibling; e; e = e.previousElementSibling) {
    if (e.classList.contains('tbl-fs')) break;
    const h = e.matches('.sec-head, .section-title') ? e : e.querySelector('.sec-head .section-title, .section-title');
    if (h) return (h.querySelector('.section-title') ?? h).textContent?.trim().replace(/\s+/g, ' ') ?? '';
  }
  return '';
}

function attach(card: HTMLElement): void {
  if (card.closest('.tbl-fs') || card.closest('.dialog, .dialog-host')) return;
  if (!isBig(card)) return;
  const host = document.createElement('div');
  host.className = 'tbl-fs';
  card.parentElement!.insertBefore(host, card);
  host.appendChild(card);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tbl-fs-btn';
  b.innerHTML = ICON_OPEN;
  b.title = label(false);
  b.setAttribute('aria-label', label(false));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (active === card) close(); else open(card);
  });
  host.appendChild(b);
}

function scan(): void {
  scheduled = false;
  const main = document.getElementById('main');
  if (!main) return;
  // A re-render can replace the card that was full screen; do not leave the page locked.
  if (active && !active.isConnected) close(true);
  main.querySelectorAll<HTMLElement>('table, .stn-table').forEach((t) => {
    const card = t.closest<HTMLElement>('.card');
    if (card && main.contains(card)) attach(card);
  });
  if (!active && reopen && reopen.hash === location.hash) {
    const host = hosts()[reopen.index];
    const card = host?.querySelector<HTMLElement>(':scope > .card');
    if (card) open(card, false);
  }
}

export function initTableFullscreen(): void {
  const main = document.getElementById('main');
  if (!main) return;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }).observe(main, { childList: true, subtree: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) { e.stopPropagation(); close(); } }, true);
  // Leaving the page (another tab, the menu) must not leave a table pinned over the next one.
  window.addEventListener('hashchange', () => close());
  scan();
}
