/**
 * Settings & Guides › Data › "Users & sync codes": the admin's list of who has a
 * sync code, plus "new user" and "new code". Admins are the ids in SCANNER_ADMIN.
 *
 * A code is on screen exactly once — in the box that follows the action that made
 * it. It lives in this module's memory until "Saved, close" and is never written to
 * storage; the server keeps only a hash, so nothing can show it again. What this
 * panel cannot do on purpose: delete a user or make someone an admin. Both stay
 * behind wrangler, outside the reach of a leaked sync code.
 */
import { getLang } from '../ui/i18n.js';
import {
  adminCreateUser,
  adminListUsers,
  adminRotateCode,
  isSyncEnabled,
  syncWhoami,
  type SyncUser,
} from '../adapters/syncClient.js';

const vi = (): boolean => getLang() === 'vi';
const L = (en: string, viText: string): string => (vi() ? viText : en);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

let me: Awaited<ReturnType<typeof syncWhoami>> | null = null;
let users: SyncUser[] | null = null;
let hashedNow = 0;
/** The one-time view of a code. Cleared by "Saved, close" or by leaving the app. */
let reveal: { id: string; name: string | null; code: string; kind: 'new' | 'rotate'; self: boolean } | null = null;
let msg: { err: boolean; text: string } | null = null;
let busy = false;

function stateHtml(): string {
  if (!isSyncEnabled()) {
    return `<span class="st-dot st-dot-off"></span>${L('Turn on sync (☁️) first: users live on the sync server.', 'Bật sync (☁️) trước: người dùng nằm trên server sync.')}`;
  }
  if (!me) return `<span class="st-dot st-dot-wait"></span>${L('Checking with the server…', 'Đang hỏi server…')}`;
  if (!me.ok) return `<span class="st-dot st-dot-off"></span>${L('Server did not answer', 'Server không trả lời')}: ${esc(me.error ?? '')}`;
  const you = `<code class="st-vm-you">${esc(me.id ?? '')}</code>`;
  if (me.admin === undefined) {
    return `<span class="st-dot st-dot-off"></span>${L('The server is older than this page — deploy again.', 'Server còn bản cũ hơn trang này — deploy lại.')}`;
  }
  if (!me.admins) {
    return `<span class="st-dot st-dot-off"></span>${L(
      `Off: the server has no SCANNER_ADMIN yet. Your id is ${you} — step 1 below.`,
      `Đang tắt: server chưa có SCANNER_ADMIN. Id của bạn là ${you} — xem bước 1 bên dưới.`,
    )}`;
  }
  if (!me.admin) {
    return `<span class="st-dot st-dot-off"></span>${L(
      `Only an admin manages users, and this sync code (id ${you}) is not one.`,
      `Chỉ admin mới quản lý người dùng, và mã sync này (id ${you}) không phải admin.`,
    )}`;
  }
  const n = users?.length;
  return `<span class="st-dot st-dot-on"></span>${n == null
    ? L('Admin — loading the list…', 'Admin — đang tải danh sách…')
    : L(`Admin · ${n} user${n === 1 ? '' : 's'}`, `Admin · ${n} người dùng`)}`;
}

const kb = (b: number): string => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function ago(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return L('just now', 'vừa xong');
  if (m < 60) return L(`${m} min ago`, `${m} phút trước`);
  const h = Math.round(m / 60);
  if (h < 48) return L(`${h} h ago`, `${h} giờ trước`);
  return L(`${Math.round(h / 24)} days ago`, `${Math.round(h / 24)} ngày trước`);
}

/** D1's datetime('now') is UTC without a zone: `2026-10-03 09:15:00`. */
function day(s: string): string {
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(vi() ? 'vi-VN' : 'en-GB');
}

function rowHtml(u: SyncUser): string {
  const label = u.name || u.id;
  const badges = [
    u.you ? `<span class="st-us-tag st-us-you">${L('You', 'Bạn')}</span>` : '',
    u.admin ? `<span class="st-us-tag st-us-admin">Admin</span>` : '',
  ].join('');
  const meta = [
    `${L('Created', 'Tạo')} ${esc(day(u.createdAt))}`,
    u.lastWrite ? `${L('Last sync', 'Sync gần nhất')} ${ago(u.lastWrite)}` : L('Never synced', 'Chưa sync lần nào'),
    `${u.keys} ${L('items', 'mục')} · ${kb(u.bytes)}`,
  ].join(' · ');
  return `<div class="st-us-row">
      <span class="st-us-av" aria-hidden="true">${esc(label.slice(0, 1).toUpperCase())}</span>
      <div class="st-us-main">
        <div class="st-us-name"><b>${esc(label)}</b><code>${esc(u.id)}</code>${badges}</div>
        <div class="st-us-meta">${meta}</div>
      </div>
      <button class="btn-outline" data-us-rotate="${esc(u.id)}"${busy ? ' disabled' : ''}>🔑 ${L('New code', 'Cấp mã mới')}</button>
    </div>`;
}

