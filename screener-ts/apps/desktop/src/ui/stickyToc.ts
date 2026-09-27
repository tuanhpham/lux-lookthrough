/**
 * Sticky table of contents for long reading pages (the Learn tab).
 *
 * The Learn tab is ~25 sections tall — the 16-part swing playbook, the platform
 * guides, the glossary groups — so "scroll back to the section I was in" was the
 * one thing it couldn't do. This mounts a bar that sticks under the top nav and
 * always shows WHERE YOU ARE, with a panel that lists every section to jump to.
 *
 * Since the tab became a book (`ui/book.ts`) the bar carries the two other things
 * a physical book gives you for free:
 *   - HOW FAR IN YOU ARE: a hairline progress line across the bottom of the bar.
 *   - A BOOKMARK: the section you were last reading is remembered per device, and
 *     offered back as one button the next time the tab opens. Device-local
 *     (`localStorage`, not synced) — where the laptop was left is not where the
 *     phone was left, and a synced bookmark would fight between them.
 *
 * Three deliberate choices:
 *  - The entries are DISCOVERED from the DOM (`.lb-part`, `h2`, `.swp-sec`), not
 *    hand-listed. The Learn tab is re-rendered from scratch on every language
 *    switch and its sections change as the page grows; a hard-coded list would
 *    silently rot.
 *  - Three levels, because the book has three: part, chapter, section.
 *  - It is a bar + panel, not a side rail. `#main` is a single centred column with
 *    no gutter to put a rail in, and a 25-item horizontal chip row is unusable on
 *    a phone. The bar costs ~38px of height and works identically on both.
 *
 * Mounting twice is safe: the previous instance is disposed first (its window
 * listeners are removed), which matters because `renderLearn()` runs again on
 * every language/theme change.
 */

/** Part → chapter → section. `0` is a part divider, `2` a playbook section. */
export type TocLevel = 0 | 1 | 2;

export interface TocEntry {
  id: string;
  label: string;
  level: TocLevel;
  el: HTMLElement;
}

/** Height of the fixed top nav (56px) + the sticky bar itself + breathing room.
 * Used both as `scroll-margin-top` on the targets and as the line at which a
 * section counts as "current". */
const OFFSET = 116;

/** Where the reader stopped. One key for the whole tab — see the header. */
const MARK_KEY = 'learn:bookmark';

let dispose: (() => void) | null = null;

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
    node.style.scrollMarginTop = `${OFFSET}px`;
    out.push({ id: node.id, label, level, el: node });
  }
  return out;
}

/**
 * Insert the sticky TOC after the page's intro block (the book's title page, or
 * an `h1`/`.subtitle` on a plainer page) and wire it up. No-op when fewer than
 * three sections were found.
 */
