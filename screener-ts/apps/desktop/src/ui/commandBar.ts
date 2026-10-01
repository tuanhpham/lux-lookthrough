/**
 * The action bar under a page's title: what you can DO on this page, in one card.
 *
 * Pages used to put a row of loose buttons there — a filled one, two outlined ones,
 * a strip of pills and a sentence of grey text, all at different heights and with
 * nothing tying them together. This is one card with three zones:
 *
 *   actions   — icon + label buttons; the page's main action is filled.
 *   controls  — segmented switches (display currency and the like).
 *   meta      — status and quiet hints, pushed to the right (below on a phone).
 *
 * Only markup and classes: ids stay on the buttons, so each page wires them exactly
 * as before. CSS is the `.cb` block in styles.css.
 */

const PATHS: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  ledger: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  broom: '<path d="M14 4 9.5 12.5"/><path d="M6 13h8l2 7H4z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
};

export type CbIcon = keyof typeof PATHS;

export function cbIcon(name: CbIcon, size = 16): string {
  return `<svg class="cb-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`;
}

export interface CbButton {
  id: string;
  label: string;
  icon?: CbIcon;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}

export function cbButton(b: CbButton): string {
  return `<button type="button" class="cb-btn${b.primary ? ' cb-primary' : ''}" id="${b.id}"${b.disabled ? ' disabled' : ''}${
    b.title ? ` title="${b.title.replace(/"/g, '&quot;')}"` : ''}>${b.icon ? cbIcon(b.icon) : ''}<span>${b.label}</span></button>`;
}

export interface CbSegment {
  label?: string;
  title?: string;
  /** `attrs` carries the page's own data-* hook, e.g. `data-w-disp="EUR"`. */
  items: { label: string; active: boolean; attrs: string }[];
}

export function cbSegment(s: CbSegment): string {
  return `<div class="cb-seg-wrap"${s.title ? ` title="${s.title.replace(/"/g, '&quot;')}"` : ''}>
      ${s.label ? `<span class="cb-seg-l">${s.label}</span>` : ''}
      <div class="cb-seg" role="group">${s.items
        .map((i) => `<button type="button" class="${i.active ? 'on' : ''}" aria-pressed="${i.active}" ${i.attrs}>${i.label}</button>`)
        .join('')}</div>
    </div>`;
}

export function commandBar(o: { actions: string[]; controls?: string[]; meta?: string }): string {
  return `<div class="cb">
      <div class="cb-actions">${o.actions.join('')}</div>
      ${o.controls?.length ? `<div class="cb-controls">${o.controls.join('')}</div>` : ''}
      ${o.meta ? `<div class="cb-meta">${o.meta}</div>` : ''}
    </div>`;
}
