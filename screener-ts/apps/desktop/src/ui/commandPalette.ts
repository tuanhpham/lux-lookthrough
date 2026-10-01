/**
 * The search palette: Ctrl K (⌘K on a Mac), "/" or the 🔍 in the top bar.
 *
 * Fourteen pages behind a full-screen menu was one click to open the menu, a scan of
 * fourteen names and a second click — and the page you wanted was often a SECTION of
 * a page (the restore steps, the exits chapter of the playbook), which the menu could
 * not reach at all. Typing two or three letters of what you want is faster than both.
 *
 * Generic on purpose: it knows nothing about tabs. main.ts hands it the items (pages,
 * sections, actions), each with its own `run`, so this file never imports a tab and
 * there is no import cycle to worry about.
 *
 * Matching ignores case and Vietnamese diacritics ("tai chinh" finds "Tài chính"),
 * and every word typed must appear somewhere in the item; a hit at the start of the
 * title ranks above one buried in the description.
 */

export interface PaletteItem {
  id: string;
  icon: string;
  title: string;
  sub?: string;
  /** The heading the item is listed under. */
  group: string;
  /** Matched but not shown. */
  words?: string;
  /** Shown on the right, e.g. the page a section belongs to. */
  tag?: string;
  run: () => void;
}

export interface PaletteSource {
  /** Everything searchable. Called each time the palette opens, so it can follow the language. */
  items: () => PaletteItem[];
  /** What to list before anything is typed (recent pages, then the pages, then actions). */
  idle: () => PaletteItem[];
  lang: () => 'en' | 'vi';
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** 0 = no match. Higher is better. Exported for the tests. */
export function score(item: Pick<PaletteItem, 'title' | 'sub' | 'words' | 'group' | 'tag'>, query: string): number {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = fold(item.title);
  const hay = `${title} ${fold(item.sub ?? '')} ${fold(item.words ?? '')} ${fold(item.group)} ${fold(item.tag ?? '')}`;
  let total = 0;
  for (const w of words) {
    if (!hay.includes(w)) return 0;
    if (title.startsWith(w)) total += 8;
    else if (new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) total += 5;
    else if (title.includes(w)) total += 3;
    else total += 1;
  }
  return total;
}

let host: HTMLElement | null = null;
let source: PaletteSource | null = null;
let lastFocus: Element | null = null;

export function isPaletteOpen(): boolean {
  return !!host;
}

export function closePalette(): void {
  if (!host) return;
  host.remove();
  host = null;
  document.body.style.overflow = '';
  (lastFocus as HTMLElement | null)?.focus?.();
}

export function openPalette(src: PaletteSource, initial = ''): void {
  source = src;
  if (host) {
    host.querySelector<HTMLInputElement>('.cp-input')?.focus();
    return;
  }
  lastFocus = document.activeElement;
  const vi = src.lang() === 'vi';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  host = document.createElement('div');
  host.className = 'cp-backdrop';
  host.innerHTML = `
    <div class="cp" role="dialog" aria-modal="true" aria-label="${vi ? 'Tìm kiếm' : 'Search'}">
      <div class="cp-search">
        <svg class="cp-glass" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input class="cp-input" type="text" autocomplete="off" spellcheck="false"
          placeholder="${vi ? 'Tìm trang, mục hướng dẫn hoặc thao tác…' : 'Search pages, guide sections or actions…'}" />
        <kbd class="cp-esc">Esc</kbd>
      </div>
      <div class="cp-list" role="listbox"></div>
      <div class="cp-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> ${vi ? 'chọn' : 'move'}</span>
        <span><kbd>↵</kbd> ${vi ? 'mở' : 'open'}</span>
        <span><kbd>Esc</kbd> ${vi ? 'đóng' : 'close'}</span>
        <span class="cp-foot-r">${isMac ? '⌘' : 'Ctrl'} K ${vi ? 'mở lại từ bất kỳ đâu' : 'opens this from anywhere'}</span>
      </div>
    </div>`;
  document.body.appendChild(host);
  document.body.style.overflow = 'hidden';

  const input = host.querySelector<HTMLInputElement>('.cp-input')!;
  const list = host.querySelector<HTMLElement>('.cp-list')!;
  let shown: PaletteItem[] = [];
  let active = 0;

  const paint = (): void => {
    const q = input.value.trim();
    const all = q
      ? source!
          .items()
          .map((it, i) => ({ it, s: score(it, q), i }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || a.i - b.i)
          .slice(0, 40)
          .map((x) => x.it)
      : source!.idle();
    shown = all;
    active = Math.min(active, Math.max(0, shown.length - 1));
    if (!shown.length) {
      list.innerHTML = `<div class="cp-empty">${vi ? 'Không tìm thấy gì cho' : 'Nothing found for'} “${esc(q)}”</div>`;
      return;
    }
    // Searching ranks across groups, so the group becomes a tag on each row instead of
    // a heading (a heading per row would be noise); idle keeps the headings.
    let html = '';
    let group = '';
    shown.forEach((it, i) => {
      if (!q && it.group !== group) {
        group = it.group;
        html += `<div class="cp-gh">${esc(group)}</div>`;
      }
      const tag = q ? it.tag ?? it.group : it.tag ?? '';
      html += `<button type="button" class="cp-item${i === active ? ' on' : ''}" role="option" data-cp="${i}">
          <span class="cp-ic" aria-hidden="true">${it.icon}</span>
          <span class="cp-txt"><span class="cp-t">${esc(it.title)}</span>${it.sub ? `<span class="cp-s">${esc(it.sub)}</span>` : ''}</span>
          ${tag ? `<span class="cp-tag">${esc(tag)}</span>` : ''}
          <span class="cp-enter" aria-hidden="true">↵</span>
        </button>`;
    });
    list.innerHTML = html;
  };

  const move = (to: number): void => {
    if (!shown.length) return;
    active = (to + shown.length) % shown.length;
    list.querySelectorAll('.cp-item').forEach((b, i) => b.classList.toggle('on', i === active));
    list.querySelector<HTMLElement>(`[data-cp="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const run = (i: number): void => {
    const it = shown[i];
    if (!it) return;
    closePalette();
    it.run();
  };

  input.addEventListener('input', () => {
    active = 0;
    paint();
    list.scrollTop = 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  });
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cp]');
    if (b) run(Number(b.dataset.cp));
  });
  list.addEventListener('mousemove', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cp]');
    if (b && Number(b.dataset.cp) !== active) move(Number(b.dataset.cp));
  });
  host.addEventListener('mousedown', (e) => {
    if (e.target === host) closePalette();
  });
  host.querySelector('.cp-esc')?.addEventListener('click', closePalette);

  input.value = initial;
  paint();
  input.focus();
}