export function mountStickyToc(root: HTMLElement, lang: 'en' | 'vi'): void {
  dispose?.();
  dispose = null;

  const entries = collect(root, lang);
  if (entries.length < 3) return;

  const vi = lang === 'vi';
  const doc = root.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'lt-toc';
  bar.innerHTML = `
    <button type="button" class="lt-toc-open" aria-expanded="false" aria-label="${vi ? 'Mục lục' : 'Table of contents'}">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="11" y2="8"/><line x1="2" y1="12" x2="8" y2="12"/>
      </svg>
      <span>${vi ? 'Mục lục' : 'Contents'}</span>
    </button>
    <span class="lt-toc-now"></span>
    <button type="button" class="lt-toc-mark" hidden></button>
    <button type="button" class="lt-toc-up" title="${vi ? 'Lên đầu trang' : 'Back to top'}">↑</button>
    <div class="lt-toc-progress"><i></i></div>
    <div class="lt-toc-panel" hidden>
      <div class="lt-toc-list">${entries
        .map(
          (e) =>
            `<button type="button" class="lt-toc-item lv${e.level}" data-toc="${e.id}">${e.label}</button>`,
        )
        .join('')}</div>
    </div>`;

  // Below the intro: the contents bar should stick, but a title page is not
  // something you need pinned.
  const intro =
    root.querySelector('.lb-cover') ?? root.querySelector('.subtitle') ?? root.querySelector('h1');
  if (intro?.parentElement === root) intro.after(bar);
  else root.prepend(bar);

  const openBtn = bar.querySelector<HTMLButtonElement>('.lt-toc-open')!;
  const nowEl = bar.querySelector<HTMLElement>('.lt-toc-now')!;
  const markBtn = bar.querySelector<HTMLButtonElement>('.lt-toc-mark')!;
  const progress = bar.querySelector<HTMLElement>('.lt-toc-progress > i')!;
  const panel = bar.querySelector<HTMLElement>('.lt-toc-panel')!;
  const items = Array.from(bar.querySelectorAll<HTMLButtonElement>('.lt-toc-item'));

  const setOpen = (on: boolean): void => {
    panel.hidden = !on;
    bar.classList.toggle('open', on);
    openBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      const active = panel.querySelector<HTMLElement>('.lt-toc-item.active');
      // `nearest` (not `center`) — don't yank the list when the target is visible.
      active?.scrollIntoView({ block: 'nearest' });
    }
  };

  const goTo = (id: string): void => {
    setOpen(false);
    doc.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  bar.querySelector<HTMLButtonElement>('.lt-toc-up')!.addEventListener('click', () => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  for (const it of items) {
    it.addEventListener('click', () => goTo(it.dataset.toc!));
  }

  // -- the bookmark ---------------------------------------------------------
  // Offered, never forced: it is one button that disappears once used or once the
  // reader has got there on their own. Restoring the scroll position silently
  // would be worse — the page would open somewhere the reader did not ask for.
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(MARK_KEY);
  } catch {
    // Private mode / storage disabled. A book with no bookmark still reads.
  }
  const savedEntry = saved ? entries.find((e) => e.id === saved) : undefined;
  if (savedEntry && savedEntry !== entries[0]) {
    markBtn.hidden = false;
    markBtn.textContent = `↩ ${savedEntry.label}`;
    markBtn.title = vi ? 'Đọc tiếp từ chỗ đã dừng' : 'Pick up where you left off';
    markBtn.addEventListener('click', () => {
      markBtn.hidden = true;
      goTo(savedEntry.id);
    });
  }

  // -- current section ------------------------------------------------------
  let idx = -1;
  const paint = (): void => {
    // The tab may be hidden (display:none) — every rect is 0 then, which would
    // park the marker on the last section. Skip instead.
    if (!bar.offsetParent) return;

    // How far through the page, measured against the reading area rather than the
    // document: the nav above and the footer below are not part of the book.
    const box = root.getBoundingClientRect();
    const span = box.height - window.innerHeight + OFFSET;
    const read = span > 0 ? (OFFSET - box.top) / span : 1;
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, read)).toFixed(4)})`;

    let next = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i]!.el.getBoundingClientRect().top - OFFSET <= 0) next = i;
      else break;
    }
    if (next === idx) return;
    idx = next;
    nowEl.textContent = entries[idx]!.label;
    items.forEach((it, i) => it.classList.toggle('active', i === idx));
    if (!panel.hidden) items[idx]?.scrollIntoView({ block: 'nearest' });
    // Drop the offer as soon as the reader is past it under their own steam.
    if (!markBtn.hidden && entries[idx] === savedEntry) markBtn.hidden = true;
    // Only once the reader has moved. The first paint happens at the top of the
    // page on every render — recording that would overwrite the bookmark with
    // "the beginning" for anyone who merely opened the tab.
    if (!readerMoved) return;
    try {
      localStorage.setItem(MARK_KEY, entries[idx]!.id);
    } catch {
      // Out of room: the bookmark is the least important thing on the page.
    }
  };

  let raf = 0;
  let readerMoved = false;
  const onScroll = (): void => {
    if (!bar.isConnected) {
      dispose?.();
      return;
    }
    readerMoved = true;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  };
  const onDocClick = (e: Event): void => {
    if (!panel.hidden && !bar.contains(e.target as Node)) setOpen(false);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  doc.addEventListener('click', onDocClick);
  doc.addEventListener('keydown', onKey);
  nowEl.textContent = entries[0]!.label;
  items[0]?.classList.add('active');
  paint();

  dispose = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    doc.removeEventListener('click', onDocClick);
    doc.removeEventListener('keydown', onKey);
    if (raf) cancelAnimationFrame(raf);
    dispose = null;
  };
}
