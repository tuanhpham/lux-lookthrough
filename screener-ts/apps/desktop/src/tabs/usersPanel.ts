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
import { getLang, t } from '../ui/i18n.js';
import { PAGES, PAGE_GROUPS } from '../ui/pages.js';
import type { AppContext } from '../context.js';
import { accounts, ensureAccountsLoaded } from '../portfolio/store.js';
import {
  adminClearShare,
  adminCreateUser,
  adminListUsers,
  adminRotateCode,
  adminSetShare,
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
/** The pages the server lets a user be given (its list wins; this is the fallback). */
let sharePages: string[] = ['calendar', 'picks', 'screener', 'sectors', 'scanner', 'watchlist', 'station', 'portfolio', 'casestudies', 'wealth', 'backtest', 'learn', 'about'];
/** The user whose view is being edited, and the ticks so far. */
let editing: { id: string; pages: Set<string>; accounts: Set<string> } | null = null;
let ctxRef: AppContext | null = null;

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
        <div class="st-us-name"><b>${esc(label)}</b><code>${esc(u.id)}</code>${badges}${shareChip(u)}</div>
        <div class="st-us-meta">${meta}</div>
      </div>
      <div class="st-us-acts">
        ${!u.you && !u.admin ? `<button class="btn-outline${editing?.id === u.id ? ' active' : ''}" data-us-share="${esc(u.id)}"${busy ? ' disabled' : ''}>👁 ${L('What they see', 'Quyền xem')}</button>` : ''}
        <button class="btn-outline" data-us-rotate="${esc(u.id)}"${busy ? ' disabled' : ''}>🔑 ${L('New code', 'Cấp mã mới')}</button>
      </div>
    </div>${editing?.id === u.id ? shareEditorHtml(u) : ''}`;
}

/** "👁 4 pages · 1 account" under a name, or nothing when nothing is shared. */
function shareChip(u: SyncUser): string {
  if (!u.share) return '';
  const n = u.share.accounts.length;
  return `<span class="st-us-tag st-us-share" title="${esc(u.share.pages.map((p) => t(`nav.${p}`)).join(', '))}">👁 ${L(
    `views ${u.share.pages.length} page${u.share.pages.length === 1 ? '' : 's'}${n ? ` · ${n} account${n === 1 ? '' : 's'}` : ''}`,
    `xem ${u.share.pages.length} trang${n ? ` · ${n} tài khoản` : ''}`)}</span>`;
}

/**
 * The view editor: tick the pages and the portfolio accounts this user may see of YOUR data.
 * Saving sends the ticks to the server, which is what enforces them; nothing is decided here.
 */
function shareEditorHtml(u: SyncUser): string {
  if (!editing) return '';
  const lang = vi() ? 'vi' : 'en';
  const groups = PAGE_GROUPS.map((g) => {
    const pages = PAGES.filter((p) => p.group === g.id && sharePages.includes(p.id));
    if (!pages.length) return '';
    return `<div class="st-sh-group"><div class="st-sh-gh">${esc(g.title[lang])}</div>${pages.map((p) =>
      `<label class="st-sh-opt"><input type="checkbox" data-sh-page="${p.id}"${editing!.pages.has(p.id) ? ' checked' : ''}> <span>${p.icon} ${esc(t(`nav.${p.id}`))}</span></label>`).join('')}</div>`;
  }).join('');
  const accts = accounts.length
    ? accounts.map((a) => `<label class="st-sh-opt"><input type="checkbox" data-sh-acct="${esc(a.account.id)}"${editing!.accounts.has(a.account.id) ? ' checked' : ''}> <span>💼 ${esc(a.account.name)} <small>${esc(a.account.currency)}</small></span></label>`).join('')
    : `<div class="muted">${L('No portfolio accounts on this device yet.', 'Máy này chưa có tài khoản Danh mục nào.')}</div>`;
  return `<div class="st-sh" data-sh-for="${esc(u.id)}">
      <div class="st-sh-h">👁 ${L(`What ${esc(u.name || u.id)} can see of your data`, `${esc(u.name || u.id)} được xem gì trong dữ liệu của bạn`)}</div>
      <p class="muted">${L(
        'Read-only. They see these pages with YOUR data, and in Portfolio, the Trade Station, Case Studies and Financial Status only the accounts ticked below. The server enforces it; their own data stays untouched and comes back when you stop sharing.',
        'Chỉ đọc. Họ xem các trang này với dữ liệu CỦA BẠN; ở Danh mục, Trạm, Case Study và Tình trạng tài chính chỉ thấy các tài khoản được tick bên dưới. Server kiểm soát quyền này; dữ liệu riêng của họ vẫn nguyên và quay lại khi bạn thôi chia sẻ.')}</p>
      <div class="st-sh-cols">
        <div><div class="st-sh-cap">${L('Pages', 'Trang')} <button type="button" class="stn-link" data-sh-all="1">${L('all', 'chọn hết')}</button> · <button type="button" class="stn-link" data-sh-all="0">${L('none', 'bỏ hết')}</button></div>${groups}</div>
        <div><div class="st-sh-cap">${L('Portfolio accounts', 'Tài khoản Danh mục')}</div>${accts}</div>
      </div>
      <div class="st-actions">
        <button class="btn" data-sh-save${busy ? ' disabled' : ''}>💾 ${L('Save what they see', 'Lưu quyền xem')}</button>
        ${u.share ? `<button class="btn-outline ui-btn danger" data-sh-stop${busy ? ' disabled' : ''}>${L('Stop sharing', 'Thôi chia sẻ')}</button>` : ''}
        <button class="btn-outline" data-sh-cancel>${L('Cancel', 'Huỷ')}</button>
      </div>
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
      if (r.pages?.length) sharePages = r.pages;
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
export function wireUsers(root: HTMLElement, first = true, ctx?: AppContext): void {
  const host = root.querySelector<HTMLElement>('.st-users');
  if (!host) return;
  if (ctx) ctxRef = ctx;

  host.querySelectorAll<HTMLButtonElement>('[data-us-share]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.dataset.usShare!;
      if (editing?.id === id) { editing = null; repaint(root); return; }
      if (ctxRef) await ensureAccountsLoaded(ctxRef).catch(() => {});
      const u = users?.find((x) => x.id === id);
      editing = { id, pages: new Set(u?.share?.pages ?? ['portfolio']), accounts: new Set(u?.share?.accounts ?? []) };
      repaint(root);
    }),
  );
  const ed = host.querySelector<HTMLElement>('.st-sh');
  ed?.querySelectorAll<HTMLInputElement>('[data-sh-page]').forEach((c) =>
    c.addEventListener('change', () => { if (c.checked) editing?.pages.add(c.dataset.shPage!); else editing?.pages.delete(c.dataset.shPage!); }));
  ed?.querySelectorAll<HTMLInputElement>('[data-sh-acct]').forEach((c) =>
    c.addEventListener('change', () => { if (c.checked) editing?.accounts.add(c.dataset.shAcct!); else editing?.accounts.delete(c.dataset.shAcct!); }));
  ed?.querySelectorAll<HTMLElement>('[data-sh-all]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!editing) return;
      editing.pages = b.dataset.shAll === '1' ? new Set(sharePages) : new Set();
      repaint(root);
    }));
  ed?.querySelector('[data-sh-cancel]')?.addEventListener('click', () => { editing = null; repaint(root); });
  ed?.querySelector('[data-sh-save]')?.addEventListener('click', () => {
    if (!editing) return;
    if (!editing.pages.size) { msg = { err: true, text: L('Tick at least one page.', 'Tick ít nhất một trang.') }; repaint(root); return; }
    const { id, pages, accounts: acc } = editing;
    void act(root, async () => {
      await adminSetShare(id, [...pages], [...acc]);
      editing = null;
      msg = { err: false, text: L('Saved. They see it the next time their app syncs (opening it, or coming back to it).', 'Đã lưu. Họ sẽ thấy ở lần app của họ đồng bộ tới (khi mở app hoặc quay lại app).') };
    });
  });
  ed?.querySelector('[data-sh-stop]')?.addEventListener('click', () => {
    if (!editing) return;
    const { id } = editing;
    const u = users?.find((x) => x.id === id);
    if (!confirm(L(`Stop sharing your data with ${u?.name || id}? Their own data comes back on their next sync.`, `Thôi chia sẻ dữ liệu với ${u?.name || id}? Dữ liệu riêng của họ sẽ quay lại ở lần đồng bộ sau.`))) return;
    void act(root, async () => {
      await adminClearShare(id);
      editing = null;
      msg = { err: false, text: L('Sharing stopped.', 'Đã thôi chia sẻ.') };
    });
  });

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
