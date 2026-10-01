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
  ttl: { vi: '🏷 Lý do thoát lệnh', en: '🏷 Exit reasons' },
  lead: {
    vi: 'Danh sách dưới đây là những lý do app tặng sẵn — xem được, không sửa được, vì mỗi lý do là một mã đã nằm trên các lệnh bạn ghi trước đây; đổi tên nó là đổi luôn ý nghĩa của cả một năm ghi chép. Phần bạn tự thêm nằm ở dưới cùng và xuất hiện ngay trong ô "lý do thoát" của Trade Planner và của phần Bán.',
    en: 'The list below is what the app ships — readable, not editable, because each row is a key already stored on trades you filed earlier, and renaming one would rewrite what a year of records say happened. Your own rows are at the bottom and show up straight away in the exit-reason field of the Trade Planner and of Sell.',
  },
  builtin: { vi: 'Có sẵn', en: 'Shipped' },
  mine: { vi: 'Của tôi', en: 'Mine' },
  add: { vi: '+ Thêm lý do', en: '+ Add a reason' },
  newLabel: { vi: 'Lý do mới…', en: 'New reason…' },
  group: { vi: 'Nhóm', en: 'Group' },
  del: { vi: 'Xóa', en: 'Delete' },
  empty: { vi: 'Bạn chưa thêm lý do nào.', en: 'You have not added any reasons yet.' },
  cancel: { vi: 'Hủy', en: 'Cancel' },
  save: { vi: 'Lưu', en: 'Save' },
  dupe: { vi: 'Lý do này đã có trong danh sách.', en: 'That reason is already on the list.' },
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

  const host = document.createElement('div');
  host.className = 'modal';
  host.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel" style="max-width:700px">
      <div class="modal-head">
        <div>${w('ttl')}</div>
        <button class="xr-x" aria-label="Close">×</button>
      </div>
      <div class="modal-body" style="padding:16px;max-height:76vh;overflow:auto">
        <p class="muted" style="font-size:12px;line-height:1.6;margin:0 0 14px">${w('lead')}</p>
        <div class="xr-list" id="xr-list"></div>
        <div id="xr-msg" class="muted" style="font-size:12px;min-height:18px;margin:10px 0"></div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button id="xr-cancel" class="btn-outline">${w('cancel')}</button>
          <button id="xr-save" class="btn">${w('save')}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(host);

  const list = host.querySelector('#xr-list') as HTMLElement;
  const msg = host.querySelector('#xr-msg') as HTMLElement;

  const groupOpts = (sel: ExitGroup): string =>
    EXIT_GROUPS.map(
      (g) => `<option value="${g.key}"${g.key === sel ? ' selected' : ''}>${esc(vi ? g.vi : g.en)}</option>`,
    ).join('');

  const draw = (): void => {
    // Drawn through `exitReasonsFrom` rather than from the two arrays by hand, so what the table
    // shows is exactly what the dropdown will show — including a row dropped for a key collision.
    const all = exitReasonsFrom(mine);
    const sections = EXIT_GROUPS.map((g) => {
      const rows = all.filter((r) => r.group === g.key);
      const cells = rows.map((r) => `
        <tr>
          <td style="padding:3px 6px">${esc(vi ? r.vi : r.en)}</td>
          <td style="padding:3px 6px;text-align:right;white-space:nowrap">
            ${r.builtin
              ? `<span class="badge" style="font-size:10px;background:color-mix(in srgb,var(--faint) 14%,transparent);color:var(--faint)">${w('builtin')}</span>`
              : `<button type="button" class="btn-outline mini-btn" data-xr-del="${esc(r.key)}"
                   title="${w('del')}">✕</button>`}
          </td>
        </tr>`).join('');
      return `
        <div class="section-title" style="margin-top:12px">${esc(vi ? g.vi : g.en)}</div>
        ${rows.length
          ? `<table style="border-collapse:collapse;width:100%;font-size:12.5px">${cells}</table>`
          : `<p class="muted" style="font-size:11.5px;margin:0">${g.key === 'mine' ? w('empty') : '—'}</p>`}`;
    }).join('');

    list.innerHTML = `${sections}
      <div class="row" style="gap:8px;margin-top:12px;align-items:flex-end;flex-wrap:wrap">
        <label class="field-label" style="flex:1 1 240px;margin:0">
          ${w('newLabel')}
          <input class="field" id="xr-new" type="text" style="width:100%;padding:5px 7px;font-size:12px" />
        </label>
        <label class="field-label" style="margin:0">
          ${w('group')}
          <select class="field" id="xr-newgroup" style="padding:5px 7px;font-size:12px">${groupOpts('mine')}</select>
        </label>
        <button type="button" class="btn-outline" id="xr-add">${w('add')}</button>
      </div>`;

    list.querySelectorAll<HTMLElement>('[data-xr-del]').forEach((b) =>
      b.addEventListener('click', () => {
        mine = mine.filter((r) => r.key !== b.dataset.xrDel);
        draw();
      }),
    );
    list.querySelector('#xr-add')!.addEventListener('click', () => {
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
    });
  };

  draw();

  return new Promise<boolean>((resolve) => {
    const close = (changed: boolean): void => { host.remove(); resolve(changed); };
    host.querySelector('.modal-backdrop')!.addEventListener('click', () => close(false));
    host.querySelector('.xr-x')!.addEventListener('click', () => close(false));
    host.querySelector('#xr-cancel')!.addEventListener('click', () => close(false));
    host.querySelector('#xr-save')!.addEventListener('click', () => {
      void saveCustomExitReasons(ctx, mine).then(() => close(true), () => close(false));
    });
  });
}
