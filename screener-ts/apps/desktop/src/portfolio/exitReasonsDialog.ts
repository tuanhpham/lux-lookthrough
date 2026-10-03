/**
 * The exit-reason table — where the user reads the shipped vocabulary and adds their own.
 *
 * ── WHY THE SHIPPED ROWS ARE SHOWN AND NOT EDITABLE ─────────────────────────
 * The user asked for a "configurable table", and the configurable part is real: anything they
 * type here appears in the dropdown immediately, everywhere. But the thirty shipped rows are
 * shown read-only, for a reason worth being explicit about: a stored reason is a KEY, and every
 * case study and sell already filed points at one. Renaming "Stop hit" to something else would
 * not add a reason — it would silently rewrite what a year of records say happened. Deleting one
 * would be worse. So the shipped list is a reference, and the user's list is the editable part.
 *
 * They are still listed rather than hidden behind "add your own", because the commonest way to
 * end up with an uncountable journal is not knowing a reason already exists and typing a fourth
 * wording of it.
 *
 * ── WHY IT IS A MODAL AND NOT A `formDialog` ─────────────────────────────────
 * `formDialog` is a fixed list of fields; this is a table that grows while it is open. Rows are
 * added to a local array and only written on Save, so Cancel is a real undo — the same contract
 * the playbook settings dialog keeps, and the one that makes it safe to experiment in here.
 *
 * ── WHY DELETING A ROW IS NOT A DESTRUCTIVE EDIT ─────────────────────────────
 * Deleting a custom reason removes it from the dropdown but not from the trades filed under it:
 * `exitReasonLabel` falls back to the raw key, so an old record reads `my:sold-too-early` instead
 * of going blank. Ugly on purpose — a record that lost its reason would be worse than one that
 * shows it unprettily.
 */
import type { AppContext } from '../context.js';
import { getLang } from '../ui/i18n.js';
import { loadPlaybookConfig } from './playbook.js';
import {
  EXIT_GROUPS,
  asExitGroup,
  customExitReasons,
  hiddenExitReasons,
  exitReasonKeyFor,
  exitReasonsFrom,
  saveCustomExitReasons,
  type CustomExitReason,
  type ExitGroup,
} from './exitReasons.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const WORDS = {
  ttl: { vi: 'Lý do bán', en: 'Exit reasons' },
  lead: {
    vi: 'Lý do có sẵn không đổi tên được (lệnh cũ đã gắn với chúng), nhưng bỏ khỏi danh sách được — lệnh cũ vẫn giữ tên. Lý do bạn tự thêm sửa, xoá thoải mái.',
    en: 'Shipped reasons cannot be renamed (old trades point at them), but they can be taken off the list — old trades keep the name. Your own reasons are yours to add and delete.',
  },
  builtin: { vi: 'Có sẵn', en: 'Shipped' },
  mine: { vi: 'Của tôi', en: 'Mine' },
  add: { vi: '+ Thêm lý do', en: '+ Add a reason' },
  newLabel: { vi: 'Lý do mới…', en: 'New reason…' },
  group: { vi: 'Nhóm', en: 'Group' },
  del: { vi: 'Xóa', en: 'Delete' },
  hide: { vi: 'Bỏ khỏi danh sách (lệnh cũ vẫn giữ tên)', en: 'Take off the list (old trades keep the name)' },
  restore: { vi: 'Khôi phục', en: 'Restore' },
  hidden: { vi: 'Đã bỏ', en: 'Removed' },
  empty: { vi: 'Chưa có lý do tự thêm nào.', en: 'You have not added any reasons yet.' },
  cancel: { vi: 'Hủy', en: 'Cancel' },
  save: { vi: 'Lưu', en: 'Save' },
  dupe: { vi: 'Lý do này đã có trong danh sách.', en: 'That reason is already on the list.' },
  addTitle: { vi: 'Thêm lý do của bạn', en: 'Add your own reason' },
  mineTitle: { vi: 'Lý do của bạn', en: 'Your reasons' },
  hiddenTitle: { vi: 'Đã bỏ khỏi danh sách', en: 'Taken off the list' },
  hiddenHint: { vi: 'Bấm để đưa lại vào danh sách.', en: 'Click one to put it back.' },
} as const;

