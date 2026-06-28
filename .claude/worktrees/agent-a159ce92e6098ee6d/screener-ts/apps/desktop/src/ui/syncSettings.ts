/**
 * Sync settings dialog: enter / clear the access code that links this device to
 * your D1-backed account. On a valid code we store it, pull+merge remote data,
 * then re-render the open tab so synced watchlists/posts/accounts appear.
 */
import type { AppContext } from '../context.js';
import { getSyncCode, setSyncCode, verifyCode } from '../adapters/syncClient.js';
import { pullAndMerge } from '../adapters/storage.js';
import { getLang } from './i18n.js';

let onSyncedCb: (() => void) | null = null;

/** Register a callback fired after a successful pull+merge (e.g. re-render tab). */
export function onSynced(cb: () => void): void {
  onSyncedCb = cb;
}

export function openSyncSettings(ctx: AppContext): void {
  const vi = getLang() === 'vi';
  const existing = getSyncCode() ?? '';

  const host = document.createElement('div');
  host.className = 'modal';
  host.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel" style="max-width:440px">
      <div class="modal-head">
        <div>${vi ? '☁️ Đồng bộ thiết bị' : '☁️ Device Sync'}</div>
        <button class="sync-x" style="background:0;border:0;color:var(--faint);font-size:22px;cursor:pointer">×</button>
      </div>
      <div class="modal-body" style="padding:16px">
        <p class="muted" style="font-size:13px;line-height:1.6;margin-top:0">
          ${
            vi
              ? 'Nhập mã truy cập để đồng bộ danh sách theo dõi, bài viết và tài khoản giao dịch mô phỏng trên mọi thiết bị. Để trống để chỉ lưu cục bộ trên máy này.'
              : 'Enter your access code to sync watchlists, posts and paper-trading accounts across every device. Leave empty to keep data only on this device.'
          }
        </p>
        <label class="field-label">${vi ? 'Mã truy cập' : 'Access code'}</label>
        <input id="sync-code-input" class="field" style="width:100%" type="password"
          autocomplete="off" spellcheck="false" value="${existing.replace(/"/g, '&quot;')}"
          placeholder="${vi ? 'dán mã của bạn' : 'paste your code'}" />
        <div id="sync-msg" class="muted" style="font-size:12px;min-height:18px;margin:8px 0"></div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:4px">
          ${existing ? `<button id="sync-clear" class="btn-outline" style="margin-right:auto">${vi ? 'Đăng xuất' : 'Sign out'}</button>` : ''}
          <button id="sync-cancel" class="btn-outline">${vi ? 'Hủy' : 'Cancel'}</button>
          <button id="sync-save" class="btn">${vi ? 'Lưu & đồng bộ' : 'Save & Sync'}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(host);
  const close = (): void => host.remove();
  const msg = host.querySelector('#sync-msg') as HTMLElement;
  const input = host.querySelector('#sync-code-input') as HTMLInputElement;

  host.querySelector('.modal-backdrop')!.addEventListener('click', close);
  host.querySelector('.sync-x')!.addEventListener('click', close);
  host.querySelector('#sync-cancel')!.addEventListener('click', close);

  host.querySelector('#sync-clear')?.addEventListener('click', () => {
    setSyncCode(null);
    msg.textContent = vi ? 'Đã đăng xuất. Dữ liệu cục bộ vẫn còn.' : 'Signed out. Local data is kept.';
    setTimeout(close, 800);
  });

  host.querySelector('#sync-save')!.addEventListener('click', async () => {
    const code = input.value.trim();
    if (!code) {
      setSyncCode(null);
      close();
      return;
    }
    msg.style.color = 'var(--faint)';
    msg.textContent = vi ? 'Đang kiểm tra mã…' : 'Verifying code…';
    const res = await verifyCode(code);
    if (!res.ok) {
      msg.style.color = 'var(--danger)';
      msg.textContent = vi ? 'Mã không hợp lệ.' : 'Invalid code.';
      return;
    }
    setSyncCode(code);
    msg.style.color = 'var(--faint)';
    msg.textContent = vi ? 'Đang tải dữ liệu…' : 'Pulling your data…';
    const n = await pullAndMerge(ctx.synced);
    msg.style.color = 'var(--accent)';
    msg.textContent =
      (res.name ? `${vi ? 'Xin chào' : 'Hi'} ${res.name}. ` : '') +
      (vi ? `Đã đồng bộ ${n} mục.` : `Synced ${n} item(s).`);
    onSyncedCb?.();
    setTimeout(close, 900);
  });

  setTimeout(() => input.focus(), 30);
}
