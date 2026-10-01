/**
 * Table of contents and folding for long reading pages (the Learn tab).
 *
 * The Learn tab is ~30 sections tall — the 16-part swing playbook, the platform
 * guides, the glossary groups — so "scroll back to the section I was in" was the
 * one thing it couldn't do. This gives it two ways to find your place:
 *
 *   - WIDE SCREENS (≥1100px): a contents column beside the text, the same shape as
 *     Settings & Guides. Parts are headings, chapters are links, and a chapter's
 *     sections unfold under it while you are inside it — sixteen playbook sections
 *     listed all the time would bury the rest of the book.
 *   - NARROW SCREENS: a bar that sticks under the top nav and shows where you are,
 *     with a panel listing every section. A side column does not fit a phone.
 *
 * Both carry what a physical book gives you for free: how far in you are (a hairline
 * progress line) and a BOOKMARK — the section you were last reading, remembered per
 * device (`localStorage`, not synced: where the laptop was left is not where the
 * phone was left) and offered back as one button.
 *
 * FOLDING. Every chapter and every playbook section can be folded to its heading, and
 * there is "open all / fold all" in both the column and the panel. The state goes
 * through `ui/collapse.ts` (`learn:<id>`), so it survives a re-render and a reload.
 * It is applied as a class in the same synchronous pass that built the page — the
 * browser never paints the unfolded version first, which is the flinch collapse.ts
 * exists to prevent. A jump (contents, the cover's part list, the playbook's chips)
 * unfolds its target before scrolling, or the link would land on a closed heading.
 *
 * The entries are DISCOVERED from the DOM (`.lb-part`, `h2`, `.swp-sec`), not
 * hand-listed: the tab is re-rendered on every language switch and its sections
 * change as the page grows; a hard-coded list would silently rot.
 *
 * Mounting twice is safe: the previous instance is disposed first (its window
 * listeners are removed), which matters because `renderLearn()` runs again on every
 * language/theme change.
 */

import { isCollapsed, setCollapsed } from './collapse.js';

/** Part → chapter → section. `0` is a part divider, `2` a playbook section. */
export type TocLevel = 0 | 1 | 2;

export interface TocEntry {
  id: string;
  label: string;
  level: TocLevel;
  el: HTMLElement;
  /** The block that folds, and its always-visible heading. Absent for parts. */
  fold?: { unit: HTMLElement; head: HTMLElement };
  /** For a section: the chapter it sits in. */
  parent?: string;
}

/** The line at which a section counts as "current": the 56px top nav, plus the sticky
 * bar on a narrow screen, plus breathing room. The same values are the targets'
 * `scroll-margin-top` in styles.css (`.lt-anchor`). */
const OFFSET_BAR = 116;
const OFFSET_RAIL = 84;

/** Where the reader stopped. One key for the whole tab — see the header. */
const MARK_KEY = 'learn:bookmark';

let dispose: (() => void) | null = null;
let entriesNow: TocEntry[] = [];

function labelOf(h: HTMLElement, lang: 'en' | 'vi'): string {
  // The playbook hero's <h2> is a two-line sentence with markup in it — far too
  // long for a TOC row, so it gets a short name of its own.
  if (h.classList.contains('swp-title')) return lang === 'vi' ? '📘 Cẩm nang swing trading' : '📘 Swing-trading playbook';
  const raw = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
  return raw.length > 64 ? `${raw.slice(0, 63).replace(/\s+\S*$/, '')}…` : raw;
}

/** Walk the rendered page and collect its sections, in document order. */
function collect(root: HTMLElement, lang: 'en' | 'vi'): TocEntry[] {
  const out: TocEntry[] = [];
  let i = 0;
  let chapter: string | undefined;
  for (const node of Array.from(
    root.querySelectorAll<HTMLElement>('.lb-part, h2, .swp-sec'),
  )) {
    // A part divider contains its own `<h2>`; without this the part would be
    // listed twice, once as itself and once as that heading.
    if (node.closest('.lb-part') && !node.classList.contains('lb-part')) continue;
    const level: TocLevel = node.classList.contains('lb-part')
      ? 0
      : node.classList.contains('swp-sec')
        ? 2
        : 1;
    // A `.lb-part`'s name is its title; a `.swp-sec` is a wrapper whose title
    // lives in `.swp-h`.
    const label =
      level === 0
        ? (node.querySelector<HTMLElement>('.lb-part-title')?.textContent ?? '').trim()
        : level === 2
          ? (node.querySelector<HTMLElement>('.swp-h')?.textContent ?? '').replace(/\s+/g, ' ').trim()
          : labelOf(node, lang);
    if (!label) continue;
    // Anchor to the section wrapper (so the heading isn't flush against the bar)
    // and keep ids that already exist — the playbook's own chips point at them.
    if (!node.id) node.id = `learn-toc-${++i}`;
    node.classList.add('lt-anchor');
    const e: TocEntry = { id: node.id, label, level, el: node };
    if (level === 1) chapter = node.id;
    if (level === 0) chapter = undefined;
    if (level === 2) e.parent = chapter;
    e.fold = foldOf(node, level);
    out.push(e);
  }
  return out;
}

