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
import {
  pullAndMerge,
  isHydrated,
  syncActivity,
  isQuotaError,
  isExpendableKey,
  isRebuildableCache,
  isDeviceBookkeeping,
  claimAsDeliberate,
} from '../adapters/storage.js';
import { deriveSyncStatus } from '@screener/core';
import { getLang } from './i18n.js';
import { openSettingsAt } from '../tabs/settingsTab.js';

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
export async function exportAllData(ctx: AppContext): Promise<number> {
  // The sync code stays out of the file: a backup is something people email to themselves.
  const keys = (await ctx.storage.list('')).filter((k) => !isDeviceBookkeeping(k));
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

/** What an import did, so the message can say what was left out and why. */
interface ImportResult {
  restored: number;
  /** Price bars and FX the device will fetch again by itself. */
  cachesSkipped: number;
  /** Past scan / calendar days that did not fit on this device. */
  daysDropped: number;
}

/**
 * Restore a backup file into local storage. Writes each key through the normal
 * Storage.set so values are re-stamped "now" — the freshly restored data then
 * wins last-write-wins and pushes up once a valid sync code is set again.
 * Throws on a malformed file, or when the account's own data does not fit.
 *
 * ── WHY THE ORDER, AND WHY CACHES ARE SKIPPED ───────────────────────────────
 * The first version wrote the file top to bottom and stopped at the first error. A full export
 * is mostly `pf_bars:` price history, so on a browser near its ~5 MB limit the import died on
 * "exceeded the quota" part-way through — before it reached `accounts`. Now: rebuildable market
 * data is not written at all, the user's own data goes first, and only then the day-stamped
 * scan / calendar history, best-effort, newest first — the same order the sync merge uses.
 */
async function importAllData(ctx: AppContext, text: string): Promise<ImportResult> {
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (!parsed || parsed.format !== 'screener-backup' || typeof parsed.data !== 'object' || !parsed.data) {
    throw new Error('not a screener backup file');
  }
  const all = Object.entries(parsed.data).filter(([k]) => !isDeviceBookkeeping(k));
  const wanted = all.filter(([k]) => !isRebuildableCache(k));
  const essential = wanted.filter(([k]) => !isExpendableKey(k));
  const optional = wanted.filter(([k]) => isExpendableKey(k)).sort((a, b) => b[0].localeCompare(a[0]));

  const written: string[] = [];
  let purged = false;
  for (const [key, value] of essential) {
    try {
      await ctx.storage.set(key, value);
    } catch (e) {
      if (!isQuotaError(e) || purged) throw e;
      // Out of room: this device's own caches go (local layer only, never a remote delete).
      purged = true;
      await ctx.synced.purgeLocalCaches().catch(() => 0);
      await ctx.storage.set(key, value);
    }
    written.push(key);
  }
  let daysDropped = 0;
  for (const [key, value] of optional) {
    try {
      await ctx.storage.set(key, value);
      written.push(key);
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      daysDropped++;
    }
  }
  claimAsDeliberate(written);
  return { restored: written.length, cachesSkipped: all.length - wanted.length, daysDropped };
}

/**
 * The current sync state, in words, at the top of this dialog.
 *
 * Why it is here and not only in the pill: on a phone the pill is a bare coloured
 * dot. The label is hidden for want of room in the top bar and there is no hover,
 * so a tooltip cannot be read at all — which is exactly how "it is green on the
 * laptop and grey on my phone" became unanswerable. Tapping the dot opens this
 * dialog, so this is the one place a phone can be told what the dot means.
 */
function stateLineHtml(vi: boolean): string {
  const a = syncActivity();
  const view = deriveSyncStatus({
    hasCode: !!getSyncCode(),
    hydrated: isHydrated(),
    queued: a.queued,
    lastPushAt: a.lastPushAt,
    lastError: a.lastError,
    pullError: a.pullError,
  });
  const TONE: Record<string, string> = {
    ok: 'var(--accent)',
    pending: 'var(--faint)',
    off: 'var(--warn)',
    error: 'var(--danger)',
  };
  const time =
    a.lastPushAt !== null
      ? new Date(a.lastPushAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : null;
  let head: string;
  let detail: string;
  if (view.phase === 'off') {
    head = vi ? 'Chỉ lưu trên máy này' : 'Local only';
    detail = vi
      ? 'Máy này chưa có mã truy cập nên chưa sync gì lên. Nhập mã bên dưới rồi bấm “Lưu & sync”.'
      : 'This device has no access code, so nothing is uploaded. Enter the code below and press “Save & Sync”.';
  } else if (a.pullError) {
    head = vi ? 'Không sync được' : 'Not syncing';
    detail =
      (vi
        ? 'Không tải được dữ liệu từ server nên mọi thay đổi trên máy này đang chờ. App sẽ tự thử lại; lý do: '
        : 'The download from the server failed, so every change on this device is waiting. The app keeps retrying; reason: ') +
      a.pullError;
  } else if (a.lastError) {
    head = vi ? 'Chưa lưu được' : 'Not saved';
    detail =
      (vi ? 'Có một thay đổi chưa gửi lên được. Lý do: ' : 'A change could not be uploaded. Reason: ') +
      a.lastError;
  } else if (view.phase === 'pending') {
    head = vi ? 'Đang sync…' : 'Syncing…';
    detail = vi
      ? 'Đang tải dữ liệu về. Xong là gửi các thay đổi lên ngay.'
      : 'Downloading your data. Changes are uploaded as soon as it lands.';
  } else {
    head = vi ? 'Đã sync' : 'Synced';
    detail = time
      ? (vi ? 'Gửi lên lần cuối: ' : 'Last upload: ') + time
      : vi
        ? 'Từ lúc mở app, máy này chưa thay đổi gì.'
        : 'Nothing has changed on this device this session.';
  }
  return `
    <div style="display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;padding:9px 11px;
                border:1px solid var(--border);border-radius:10px;background:var(--card)">
      <span style="width:8px;height:8px;border-radius:999px;flex:0 0 auto;margin-top:5px;
                   background:${TONE[view.phase]}"></span>
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;
                    color:${TONE[view.phase]}">${head}</div>
        <div class="muted" style="font-size:12px;line-height:1.5;margin-top:2px;overflow-wrap:anywhere">${detail}</div>
      </div>
    </div>`;
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
        <div>${vi ? '☁️ Sync thiết bị' : '☁️ Device Sync'}</div>
        <button class="sync-x" aria-label="Close">×</button>
      </div>
      <div class="modal-body" style="padding:16px">
        ${stateLineHtml(vi)}
        <p class="muted" style="font-size:13px;line-height:1.6;margin-top:0">
          ${
            vi
              ? 'Nhập mã truy cập để sync Watchlist, bài viết và tài khoản giả lập giữa các thiết bị. Để trống nếu chỉ muốn lưu trên máy này.'
              : 'Enter your access code to sync watchlists, posts and paper-trading accounts across every device. Leave empty to keep data only on this device.'
          }
        </p>
        <label class="field-label">${vi ? 'Mã truy cập' : 'Access code'}</label>
        <input id="sync-code-input" class="field" style="width:100%" type="password"
          autocomplete="off" spellcheck="false" value="${existing.replace(/"/g, '&quot;')}"
          placeholder="${vi ? 'dán mã vào đây' : 'paste your code'}" />
        <div id="sync-msg" class="muted" style="font-size:12px;min-height:18px;margin:8px 0"></div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:4px">
          ${existing ? `<button id="sync-clear" class="btn-outline" style="margin-right:auto">${vi ? 'Đăng xuất' : 'Sign out'}</button>` : ''}
          <button id="sync-cancel" class="btn-outline">${vi ? 'Hủy' : 'Cancel'}</button>
          <button id="sync-save" class="btn">${vi ? 'Lưu & sync' : 'Save & Sync'}</button>
        </div>
        <div style="border-top:1px solid var(--border, #2a2a2a);margin-top:16px;padding-top:14px">
          <div class="field-label" style="margin-bottom:6px">${vi ? 'Sao lưu offline' : 'Offline backup'}</div>
          <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">
            ${
              vi
                ? 'Xuất toàn bộ dữ liệu trên máy này ra file (không cần mã sync). Dùng “Nhập” để khôi phục trên máy khác.'
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
          <div class="field-label" style="margin-bottom:6px">${vi ? 'Khôi phục bản cũ' : 'Recover an older version'}</div>
          <p class="muted" style="font-size:12px;line-height:1.5;margin:0 0 10px">
            ${
              vi
                ? 'Mỗi khi một mục bị ghi đè hay xoá, server giữ lại giá trị cũ. Lỡ mất dữ liệu sau khi sync thì tìm ở đây và bấm Khôi phục.'
                : 'Whenever an item is overwritten or deleted, the server keeps the old value. If data vanished after a sync, find it here and press Restore.'
            }
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="data-history" class="btn-outline">${vi ? '🕘 Xem các bản cũ' : '🕘 Browse versions'}</button>
            <button id="data-restore-at" class="btn-outline">${vi ? '⏪ Đưa mọi thứ về một thời điểm' : '⏪ Restore everything to a moment'}</button>
          </div>
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
    msg.textContent = vi ? 'Đã đăng xuất. Dữ liệu trên máy vẫn giữ nguyên.' : 'Signed out. Local data is kept.';
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
    const pulling = vi ? 'Đang tải dữ liệu…' : 'Pulling your data…';
    msg.textContent = pulling;
    try {
      // `freshCode` matters: this device has been running WITHOUT a code, so its
      // local defaults carry "now" timestamps that would beat the account's real
      // data under last-write-wins. Signing in must download, never overwrite.
      //
      // The progress counter is not decoration. This message used to be the last
      // thing a phone ever showed: the merge could be slow (it was quadratic in the
      // number of keys) or could throw (the storage quota), and either way the
      // dialog said "Pulling your data…" forever with the reason nowhere on screen.
      const n = await pullAndMerge(ctx.synced, {
        freshCode: true,
        onProgress: ({ phase, done, total }) => {
          if (!total) return;
          const what = phase === 'down' ? (vi ? 'tải về' : 'download') : vi ? 'gửi lên' : 'upload';
          msg.textContent = `${pulling} ${what} ${done}/${total}`;
        },
      });
      msg.style.color = 'var(--accent)';
      msg.textContent =
        (res.name ? `${vi ? 'Xin chào' : 'Hi'} ${res.name}. ` : '') +
        (vi ? `Đã sync ${n} mục.` : `Synced ${n} item(s).`);
      onSyncedCb?.();
      setTimeout(close, 900);
    } catch (e) {
      // The code itself was accepted (verifyCode passed), so this is the transport
      // or the device's own storage. Name it: the difference between "no answer
      // after 25s" and a quota error decides what the user should do next.
      msg.style.color = 'var(--danger)';
      msg.textContent =
        (vi ? 'Không tải được dữ liệu: ' : 'Could not pull your data: ') +
        String((e as Error)?.message ?? e) +
        (vi ? ' — đã lưu mã, app sẽ tự thử lại.' : ' — the code is saved; the app keeps retrying.');
    }
  });

  // ── Offline backup: export / import (works without a sync code) ─────────────
  host.querySelector('#data-export')!.addEventListener('click', async () => {
    try {
      msg.style.color = 'var(--faint)';
      msg.textContent = vi ? 'Đang xuất…' : 'Exporting…';
      const n = await exportAllData(ctx);
      msg.style.color = 'var(--accent)';
      msg.textContent = vi ? `Đã xuất ${n} mục ra file.` : `Exported ${n} item(s) to a file.`;
    } catch (e) {
      msg.style.color = 'var(--danger)';
      msg.textContent = (vi ? 'Xuất lỗi: ' : 'Export failed: ') + String((e as Error)?.message ?? e);
    }
  });

  const fileInput = host.querySelector('#data-import-file') as HTMLInputElement;
  host.querySelector('#data-import')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const ok = confirm(
      vi
        ? 'Mục nào trùng key sẽ bị ghi đè bằng dữ liệu trong file. Tiếp tục?'
        : 'Import will overwrite matching keys with the file’s data. Continue?',
    );
    if (!ok) {
      fileInput.value = '';
      return;
    }
    try {
      msg.style.color = 'var(--faint)';
      msg.textContent = vi ? 'Đang nhập…' : 'Importing…';
      const r = await importAllData(ctx, await file.text());
      msg.style.color = 'var(--accent)';
      msg.textContent = vi
        ? `Đã khôi phục ${r.restored} mục` +
          (r.cachesSkipped ? ` (bỏ qua ${r.cachesSkipped} mục dữ liệu giá — app tự tải lại)` : '') +
          (r.daysDropped ? `, ${r.daysDropped} ngày scan/lịch cũ bị bỏ vì hết chỗ` : '') +
          '. Đang tải lại…'
        : `Restored ${r.restored} item(s)` +
          (r.cachesSkipped ? ` (skipped ${r.cachesSkipped} price-data item(s) — the app refetches them)` : '') +
          (r.daysDropped ? `, ${r.daysDropped} old scan/calendar day(s) did not fit` : '') +
          '. Reloading…';
      onSyncedCb?.();
      // Long enough to read what was skipped.
      setTimeout(() => location.reload(), 2500);
    } catch (e) {
      msg.style.color = 'var(--danger)';
      msg.textContent = (vi ? 'Nhập lỗi: ' : 'Import failed: ') + String((e as Error)?.message ?? e);
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
      return `${Object.keys(value as object).length} ${vi ? 'key' : 'keys'}`;
    }
    return String(value).slice(0, 40);
  }

  const stamp = (ms: number): string => new Date(ms).toLocaleString();

  async function showHistory(): Promise<void> {
    if (!getSyncCode()) {
      msg.style.color = 'var(--danger)';
      msg.textContent = vi ? 'Nhập mã truy cập trước đã.' : 'Enter your access code first.';
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
                 ? `Server chưa có bản cũ nào (lịch sử chỉ ghi từ bản cập nhật này). Nhưng máy này có một bản snapshot lúc <b>${stamp(
                     snap.at,
                   )}</b> gồm ${Object.keys(snap.data).length} mục.`
                 : `The server has no older versions yet (history records from this fix onward). This device does have a local snapshot from <b>${stamp(
                     snap.at,
                   )}</b> with ${Object.keys(snap.data).length} item(s).`
             }
           </div>
           <button id="snap-restore" class="btn-outline" style="margin-top:8px;font-size:11px;padding:5px 10px">
             ${vi ? 'Khôi phục snapshot trên máy' : 'Restore local snapshot'}
           </button>`
        : `<div class="muted" style="font-size:12px">${
            vi
              ? 'Chưa lưu bản cũ nào. Lịch sử chỉ bắt đầu ghi từ khi bản cập nhật này lên server.'
              : 'No versions stored yet. History only records from this fix onward.'
          }</div>`;
      historyList.querySelector('#snap-restore')?.addEventListener('click', async () => {
        if (
          !snap ||
          !confirm(
            vi
              ? `Ghi ${Object.keys(snap.data).length} mục từ snapshot lúc ${stamp(snap.at)} đè lên dữ liệu hiện tại?`
              : `Write ${Object.keys(snap.data).length} item(s) from the ${stamp(snap.at)} snapshot over the current data?`,
          )
        ) {
          return;
        }
        // Routed through storage.set, so each value is re-stamped "now" and wins
        // last-write-wins — the same path the file import uses.
        for (const [key, value] of Object.entries(snap.data)) await ctx.storage.set(key, value);
        msg.style.color = 'var(--accent)';
        msg.textContent = vi ? 'Đã khôi phục snapshot. Đang tải lại…' : 'Snapshot restored. Reloading…';
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
            data-restore="${v.key}" data-at="${v.archivedAt}">${vi ? 'Khôi phục' : 'Restore'}</button>
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
              ? `Khôi phục "${key}" về bản lúc ${stamp(at)}? Giá trị hiện tại cũng được giữ lại nên vẫn hoàn tác được.`
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
          msg.textContent = vi ? `Đã khôi phục "${key}". Đang tải lại…` : `Restored "${key}". Reloading…`;
          setTimeout(() => location.reload(), 900);
        } catch (e) {
          msg.style.color = 'var(--danger)';
          msg.textContent = (vi ? 'Khôi phục lỗi: ' : 'Restore failed: ') + String((e as Error)?.message ?? e);
        }
      });
    });
  }

  host.querySelector('#data-history')!.addEventListener('click', () => void showHistory());
  host.querySelector('#data-restore-at')!.addEventListener('click', () => {
    close();
    openSettingsAt('restore');
  });

  setTimeout(() => input.focus(), 30);
}
