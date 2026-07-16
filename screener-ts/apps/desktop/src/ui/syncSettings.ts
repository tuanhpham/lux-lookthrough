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

/** Shape of a full local-data backup file. */
interface BackupFile {
  format: 'screener-backup';
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

/**
 * Read EVERY local key/value into one JSON file and trigger a download. Works on
 * web (localStorage) and desktop (Tauri fs) via the portable Storage interface,
 * and does NOT depend on sync being enabled — this is the offline safety net.
 */
async function exportAllData(ctx: AppContext): Promise<number> {
  const keys = await ctx.storage.list('');
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    const value = await ctx.storage.get<unknown>(key);
    if (value !== null) data[key] = value;
  }
  const backup: BackupFile = {
    format: 'screener-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `screener-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return Object.keys(data).length;
}

/**
 * Restore a backup file into local storage. Writes each key through the normal
 * Storage.set so values are re-stamped "now" — the freshly restored data then
 * wins last-write-wins and pushes up once a valid sync code is set again.
 * Returns the number of keys restored, or throws on a malformed file.
 */
async function importAllData(ctx: AppContext, text: string): Promise<number> {
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (!parsed || parsed.format !== 'screener-backup' || typeof parsed.data !== 'object' || !parsed.data) {
    throw new Error('not a screener backup file');
  }
  const entries = Object.entries(parsed.data);
  for (const [key, value] of entries) {
    await ctx.storage.set(key, value);
  }
  return entries.length;
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
        <div style="border-top:1px solid var(--border, #2a2a2a);margin-top:16px;padding-top:14px">
          <div class="field-label" style="margin-bottom:6px">${vi ? 'Sao lưu ngoại tuyến' : 'Offline backup'}</div>
          <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">
            ${
              vi
                ? 'Tải toàn bộ dữ liệu trên thiết bị này ra một tệp (không cần mã đồng bộ). Dùng “Nhập” để khôi phục trên thiết bị khác.'
                : 'Download all data on this device to a file (no sync code needed). Use “Import” to restore it on another device.'
            }
          </p>
          <div class="row" style="gap:8px">
            <button id="data-export" class="btn-outline">${vi ? '⬇ Xuất dữ liệu' : '⬇ Export data'}</button>
            <button id="data-import" class="btn-outline">${vi ? '⬆ Nhập dữ liệu' : '⬆ Import data'}</button>
            <input id="data-import-file" type="file" accept="application/json,.json" style="display:none" />
          </div>
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

  // ── Offline backup: export / import (works without a sync code) ─────────────
  host.querySelector('#data-export')!.addEventListener('click', async () => {
    try {
      msg.style.color = 'var(--faint)';
      msg.textContent = vi ? 'Đang xuất…' : 'Exporting…';
      const n = await exportAllData(ctx);
      msg.style.color = 'var(--accent)';
      msg.textContent = vi ? `Đã xuất ${n} mục vào tệp.` : `Exported ${n} item(s) to a file.`;
    } catch (e) {
      msg.style.color = 'var(--danger)';
      msg.textContent = (vi ? 'Xuất thất bại: ' : 'Export failed: ') + String((e as Error)?.message ?? e);
    }
  });

  const fileInput = host.querySelector('#data-import-file') as HTMLInputElement;
  host.querySelector('#data-import')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const ok = confirm(
      vi
        ? 'Nhập sẽ ghi đè các mục trùng khóa bằng dữ liệu trong tệp. Tiếp tục?'
        : 'Import will overwrite matching keys with the file’s data. Continue?',
    );
    if (!ok) {
      fileInput.value = '';
      return;
    }
    try {
      msg.style.color = 'var(--faint)';
      msg.textContent = vi ? 'Đang nhập…' : 'Importing…';
      const n = await importAllData(ctx, await file.text());
      msg.style.color = 'var(--accent)';
      msg.textContent = vi ? `Đã khôi phục ${n} mục. Đang tải lại…` : `Restored ${n} item(s). Reloading…`;
      onSyncedCb?.();
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      msg.style.color = 'var(--danger)';
      msg.textContent = (vi ? 'Nhập thất bại: ' : 'Import failed: ') + String((e as Error)?.message ?? e);
    } finally {
      fileInput.value = '';
    }
  });

  setTimeout(() => input.focus(), 30);
}