function revealHtml(): string {
  if (!reveal) return '';
  const who = `<b>${esc(reveal.name || reveal.id)}</b> <code>${esc(reveal.id)}</code>`;
  const head = reveal.kind === 'new' ? L(`New user ${who} — their sync code`, `Đã tạo ${who} — mã sync của người này`) : L(`New code for ${who}`, `Mã mới cho ${who}`);
  const after = reveal.self
    ? L('This device already switched to it. Type it into ☁️ on your other devices.', 'Máy này đã tự chuyển sang mã mới. Các máy khác của bạn: nhập mã này vào ô ☁️.')
    : reveal.kind === 'rotate'
      ? L('The old code stopped working just now. Their data is untouched.', 'Mã cũ vừa ngừng hoạt động. Dữ liệu của họ vẫn nguyên.')
      : L('They type it into the ☁️ box on each of their devices.', 'Người đó nhập mã vào ô ☁️ trên từng thiết bị của họ.');
  return `<div class="st-us-reveal" role="alert">
      <div class="st-us-rv-h">🔑 ${head}</div>
      <div class="st-us-code"><code id="st-us-code">${esc(reveal.code)}</code><button class="btn" data-us-copy>${L('Copy', 'Copy')}</button></div>
      <p>${after}</p>
      <p class="st-us-once">⚠ ${L(
        'Shown this once only — the server keeps a hash, not the code. Send it through a private channel. Lost it? Issue a new code.',
        'Chỉ hiện một lần — server chỉ giữ bản băm, không giữ mã. Gửi qua kênh riêng tư. Mất mã thì cấp mã mới.',
      )}</p>
      <button class="btn-outline" data-us-done>${L('Saved — close', 'Đã lưu — đóng lại')}</button>
    </div>`;
}

export function usersPanel(): string {
  const admin = !!(me?.ok && me.admin);
  const dis = busy ? ' disabled' : '';
  return `<div class="st-panel st-users">
      <div class="st-status">${stateHtml()}</div>
      ${revealHtml()}
      ${admin && users ? `<div class="st-us-list">${users.map(rowHtml).join('')}</div>` : ''}
      ${admin ? `<form class="st-us-new" autocomplete="off">
          <div class="st-us-new-h">➕ ${L('New user', 'Thêm người dùng')}</div>
          <label><span>Id</span><input class="field" name="id" maxlength="32" pattern="[A-Za-z0-9_\\-]{1,32}" placeholder="${L('e.g. bo', 'vd. bo')}" required${dis}></label>
          <label><span>${L('Name', 'Tên')}</span><input class="field" name="name" maxlength="60" placeholder="${L('shown in the app', 'hiện trong app')}"${dis}></label>
          <button class="btn" type="submit"${dis}>${L('Create + make a code', 'Tạo + sinh mã')}</button>
          <small>${L('Id: letters, digits, _ or -, cannot be changed later.', 'Id: chữ, số, _ hoặc -, không đổi được về sau.')}</small>
        </form>` : ''}
      ${hashedNow ? `<div class="st-msg">🔒 ${L(`${hashedNow} code(s) still stored as typed were hashed just now.`, `Vừa băm ${hashedNow} mã cũ còn lưu dạng chữ thường.`)}</div>` : ''}
      ${msg ? `<div class="st-msg${msg.err ? ' st-err' : ''}">${esc(msg.text)}</div>` : ''}
    </div>`;
}

function repaint(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('.st-users');
  if (!host) return;
  host.outerHTML = usersPanel();
  wireUsers(root, false);
}

async function load(root: HTMLElement): Promise<void> {
  me = await syncWhoami();
  if (me.ok && me.admin) {
    try {
      const r = await adminListUsers();
      users = r.users;
      hashedNow = r.hashedNow;
    } catch (e) {
      msg = { err: true, text: String((e as Error)?.message ?? e) };
    }
  }
  repaint(root);
}

async function act(root: HTMLElement, run: () => Promise<void>): Promise<void> {
  busy = true;
  msg = null;
  hashedNow = 0;
  repaint(root);
  try {
    await run();
    users = (await adminListUsers()).users;
  } catch (e) {
    msg = { err: true, text: String((e as Error)?.message ?? e) };
  }
  busy = false;
  repaint(root);
}

/** `first`: also ask the server who we are and fetch the list. */
export function wireUsers(root: HTMLElement, first = true): void {
  const host = root.querySelector<HTMLElement>('.st-users');
  if (!host) return;

  host.querySelectorAll<HTMLButtonElement>('[data-us-rotate]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.usRotate!;
      const u = users?.find((x) => x.id === id);
      const name = u?.name || id;
      const ask = u?.you
        ? L(
            'Replace YOUR sync code? This device switches to the new one by itself; every other device of yours must type it in.',
            'Đổi mã sync của CHÍNH BẠN? Máy này tự chuyển sang mã mới; mọi máy khác của bạn phải nhập lại mã.',
          )
        : L(
            `Issue a new code for ${name}? The old one stops working at once, on every device they use.`,
            `Cấp mã mới cho ${name}? Mã cũ ngừng hoạt động ngay, trên mọi thiết bị của người này.`,
          );
      if (!confirm(ask)) return;
      void act(root, async () => {
        const r = await adminRotateCode(id);
        reveal = { id, name: u?.name ?? null, code: r.code, kind: 'rotate', self: r.self };
      });
    }),
  );

  host.querySelector<HTMLFormElement>('.st-us-new')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const id = (f.elements.namedItem('id') as HTMLInputElement).value.trim();
    const name = (f.elements.namedItem('name') as HTMLInputElement).value.trim();
    void act(root, async () => {
      const r = await adminCreateUser(id, name);
      reveal = { id: r.id, name: r.name, code: r.code, kind: 'new', self: false };
    });
  });

  host.querySelector('[data-us-copy]')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    void navigator.clipboard?.writeText(reveal?.code ?? '').then(() => {
      b.textContent = L('Copied ✓', 'Đã copy ✓');
    });
  });
  host.querySelector('[data-us-done]')?.addEventListener('click', () => {
    reveal = null;
    repaint(root);
  });

  if (first && isSyncEnabled()) void load(root);
}