/**
 * What folds for an entry. A playbook section folds to its numbered head. A chapter's
 * `<h2>` folds the card it heads — but only when it is that card's direct child, since
 * folding hides "everything but the head" and a nested head would hide itself. The
 * playbook's own hero title folds nothing: the playbook is folded section by section.
 */
function foldOf(node: HTMLElement, level: TocLevel): TocEntry['fold'] {
  if (level === 2) {
    const head = node.querySelector<HTMLElement>(':scope > .swp-head');
    return head ? { unit: node, head } : undefined;
  }
  if (level === 1 && !node.classList.contains('swp-title')) {
    const unit = node.parentElement;
    if (unit && !unit.classList.contains('lb-wrap') && !unit.classList.contains('lr-body')) return { unit, head: node };
  }
  return undefined;
}

const foldKey = (e: TocEntry): string => `learn:${e.id}`;

function setFolded(e: TocEntry, folded: boolean, remember = true): void {
  if (!e.fold) return;
  e.fold.unit.classList.toggle('lr-folded', folded);
  e.fold.head.setAttribute('aria-expanded', folded ? 'false' : 'true');
  if (remember) setCollapsed(foldKey(e), folded);
}

/** Unfold the target (and the chapter around it) and scroll there. */
function reveal(doc: Document, id: string): void {
  const target = doc.getElementById(id);
  if (!target) return;
  for (const e of entriesNow) {
    if (e.fold?.unit.classList.contains('lr-folded') && (e.fold.unit === target || e.fold.unit.contains(target) || e.el === target)) {
      setFolded(e, false);
    }
  }
  syncFoldMarks?.();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let syncFoldMarks: (() => void) | null = null;

/** For other modules (the search palette): open Learn's section `id` and go there. */
export function jumpToLearn(id: string): void {
  reveal(document, id);
}

const ICON_LIST = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="11" y2="8"/><line x1="2" y1="12" x2="8" y2="12"/></svg>`;

/**
 * Lay the page out (column + body), build the bar and the column, make the sections
 * foldable and wire everything. No-op when fewer than three sections were found.
 */
export function mountStickyToc(root: HTMLElement, lang: 'en' | 'vi'): void {
  dispose?.();
  dispose = null;

  const entries = collect(root, lang);
  entriesNow = entries;
  if (entries.length < 3) return;

  const vi = lang === 'vi';
  const L = (en: string, v: string): string => (vi ? v : en);
  const doc = root.ownerDocument;

  // -- folds ----------------------------------------------------------------
  for (const e of entries) {
    if (!e.fold) continue;
    e.fold.unit.classList.add('lr-fold');
    e.fold.head.classList.add('lr-fold-head');
    e.fold.head.setAttribute('role', 'button');
    e.fold.head.tabIndex = 0;
    e.fold.head.title = L('Click to fold or unfold', 'Bấm để thu gọn hoặc mở');
    e.fold.head.insertAdjacentHTML('beforeend', `<span class="lr-caret" aria-hidden="true">▾</span>`);
    setFolded(e, isCollapsed(foldKey(e)), false);
  }

  // -- layout: everything after the cover goes into the body column ----------
  const cover = root.querySelector<HTMLElement>(':scope > .lb-cover');
  const layout = doc.createElement('div');
  layout.className = 'lr-layout';
  const rail = doc.createElement('nav');
  rail.className = 'lr-rail';
  rail.setAttribute('aria-label', L('Contents', 'Mục lục'));
  const body = doc.createElement('div');
  body.className = 'lr-body';
  const rest = Array.from(root.children).filter((c) => c !== cover);
  rest.forEach((c) => body.appendChild(c));
  layout.append(rail, body);
  root.appendChild(layout);

  const tools = `<div class="lr-tools">
      <button type="button" data-lr-all="open">${L('Open all', 'Mở tất cả')}</button>
      <button type="button" data-lr-all="shut">${L('Fold all', 'Thu gọn tất cả')}</button>
    </div>`;

  // -- the narrow-screen bar --------------------------------------------------
  const bar = doc.createElement('div');
  bar.className = 'lt-toc';
  bar.innerHTML = `
    <button type="button" class="lt-toc-open" aria-expanded="false" aria-label="${L('Table of contents', 'Mục lục')}">
      ${ICON_LIST}<span>${L('Contents', 'Mục lục')}</span>
    </button>
    <span class="lt-toc-now"></span>
    <button type="button" class="lt-toc-mark" data-lr-mark hidden></button>
    <button type="button" class="lt-toc-up" data-lr-up title="${L('Back to top', 'Lên đầu trang')}">↑</button>
    <div class="lt-toc-progress"><i></i></div>
    <div class="lt-toc-panel" hidden>
      ${tools}
      <div class="lt-toc-list">${entries
        .map((e) => `<button type="button" class="lt-toc-item lv${e.level}" data-toc="${e.id}">${e.label}</button>`)
        .join('')}</div>
    </div>`;
  body.prepend(bar);

  // -- the wide-screen column -------------------------------------------------
  const kids = (id: string): number => entries.filter((e) => e.parent === id).length;
  rail.innerHTML = `
    <div class="lr-rail-top">
      <span class="lr-rail-title">${ICON_LIST}${L('Contents', 'Mục lục')}</span>
      <span class="lr-rail-pct">0%</span>
    </div>
    <div class="lr-rail-progress"><i></i></div>
    <button type="button" class="lr-rail-mark" data-lr-mark hidden></button>
    <div class="lr-rail-list">${entries
      .map((e) => {
        const n = e.level === 1 ? kids(e.id) : 0;
        return `<button type="button" class="lr-item lv${e.level}" data-toc="${e.id}"${e.parent ? ` data-parent="${e.parent}"` : ''}>
          <span class="lr-item-t">${e.label}</span>${n ? `<span class="lr-item-n">${n}</span>` : ''}</button>`;
      })
      .join('')}</div>
    <div class="lr-rail-foot">
      ${tools}
      <button type="button" class="lr-up" data-lr-up>↑ ${L('Back to top', 'Lên đầu trang')}</button>
    </div>`;

  const openBtn = bar.querySelector<HTMLButtonElement>('.lt-toc-open')!;
  const nowEl = bar.querySelector<HTMLElement>('.lt-toc-now')!;
  const markBtns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-lr-mark]'));
  const progress = [bar.querySelector<HTMLElement>('.lt-toc-progress > i')!, rail.querySelector<HTMLElement>('.lr-rail-progress > i')!];
  const pctEl = rail.querySelector<HTMLElement>('.lr-rail-pct')!;
  const panel = bar.querySelector<HTMLElement>('.lt-toc-panel')!;
  const barItems = Array.from(bar.querySelectorAll<HTMLButtonElement>('.lt-toc-item'));
  const railList = rail.querySelector<HTMLElement>('.lr-rail-list')!;
  const railItems = Array.from(rail.querySelectorAll<HTMLButtonElement>('.lr-item'));

  syncFoldMarks = () => {
    entries.forEach((e, i) => {
      const folded = !!e.fold?.unit.classList.contains('lr-folded');
      railItems[i]?.classList.toggle('is-folded', folded);
      barItems[i]?.classList.toggle('is-folded', folded);
    });
  };
  syncFoldMarks();

  const setOpen = (on: boolean): void => {
    panel.hidden = !on;
    bar.classList.toggle('open', on);
    openBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) panel.querySelector<HTMLElement>('.lt-toc-item.active')?.scrollIntoView({ block: 'nearest' });
  };
  const goTo = (id: string): void => {
    setOpen(false);
    reveal(doc, id);
  };

  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  root.querySelectorAll<HTMLButtonElement>('[data-lr-up]').forEach((b) =>
    b.addEventListener('click', () => {
      setOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }),
  );
  [...barItems, ...railItems].forEach((it) => it.addEventListener('click', () => goTo(it.dataset.toc!)));
  root.querySelectorAll<HTMLButtonElement>('[data-lr-all]').forEach((b) =>
    b.addEventListener('click', () => {
      const shut = b.dataset.lrAll === 'shut';
      entries.forEach((e) => setFolded(e, shut));
      syncFoldMarks?.();
      setOpen(false);
      onScroll();
    }),
  );

  // A fold's heading is its handle. Clicks on a link or a button inside a heading
  // keep doing their own thing.
  for (const e of entries) {
    const head = e.fold?.head;
    if (!head) continue;
    const toggle = (): void => {
      setFolded(e, !e.fold!.unit.classList.contains('lr-folded'));
      syncFoldMarks?.();
      onScroll();
    };
    head.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('a, button, input')) return;
      toggle();
    });
    head.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        toggle();
      }
    });
  }

  // The cover's part list and the playbook's chips scroll on their own; unfold their
  // target first. Capture phase, so it runs before their own scroll.
  const onJumpLink = (ev: Event): void => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-lb-goto], [data-swp-goto]');
    const id = b?.dataset.lbGoto ?? b?.dataset.swpGoto;
    if (!id) return;
    const target = doc.getElementById(id);
    for (const e of entries) {
      if (e.fold && target && (e.fold.unit === target || e.el === target)) setFolded(e, false);
    }
    syncFoldMarks?.();
  };
  root.addEventListener('click', onJumpLink, true);

  // -- the bookmark ---------------------------------------------------------
  // Offered, never forced: one button that disappears once used or once the reader
  // has got there on their own. Restoring the scroll position silently would be
  // worse — the page would open somewhere the reader did not ask for.
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(MARK_KEY);
  } catch {
    // Private mode / storage disabled. A book with no bookmark still reads.
  }
  const savedEntry = saved ? entries.find((e) => e.id === saved) : undefined;
  const hideMarks = (): void => markBtns.forEach((m) => (m.hidden = true));
  if (savedEntry && savedEntry !== entries[0]) {
    for (const m of markBtns) {
      m.hidden = false;
      m.textContent = `↩ ${savedEntry.label}`;
      m.title = L('Pick up where you left off', 'Đọc tiếp từ chỗ đã dừng');
      m.addEventListener('click', () => {
        hideMarks();
        goTo(savedEntry.id);
      });
    }
  }

  // -- current section ------------------------------------------------------
  /** Keep the active row visible inside the column without scrolling the window. */
  const keepInView = (it: HTMLElement): void => {
    const top = it.offsetTop;
    const bottom = top + it.offsetHeight;
    if (top < railList.scrollTop + 8) railList.scrollTop = Math.max(0, top - 24);
    else if (bottom > railList.scrollTop + railList.clientHeight - 8) railList.scrollTop = bottom - railList.clientHeight + 24;
  };

  let idx = -1;
  let readerMoved = false;
  const paint = (): void => {
    // The tab may be hidden (display:none) — every rect is 0 then, which would park
    // the marker on the last section. Skip instead.
    if (!root.offsetParent) return;
    const offset = bar.offsetParent ? OFFSET_BAR : OFFSET_RAIL;

    // How far through the page, measured against the reading area rather than the
    // document: the nav above and the footer below are not part of the book.
    const box = body.getBoundingClientRect();
    const span = box.height - window.innerHeight + offset;
    const read = Math.min(1, Math.max(0, span > 0 ? (offset - box.top) / span : 1));
    progress.forEach((p) => (p.style.transform = `scaleX(${read.toFixed(4)})`));
    pctEl.textContent = `${Math.round(read * 100)}%`;

    let next = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]!.el.getBoundingClientRect().top - offset <= 0) next = i;
      else break;
    }
    if (next === idx) return;
    idx = next;
    const cur = entries[idx]!;
    nowEl.textContent = cur.label;
    barItems.forEach((it, i) => it.classList.toggle('active', i === idx));
    railItems.forEach((it, i) => it.classList.toggle('active', i === idx));
    // A chapter's sections are listed while you are in that chapter, and only then.
    const chapter = cur.level === 2 ? cur.parent : cur.id;
    railItems.forEach((it) => {
      if (it.dataset.parent) it.classList.toggle('near', it.dataset.parent === chapter);
    });
    railItems.forEach((it) => it.classList.toggle('in', !!chapter && it.dataset.toc === chapter && idx !== entries.findIndex((e) => e.id === chapter)));
    if (railItems[idx] && rail.offsetParent) keepInView(railItems[idx]!);
    if (!panel.hidden) barItems[idx]?.scrollIntoView({ block: 'nearest' });
    // Drop the offer as soon as the reader is past it under their own steam.
    if (cur === savedEntry) hideMarks();
    // Only once the reader has moved. The first paint happens at the top of the page
    // on every render — recording that would overwrite the bookmark with "the
    // beginning" for anyone who merely opened the tab.
    if (!readerMoved) return;
    try {
      localStorage.setItem(MARK_KEY, cur.id);
    } catch {
      // Out of room: the bookmark is the least important thing on the page.
    }
  };

  let raf = 0;
  function onScroll(): void {
    if (!bar.isConnected) {
      dispose?.();
      return;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  }
  const onUserScroll = (): void => {
    readerMoved = true;
    onScroll();
  };
  const onDocClick = (e: Event): void => {
    if (!panel.hidden && !bar.contains(e.target as Node)) setOpen(false);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  };

  window.addEventListener('scroll', onUserScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  doc.addEventListener('click', onDocClick);
  doc.addEventListener('keydown', onKey);
  nowEl.textContent = entries[0]!.label;
  barItems[0]?.classList.add('active');
  railItems[0]?.classList.add('active');
  paint();

  dispose = () => {
    window.removeEventListener('scroll', onUserScroll);
    window.removeEventListener('resize', onScroll);
    doc.removeEventListener('click', onDocClick);
    doc.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onJumpLink, true);
    if (raf) cancelAnimationFrame(raf);
    syncFoldMarks = null;
    dispose = null;
  };
}
