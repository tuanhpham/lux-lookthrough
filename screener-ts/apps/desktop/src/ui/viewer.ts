/**
 * Viewer mode in the app (CHAT-102): a sync code the admin shared a read-only view of their data
 * with. The server decides what that view holds; this file only draws the consequences — which
 * pages exist in the menus, where a link to a hidden page lands, and the reminder that nothing
 * typed here is saved.
 */
import { cachedShare } from '../adapters/storage.js';
import { getLang } from './i18n.js';

/** Settings stays reachable: it is where the sync code is changed or signed out. */
const ALWAYS = ['settings'];

export function isViewer(): boolean {
  return !!cachedShare();
}

export function pageAllowed(id: string): boolean {
  const s = cachedShare();
  return !s || ALWAYS.includes(id) || s.pages.includes(id);
}

/** Where a link to a page this viewer cannot see lands instead. */
export function firstAllowedPage(order: readonly string[]): string {
  return order.find((id) => pageAllowed(id) && !ALWAYS.includes(id)) ?? 'settings';
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The pill in the corner while viewing. */
export function paintViewerBar(): void {
  document.getElementById('viewer-bar')?.remove();
  const s = cachedShare();
  document.documentElement.classList.toggle('viewer', !!s);
  if (!s) return;
  const vi = getLang() === 'vi';
  const who = esc(s.ownerName || s.owner);
  const el = document.createElement('div');
  el.id = 'viewer-bar';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="vb-dot" aria-hidden="true">👁</span><span>${vi
    ? `Đang xem dữ liệu của <b>${who}</b> · chỉ đọc`
    : `Viewing <b>${who}</b>’s data · read-only`}</span>`;
  el.title = vi
    ? `${who} cho bạn xem ${s.pages.length} trang${s.accounts.length ? ` và ${s.accounts.length} tài khoản` : ''}. Thay đổi trên máy này không được lưu lên server và sẽ bị thay bằng dữ liệu của ${who} ở lần đồng bộ sau.`
    : `${who} shares ${s.pages.length} page(s)${s.accounts.length ? ` and ${s.accounts.length} account(s)` : ''} with you. Changes made here are not saved and are replaced by ${who}’s data on the next sync.`;
  document.body.appendChild(el);
}
