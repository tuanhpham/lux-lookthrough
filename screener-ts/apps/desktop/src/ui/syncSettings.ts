/**
 * Sync settings dialog: enter / clear the access code that links this device to
 * your D1-backed account. On a valid code we store it, pull+merge remote data,
 * then re-render the open tab so synced watchlists/posts/accounts appear.
 */
import type { AppContext } from '../context.js';
import {
  getSyncCode,
  setSyncCode,
  verifyCode,
  remoteHistory,
  remoteRestore,
} from '../adapters/syncClient.js';
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
        <div style="border-top:1px solid var(--border, #2a2a2a);margin-top:16px;padding-top:14px">
          <div class="field-label" style="margin-bottom:6px">${vi ? 'Phục hồi phiên bản cũ' : 'Recover an older version'}</div>
          <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">
            ${
              vi
                ? 'Mỗi lần một mục bị ghi đè hoặc xoá, giá trị cũ được lưu lại trên server. Nếu dữ liệu bị mất sau khi đồng bộ, tìm ở đây và bấm Phục hồi.'
                : 'Whenever an item is overwritten or deleted, the server keeps the old value. If data vanished after a sync, find it here and press Restore.'
            }
          </p>
          <button id="data-history" class="btn-outline">${vi ? '🕘 Xem phiên bản cũ' : '🕘 Browse versions'}</button>
          <div id="history-list" style="margin-top:10px;max-height:230px;overflow:auto"></div>
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
    // `freshCode` matters: this device has been running WITHOUT a code, so its
    // local defaults carry "now" timestamps that would beat the account's real
    // data under last-write-wins. Signing in must download, never overwrite.
    const n = await pullAndMerge(ctx.synced, { freshCode: true });
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

  // ── Recover an older version (the last-write-wins safety net) ───────────────
  const historyList = host.querySelector('#history-list') as HTMLElement;

  /** Short human label for a value, so a row is identifiable without opening it. */
  function describe(key: string, value: unknown): string {
    if (Array.isArray(value)) {
      // `accounts` is the one that hurts most when lost — name the accounts and
      // count open lots, so the right version is obvious at a glance.
      if (key === 'accounts') {
        const names = value
          .map((a) => {
            const acct = a as { account?: { name?: string }; lots?: unknown[] };
            const lots = (acct.lots ?? []).length;
            return `${acct.account?.name ?? '?'} (${lots} ${vi ? 'lô' : 'lots'})`;
          })
          .join(', ');
        return names || (vi ? 'rỗng' : 'empty');
      }
      return `${value.length} ${vi ? 'mục' : 'items'}`;
    }
    if (value && typeof value === 'object') {
      return `${Object.keys(value as object).length} ${vi ? 'khoá' : 'keys'}`;
    }
    return String(value).slice(0, 40);
  }

  const stamp = (ms: number): string => new Date(ms).toLocaleString();

  async function showHistory(): Promise<void> {
    if (!getSyncCode()) {
      msg.style.color = 'var(--danger)';
      msg.textContent = vi ? 'Cần nhập mã truy cập trước.' : 'Enter your access code first.';
      return;
    }
    historyList.innerHTML = `<div class="muted" style="font-size:12px">${vi ? 'Đang tải…' : 'Loading…'}</div>`;
    let versions;
    try {
      versions = await remoteHistory();
    } catch (e) {
      historyList.innerHTML = `<div class="muted" style="font-size:12px;color:var(--danger)">${String(
        (e as Error)?.message ?? e,
      )}</div>`;
      return;
    }
    // Hide throwaway caches so the list shows data worth recovering.
    const worth = versions.filter((v) => !/^(scan:|calendar:|pf_bars:|pf_eurusd|sectorlabels)/.test(v.key));
    if (!worth.length) {
      // Server history only starts recording from this fix onward, so on the
      // device that lost data it is expected to be empty. The local pre-merge
      // snapshot is the other chance — offer it explicitly.
      const snap = await ctx.synced.preMergeSnapshot();
      historyList.innerHTML = snap
        ? `<div class="muted" style="font-size:12px;line-height:1.6">
             ${
               vi
                 ? `Server chưa có phiên bản cũ nào (lịch sử chỉ ghi từ bản sửa này). Nhưng thiết bị này có một bản chụp cục bộ lúc <b>${stamp(
                     snap.at,
                   )}</b> gồm ${Object.keys(snap.data).length} mục.`
                 : `The server has no older versions yet (history records from this fix onward). This device does have a local snapshot from <b>${stamp(
                     snap.at,
                   )}</b> with ${Object.keys(snap.data).length} item(s).`
             }
           </div>
           <button id="snap-restore" class="btn-outline" style="margin-top:8px;font-size:11px;padding:5px 10px">
             ${vi ? 'Phục hồi bản chụp cục bộ' : 'Restore local snapshot'}
           </button>`
        : `<div class="muted" style="font-size:12px">${
            vi
              ? 'Chưa có phiên bản nào được lưu. Lịch sử chỉ ghi từ khi bản sửa này được triển khai.'
              : 'No versions stored yet. History only records from this fix onward.'
          }</div>`;
      historyList.querySelector('#snap-restore')?.addEventListener('click', async () => {
        if (
          !snap ||
          !confirm(
            vi
              ? `Ghi ${Object.keys(snap.data).length} mục từ bản chụp lúc ${stamp(snap.at)} lên dữ liệu hiện tại?`
              : `Write ${Object.keys(snap.data).length} item(s) from the ${stamp(snap.at)} snapshot over the current data?`,
          )
        ) {
          return;
        }
        // Routed through storage.set, so each value is re-stamped "now" and wins
        // last-write-wins — the same path the file import uses.
        for (const [key, value] of Object.entries(snap.data)) await ctx.storage.set(key, value);
        msg.style.color = 'var(--accent)';
        msg.textContent = vi ? 'Đã phục hồi bản chụp. Đang tải lại…' : 'Snapshot restored. Reloading…';
        setTimeout(() => location.reload(), 900);
      });
      return;
    }
    historyList.innerHTML = worth
      .map(
        (v) => `<div class="row" style="justify-content:space-between;gap:8px;align-items:center;
             padding:7px 0;border-bottom:1px solid var(--border,#2a2a2a)">
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis">${v.key}</div>
            <div class="muted" style="font-size:11px">
              ${describe(v.key, v.value)} · ${v.how === 'delete' ? (vi ? 'đã xoá' : 'deleted') : (vi ? 'bị ghi đè' : 'overwritten')} ${stamp(v.archivedAt)}
            </div>
          </div>
          <button class="btn-outline" style="font-size:11px;padding:4px 9px;flex:0 0 auto"
            data-restore="${v.key}" data-at="${v.archivedAt}">${vi ? 'Phục hồi' : 'Restore'}</button>
        </div>`,
      )
      .join('');

    historyList.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = (btn as HTMLElement).dataset.restore!;
        const at = Number((btn as HTMLElement).dataset.at);
        if (
          !confirm(
            vi
              ? `Phục hồi "${key}" về phiên bản lúc ${stamp(at)}? Giá trị hiện tại cũng được lưu lại nên có thể hoàn tác.`
              : `Restore "${key}" to its version from ${stamp(at)}? The current value is archived too, so this is undoable.`,
          )
        ) {
          return;
        }
        try {
          await remoteRestore(key, at);
          // Pull it back down so the local copy matches before the reload.
          await pullAndMerge(ctx.synced);
          msg.style.color = 'var(--accent)';
          msg.textContent = vi ? `Đã phục hồi "${key}". Đang tải lại…` : `Restored "${key}". Reloading…`;
          setTimeout(() => location.reload(), 900);
        } catch (e) {
          msg.style.color = 'var(--danger)';
          msg.textContent = (vi ? 'Phục hồi thất bại: ' : 'Restore failed: ') + String((e as Error)?.message ?? e);
        }
      });
    });
  }

  host.querySelector('#data-history')!.addEventListener('click', () => void showHistory());

  setTimeout(() => input.focus(), 30);
}
