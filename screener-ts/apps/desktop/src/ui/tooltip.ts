import { gloss } from './glossary.js';

/** Markup for an info "i" badge. Wire it later with `attachTooltips(root)`. */
export function infoIcon(key: string): string {
  return `<span class="info-i" data-tip="${key}">i</span>`;
}

/** Attach hover/tap tooltips to every [data-tip] within `root`. Reads the
 * glossary in the active language. Uses one shared floating element. */
export function attachTooltips(root: ParentNode): void {
  const tip = document.getElementById('tooltip');
  if (!tip) return;

  const show = (el: HTMLElement, x: number, y: number): void => {
    const g = gloss(el.dataset.tip!);
    if (!g) return;
    tip.innerHTML = `<div class="tt-term">${g.term}</div><div class="tt-body">${g.long}</div>`;
    tip.classList.remove('hidden');
    const maxX = window.innerWidth - tip.offsetWidth - 14;
    tip.style.left = Math.min(x + 12, Math.max(8, maxX)) + 'px';
    tip.style.top = y + 16 + 'px';
  };
  const hide = (): void => tip.classList.add('hidden');

  root.querySelectorAll<HTMLElement>('.info-i[data-tip]').forEach((el) => {
    el.addEventListener('mouseenter', (e) => show(el, e.clientX, e.clientY));
    el.addEventListener('mousemove', (e) => show(el, e.clientX, e.clientY));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      show(el, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
      setTimeout(hide, 4000);
    });
  });
}
