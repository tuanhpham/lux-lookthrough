/**
 * Sticky table of contents for long reading pages (the Learn tab).
 *
 * The Learn tab is ~25 sections tall — four guides, the glossary groups, and the
 * 16-part swing playbook — so "scroll back to the section I was in" was the one
 * thing it couldn't do. This mounts a bar that sticks under the top nav and
 * always shows WHERE YOU ARE, with a panel that lists every section to jump to.
 *
 * Two deliberate choices:
 *  - The entries are DISCOVERED from the DOM (`h2` + `.swp-sec`), not hand-listed.
 *    The Learn tab is re-rendered from scratch on every language switch and its
 *    sections change as the page grows; a hard-coded list would silently rot.
 *  - It is a bar + panel, not a side rail. `#main` is a single centred column with
 *    no gutter to put a rail in, and a 25-item horizontal chip row is unusable on
 *    a phone. The bar costs ~38px of height and works identically on both.
 *
 * Mounting twice is safe: the previous instance is disposed first (its window
 * listeners are removed), which matters because `renderLearn()` runs again on
 * every language/theme change.
 */

export interface TocEntry {
  id: string;
  label: string;
  /** Nested one level (the playbook's 16 sections under the playbook itself). */
  sub: boolean;
  el: HTMLElement;
}

/** Height of the fixed top nav (56px) + the sticky bar itself + breathing room.
 * Used both as `scroll-margin-top` on the targets and as the line at which a
 * section counts as "current". */
const OFFSET = 116;

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
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('h2, .swp-sec'))) {
    const sub = node.classList.contains('swp-sec');
    // A `.swp-sec` is the section wrapper; its title lives in `.swp-h`.
    const label = sub
      ? (node.querySelector<HTMLElement>('.swp-h')?.textContent ?? '').replace(/\s+/g, ' ').trim()
      : labelOf(node, lang);
    if (!label) continue;
    // Anchor to the section wrapper (so the heading isn't flush against the bar)
    // and keep ids that already exist — the playbook's own chips point at them.
    if (!node.id) node.id = `learn-toc-${++i}`;
    node.style.scrollMarginTop = `${OFFSET}px`;
    out.push({ id: node.id, label, sub, el: node });
  }
  return out;
}

/**
 * Insert the sticky TOC as the first child of `root` (after any `h1`/`.subtitle`
 * intro) and wire it up. No-op when fewer than three sections were found.
 */
export function mountStickyToc(root: HTMLElement, lang: 'en' | 'vi'): void {
  dispose?.();
  dispose = null;

  const entries = collect(root, lang);
  if (entries.length < 3) return;

  const vi = lang === 'vi';
  const bar = root.ownerDocument.createElement('div');
  bar.className = 'lt-toc';
  bar.innerHTML = `
    <button type="button" class="lt-toc-open" aria-expanded="false" aria-label="${vi ? 'Mục lục' : 'Table of contents'}">
      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="11" y2="8"/><line x1="2" y1="12" x2="8" y2="12"/>
      </svg>
      <span>${vi ? 'Mục lục' : 'Contents'}</span>
    </button>
    <span class="lt-toc-now"></span>
    <button type="button" class="lt-toc-up" title="${vi ? 'Lên đầu trang' : 'Back to top'}">↑</button>
    <div class="lt-toc-panel" hidden>
      <div class="lt-toc-list">${entries
        .map(
          (e) =>
            `<button type="button" class="lt-toc-item${e.sub ? ' sub' : ''}" data-toc="${e.id}">${e.label}</button>`,
        )
        .join('')}</div>
    </div>`;

  // Below the intro (h1 + subtitle): the TOC should stick, but the page title is
  // not something you need pinned.
  const intro = root.querySelector('.subtitle') ?? root.querySelector('h1');
  if (intro?.parentElement === root) intro.after(bar);
  else root.prepend(bar);

  const openBtn = bar.querySelector<HTMLButtonElement>('.lt-toc-open')!;
  const nowEl = bar.querySelector<HTMLElement>('.lt-toc-now')!;
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

  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  bar.querySelector<HTMLButtonElement>('.lt-toc-up')!.addEventListener('click', () => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  for (const it of items) {
    it.addEventListener('click', () => {
      setOpen(false);
      root.ownerDocument.getElementById(it.dataset.toc!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // -- current section ------------------------------------------------------
  let idx = -1;
  const paint = (): void => {
    // The tab may be hidden (display:none) — every rect is 0 then, which would
    // park the marker on the last section. Skip instead.
    if (!bar.offsetParent) return;
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
  };

  let raf = 0;
  const onScroll = (): void => {
    if (!bar.isConnected) {
      dispose?.();
      return;
    }
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
  root.ownerDocument.addEventListener('click', onDocClick);
  root.ownerDocument.addEventListener('keydown', onKey);
  nowEl.textContent = entries[0]!.label;
  items[0]?.classList.add('active');
  paint();

  dispose = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    root.ownerDocument.removeEventListener('click', onDocClick);
    root.ownerDocument.removeEventListener('keydown', onKey);
    if (raf) cancelAnimationFrame(raf);
    dispose = null;
  };
}