/**
 * Open the table. Resolves true when the vocabulary was changed and saved, so a caller can
 * rebuild its dropdown — and false on cancel, so it does not redraw for nothing.
 */
export async function openExitReasonsDialog(ctx: AppContext): Promise<boolean> {
  await loadPlaybookConfig(ctx);
  const vi = getLang() === 'vi';
  const w = (k: keyof typeof WORDS): string => (vi ? WORDS[k].vi : WORDS[k].en);
  // A working copy. Nothing is stored until Save, which is what makes Cancel an undo.
  let mine: CustomExitReason[] = customExitReasons();
  let hidden = new Set(hiddenExitReasons());

  const host = document.createElement('div');
  host.className = 'dialog-host';
  host.innerHTML = `
    <div class="dialog-backdrop"></div>
    <div class="dialog xr-dialog" role="dialog" aria-modal="true">
      <div class="dialog-head"><span class="dialog-ic">🏷</span><div>
        <div class="dialog-title">${w('ttl')}</div>
        <div class="dialog-sub">${w('lead')}</div>
      </div></div>
      <div class="dialog-body">
        <div class="xr-list" id="xr-list"></div>
        <div id="xr-msg" class="xr-msg"></div>
      </div>
      <div class="dialog-actions">
        <button id="xr-cancel" class="ui-btn ghost">${w('cancel')}</button>
        <button id="xr-save" class="ui-btn primary">${w('save')}</button>
      </div>
    </div>`;
  document.body.appendChild(host);

  const list = host.querySelector('#xr-list') as HTMLElement;
  const msg = host.querySelector('#xr-msg') as HTMLElement;

  const groupOpts = (sel: ExitGroup): string =>
    EXIT_GROUPS.map(
      (g) => `<option value="${g.key}"${g.key === sel ? ' selected' : ''}>${esc(vi ? g.vi : g.en)}</option>`,
    ).join('');

  const GROUP_IC: Record<string, string> = { plan: '🎯', ma: '📈', candle: '🕯', volume: '📊', context: '🌐', discipline: '🧠', mine: '✍️' };

  const draw = (): void => {
    // Drawn through `exitReasonsFrom` rather than from the two arrays by hand, so what the list
    // shows is exactly what the dropdown will show — including a row dropped for a key collision.
    const all = exitReasonsFrom(mine);
    const ownRows = all.filter((r) => !r.builtin);
    const off = all.filter((r) => r.builtin && hidden.has(r.key));

    // 1. The one thing to DO here, first and lit: add a reason.
    const addCard = `<div class="xr-add">
        <div class="xr-add-h">✍️ ${w('addTitle')}</div>
        <div class="xr-add-row">
          <input class="field" id="xr-new" type="text" placeholder="${w('newLabel')}" aria-label="${w('newLabel')}" />
          <select class="field" id="xr-newgroup" aria-label="${w('group')}">${groupOpts('mine')}</select>
          <button type="button" class="ui-btn primary" id="xr-add">${w('add')}</button>
        </div>
      </div>`;

    // 2. The user's own words, highlighted: they are the editable part.
    const own = `<section class="xr-sec xr-own">
        <div class="xr-gh"><span>✍️ ${w('mineTitle')}</span><span class="xr-gc">${ownRows.length}</span></div>
        ${ownRows.length
          ? `<div class="xr-grid">${ownRows.map((r) => `<div class="xr-item mine">
              <span class="xr-label">${esc(vi ? r.vi : r.en)}</span>
              <span class="xr-g">${esc(vi ? EXIT_GROUPS.find((g) => g.key === r.group)?.vi ?? '' : EXIT_GROUPS.find((g) => g.key === r.group)?.en ?? '')}</span>
              <button type="button" class="ui-icon-btn danger xr-x" data-xr-del="${esc(r.key)}" title="${w('del')}" aria-label="${w('del')}">✕</button>
            </div>`).join('')}</div>`
          : `<div class="xr-empty">${w('empty')}</div>`}
      </section>`;

    // 3. The shipped vocabulary, quiet: a label per tile, the remove control only on hover.
    const shipped = EXIT_GROUPS.filter((g) => g.key !== 'mine').map((g) => {
      const rows = all.filter((r) => r.builtin && r.group === g.key && !hidden.has(r.key));
      if (!rows.length) return '';
      return `<section class="xr-sec">
          <div class="xr-gh"><span>${GROUP_IC[g.key] ?? '•'} ${esc(vi ? g.vi : g.en)}</span><span class="xr-gc">${rows.length}</span></div>
          <div class="xr-grid">${rows.map((r) => `<div class="xr-item">
              <span class="xr-label">${esc(vi ? r.vi : r.en)}</span>
              <button type="button" class="xr-x xr-hide" data-xr-hide="${esc(r.key)}" title="${w('hide')}" aria-label="${w('hide')}">✕</button>
            </div>`).join('')}</div>
        </section>`;
    }).join('');

    // 4. What was taken off, out of the way but one click from coming back.
    const gone = off.length ? `<details class="xr-gone">
        <summary>${w('hiddenTitle')} <span class="xr-gc">${off.length}</span></summary>
        <p>${w('hiddenHint')}</p>
        <div class="xr-chips">${off.map((r) => `<button type="button" class="xr-chip" data-xr-show="${esc(r.key)}">↺ ${esc(vi ? r.vi : r.en)}</button>`).join('')}</div>
      </details>` : '';

    list.innerHTML = addCard + own + shipped + gone;

    list.querySelectorAll<HTMLElement>('[data-xr-hide]').forEach((b) =>
      b.addEventListener('click', () => { hidden.add(b.dataset.xrHide!); draw(); }));
    list.querySelectorAll<HTMLElement>('[data-xr-show]').forEach((b) =>
      b.addEventListener('click', () => { hidden.delete(b.dataset.xrShow!); draw(); }));
    list.querySelectorAll<HTMLElement>('[data-xr-del]').forEach((b) =>
      b.addEventListener('click', () => {
        mine = mine.filter((r) => r.key !== b.dataset.xrDel);
        draw();
      }),
    );
    const add = (): void => {
      const box = list.querySelector('#xr-new') as HTMLInputElement;
      const label = box.value.trim();
      if (!label) return;
      const group = asExitGroup((list.querySelector('#xr-newgroup') as HTMLSelectElement).value);
      // Same words twice = the same key, so re-typing a label the user already has is a no-op
      // rather than a second row meaning one thing. Matched case-insensitively because "Sold too
      // early" and "sold too early" are not two reasons.
      const lower = label.toLowerCase();
      if (mine.some((r) => r.label.trim().toLowerCase() === lower)) {
        msg.textContent = w('dupe');
        box.value = '';
        return;
      }
      msg.textContent = '';
      mine = [...mine, { key: exitReasonKeyFor(label, exitReasonsFrom(mine).map((r) => r.key)), label, group }];
      draw();
      (list.querySelector('#xr-new') as HTMLInputElement | null)?.focus();
    };
    list.querySelector('#xr-add')!.addEventListener('click', add);
    list.querySelector('#xr-new')!.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') add(); });
  };

  draw();

  return new Promise<boolean>((resolve) => {
    const close = (changed: boolean): void => { host.remove(); resolve(changed); };
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => close(false));
    host.querySelector('#xr-cancel')!.addEventListener('click', () => close(false));
    host.querySelector('#xr-save')!.addEventListener('click', () => {
      void saveCustomExitReasons(ctx, mine, [...hidden]).then(() => close(true), () => close(false));
    });
  });
}
