/**
 * Settings & Guides — one page for everything that is not market data: the data on
 * this device and its sync, restoring the whole account to a moment, running and
 * deploying the website, and operating the scanner VM.
 *
 * The words live in `settingsGuide.ts`; this file draws them and runs the two live
 * panels (data & sync, restore to a moment).
 *
 * ── LAYOUT ──────────────────────────────────────────────────────────────────
 * A sticky table of contents on the left on a wide screen, a sticky strip of chips on
 * a narrow one. The TOC links are buttons that scroll, NOT `#anchors`: the hash is the
 * app's tab router (`#scanner`, `#settings`), and an anchor would be read as a tab.
 *
 * ── RESTORE TO A MOMENT ─────────────────────────────────────────────────────
 * Server time decides (`archived_at` is stamped by the server), so the moment typed
 * here is converted from this device's local time to an epoch and sent as is. The
 * preview is a dry run that lists sizes only; the restore then sends the ticked keys.
 * The moment to undo it is kept in sessionStorage so it survives the reload that follows.
 */
import type { AppContext } from '../context.js';
import { $ } from '../ui/dom.js';
import { getLang, setLang } from '../ui/i18n.js';
import { applyTheme } from '../ui/theme.js';
import { openSyncSettings, exportAllData } from '../ui/syncSettings.js';
import { openLlmSettings } from '../ui/llmSettings.js';
import { copyToClipboard } from '../ui/askChatGpt.js';
import { isSyncEnabled, remoteHistory, remoteRestoreAt, type RestoreAtChange } from '../adapters/syncClient.js';
import { pullAndMerge, isHydrated, isExpendableKey, isRebuildableCache } from '../adapters/storage.js';
import { say, type Bi } from './scannerGuide.js';
import { DEFAULT_RISK_LADDER } from '@screener/core';
import { currentRegime, ensureRegime, ladderConfig, loadPlaybookConfig, playbookConfig } from '../portfolio/playbook.js';
import { REGIME_DOC } from '../ui/playbookHelp.js';
import { openPlaybookSettingsHere } from '../ui/playbookSettings.js';
import { SECTIONS, GROUPS, WHERE, type GuideSection, type GuideStep } from './settingsGuide.js';

const UNDO_KEY = 'settings:lastRestore';

let pendingSection: string | null = null;
let observer: IntersectionObserver | null = null;
let ctxRef: AppContext | null = null;

/** Open the page scrolled to one section, e.g. `openSettingsAt('scan-trouble')`. */
export function openSettingsAt(id: string): void {
  pendingSection = id;
  const root = $('#tab-settings');
  if (root && !root.classList.contains('hidden') && root.childElementCount) {
    scrollToSection(id);
    pendingSection = null;
    return;
  }
  location.hash = '#settings'; // main.ts's hashchange handler switches tabs
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const vi = (): boolean => getLang() === 'vi';
const L = (en: string, viText: string): string => (vi() ? viText : en);

/** Backticked literals in the prose become <code>. The rest of the string is trusted
 * HTML from settingsGuide.ts (`<b>`, `<br>`), so only the code span is escaped. */
const prose = (b: Bi): string => say(b).replace(/`([^`]+)`/g, (_m, c: string) => `<code>${esc(c)}</code>`);

/** A command block: a bar naming where it runs, the copy button, and the command with its
 * `<PLACEHOLDERS>` picked out so nobody runs one unchanged. Copy reads the <pre> text. */
function cmdBlock(cmd: string, where?: GuideStep['where']): string {
  const lines = cmd.split('\n').length;
  const body = esc(cmd).replace(/&lt;([A-Z_]+)&gt;/g, '<span class="st-ph">&lt;$1&gt;</span>');
  return `<div class="st-cmd${where === 'crontab' ? ' st-cmd-cron' : ''}">
      <div class="st-cmd-bar">
        <span class="st-cmd-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="st-cmd-where">${where ? say(WHERE[where]) : 'bash'}</span>
        <span class="st-cmd-n">${lines > 1 ? L(`${lines} lines`, `${lines} dòng`) : ''}</span>
        <button class="st-copy" data-st-copy>${L('Copy', 'Chép')}</button>
      </div>
      <pre>${body}</pre>
    </div>`;
}

function stepHtml(s: GuideStep, i: number): string {
  return `<li class="st-step">
      <span class="st-num">${i + 1}</span>
      <div class="st-step-body">
        <div class="st-step-h">
          <h3>${say(s.h)}</h3>
          ${s.where && !s.cmd ? `<span class="st-where st-where-${s.where}">${say(WHERE[s.where])}</span>` : ''}
        </div>
        ${(s.p ?? []).map((p) => `<p>${prose(p)}</p>`).join('')}
        ${s.warn ? `<div class="st-warn">⚠ ${prose(s.warn)}</div>` : ''}
        ${s.cmd ? cmdBlock(s.cmd, s.where) : ''}
      </div>
    </li>`;
}

function sectionHtml(s: GuideSection): string {
  const panel = s.id === 'data' ? dataPanel() : s.id === 'restore' ? restorePanel() : s.id === 'playbook' ? playbookPanel() : '';
  return `<section class="card st-sec" id="st-${s.id}" data-st-sec="${s.id}">
      <header class="st-sec-head">
        <span class="st-sec-icon" aria-hidden="true">${s.icon}</span>
        <div>
          <div class="st-kicker">${say(GROUPS[s.group])}</div>
          <h2>${say(s.title)}</h2>
        </div>
      </header>
      <p class="st-lead">${prose(s.lead)}</p>
      ${panel}
      ${s.steps.length ? `<ol class="st-steps">${s.steps.map(stepHtml).join('')}</ol>` : ''}
      ${s.tip ? `<div class="st-tip">💡 ${prose(s.tip)}</div>` : ''}
    </section>`;
}

function tocHtml(): string {
  const groups = (Object.keys(GROUPS) as GuideSection['group'][])
    .map((g) => {
      const items = SECTIONS.filter((s) => s.group === g);
      return `<div class="st-toc-group">
          <div class="st-toc-gh">${say(GROUPS[g])}</div>
          ${items.map((s) => `<button class="st-toc-link" data-st-go="${s.id}"><span aria-hidden="true">${s.icon}</span>${say(s.title)}</button>`).join('')}
        </div>`;
    })
    .join('');
  return `<nav class="st-toc" aria-label="${L('Contents', 'Mục lục')}">
      <div class="st-toc-title">${L('Contents', 'Mục lục')}</div>
      ${groups}
    </nav>`;
}

// ── data & sync panel ────────────────────────────────────────────────────────

function dataPanel(): string {
  const on = isSyncEnabled();
  const state = !on
    ? `<span class="st-dot st-dot-off"></span>${L('Sync is off on this device — the data lives only here.', 'Thiết bị này chưa bật đồng bộ — dữ liệu chỉ nằm ở đây.')}`
    : isHydrated()
      ? `<span class="st-dot st-dot-on"></span>${L('Syncing — this device is up to date with the server.', 'Đang đồng bộ — thiết bị này khớp với server.')}`
      : `<span class="st-dot st-dot-wait"></span>${L('Connecting to the server…', 'Đang kết nối server…')}`;
  const light = document.documentElement.classList.contains('light');
  return `<div class="st-panel">
      <div class="st-status">${state}</div>
      <div class="st-actions">
        <button class="btn" data-st-act="sync">☁️ ${L('Sync & versions', 'Đồng bộ & phiên bản')}</button>
        <button class="btn-outline" data-st-act="export">⬇ ${L('Export backup', 'Xuất sao lưu')}</button>
        <button class="btn-outline" data-st-act="ai">✨ ${L('AI assistant', 'Trợ lý AI')}</button>
        <button class="btn-outline" data-st-act="theme">${light ? '🌙 ' + L('Dark theme', 'Giao diện tối') : '☀️ ' + L('Light theme', 'Giao diện sáng')}</button>
        <button class="btn-outline" data-st-act="lang">${vi() ? '🇬🇧 English' : '🇻🇳 Tiếng Việt'}</button>
      </div>
      <div class="st-msg" id="st-data-msg"></div>
    </div>`;
}

// ── playbook panel ───────────────────────────────────────────────────────────

/** The frame; `fillPlaybookPanel` puts the live numbers in once the config is read. */
function playbookPanel(): string {
  return `<div class="st-panel st-pb">
      <div class="st-pb-stats" id="st-pb-stats"><span class="muted">${L('Reading your settings…', 'Đang đọc cấu hình…')}</span></div>
      <div class="st-actions">
        <button class="btn" data-st-act="playbook">⚙ ${L('Open playbook settings', 'Mở cấu hình cẩm nang')}</button>
        <button class="btn-outline" data-st-act="learn">📘 ${L('Read the playbook', 'Đọc cẩm nang')}</button>
      </div>
    </div>`;
}

/** Four tiles: today's regime, risk per trade, the setups you changed, the other edits. */
async function fillPlaybookPanel(root: HTMLElement, ctx: AppContext): Promise<void> {
  const box = root.querySelector<HTMLElement>('#st-pb-stats');
  if (!box) return;
  await loadPlaybookConfig(ctx);
  // Cache only: drawing a page must not start a market-data download.
  const reg = currentRegime() ?? (await ensureRegime(ctx).catch(() => null));
  if (!box.isConnected) return;
  const cfg = playbookConfig();
  const ladder = ladderConfig();
  const setups = Object.keys(cfg.setups).filter((k) => Object.keys(cfg.setups[k as keyof typeof cfg.setups] ?? {}).length);
  const ladderEdits = (Object.keys(cfg.ladder) as (keyof typeof cfg.ladder)[])
    .filter((k) => JSON.stringify(cfg.ladder[k]) !== JSON.stringify(DEFAULT_RISK_LADDER[k])).length;
  const other = ladderEdits + Object.keys(cfg.gradeThresholds).length + (cfg.exitReasons?.length ?? 0);
  const doc = reg ? REGIME_DOC[reg.regime] : null;
  const tile = (k: string, v: string, sub: string, tone = 'var(--accent)'): string =>
    `<div class="st-pb-tile" style="--st-tone:${tone}"><span class="st-pb-k">${k}</span><b>${v}</b><span class="st-pb-s">${sub}</span></div>`;
  box.innerHTML = [
    tile(L('Market', 'Thị trường'), doc ? (vi() ? doc.vi : doc.en) : '—',
      reg ? L(`SPY, close of ${reg.asOf}`, `SPY, nến ngày ${reg.asOf}`) : L('Not measured yet: open Portfolio once', 'Chưa đo: mở Danh mục một lần'),
      doc?.color ?? 'var(--faint)'),
    tile(L('Risk per trade', 'Rủi ro mỗi lệnh'),
      cfg.pinnedRiskPct != null ? `${cfg.pinnedRiskPct}%` : `${ladder.learningPct}–${ladder.stablePct}%`,
      cfg.pinnedRiskPct != null ? L('Pinned by you', 'Bạn đã ghim') : L('Automatic, from your record', 'Tự động, theo thành tích'), 'var(--blue)'),
    tile(L('Setups changed', 'Thiết lập đã sửa'), String(setups.length),
      setups.length ? setups.join(' · ') : L('All on the book’s defaults', 'Tất cả theo mặc định của sách'), 'var(--danger)'),
    tile(L('Other edits', 'Chỉnh sửa khác'), String(other),
      L('Ladder, grade lines, exit reasons', 'Thang rủi ro, đường hạng, lý do thoát'), 'var(--violet)'),
  ].join('');
}

// ── restore panel ────────────────────────────────────────────────────────────

/** `Date` → the `YYYY-MM-DDTHH:mm` a datetime-local input takes, in local time. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const stamp = (ms: number): string =>
  new Date(ms).toLocaleString(vi() ? 'vi-VN' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

const kb = (n: number | null): string => (n == null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/** What a key is, in words, for the keys people actually lose. The raw key is shown too. */
function keyLabel(key: string): string {
  const named: Record<string, [string, string]> = {
    accounts: ['Portfolio', 'Portfolio'],
    wealth: ['Financial Status', 'Tình trạng tài chính'],
    wealth_sort: ['Financial Status · sort', 'Tình trạng tài chính · sắp xếp'],
    wealth_ccy: ['Financial Status · currency', 'Tình trạng tài chính · tiền tệ'],
    pf_playbook_cfg: ['Playbook settings', 'Cài đặt playbook'],
    ui_collapsed: ['Folded sections', 'Các mục đã thu gọn'],
  };
  const hit = named[key];
  if (hit) return vi() ? hit[1] : hit[0];
  if (key.startsWith('plan:')) return L(`Trade plan ${key.slice(5)}`, `Kế hoạch ${key.slice(5)}`);
  if (key.startsWith('watchlist')) return L('Watchlists', 'Danh sách theo dõi');
  if (key.startsWith('case')) return L('Case studies', 'Case studies');
  return '';
}

/** Caches the app rebuilds by itself: listed, but unticked, so a restore does not spend
 * itself on yesterday's market data. */
const isCache = (key: string): boolean =>
  isExpendableKey(key) || isRebuildableCache(key) || /^(scan:|calendar:|pf_bars:|pf_eurusd|sectorlabels|wealth_fx:)/.test(key);

function restorePanel(): string {
  if (!isSyncEnabled()) {
    return `<div class="st-panel"><div class="st-status"><span class="st-dot st-dot-off"></span>${L(
      'Needs sync: there is no server copy to restore from on this device.',
      'Cần bật đồng bộ: thiết bị này không có bản trên server để khôi phục.',
    )}</div></div>`;
  }
  let undo = '';
  try {
    const last = JSON.parse(sessionStorage.getItem(UNDO_KEY) ?? 'null') as { at: number; done: number; n: number } | null;
    if (last)
      undo = `<div class="st-undo">✅ ${L(
        `Restored ${last.n} item(s) to ${stamp(last.at)}. To undo, restore to`,
        `Đã khôi phục ${last.n} mục về ${stamp(last.at)}. Muốn hoàn tác, khôi phục về`,
      )} <b>${stamp(last.done - 1000)}</b>.
        <button class="btn-outline" data-st-undo="${last.done - 1000}">${L('Prepare undo', 'Chuẩn bị hoàn tác')}</button></div>`;
  } catch {
    /* sessionStorage unavailable: no undo hint, the restore still works */
  }
  return `<div class="st-panel st-restore">
      ${undo}
      <div class="st-rs-row">
        <label class="st-rs-label" for="st-at">${L('Moment (your local time)', 'Thời điểm (giờ địa phương)')}</label>
        <input class="field st-at" id="st-at" type="datetime-local" step="60" value="${toLocalInput(Date.now() - 3600_000)}">
        <button class="btn" id="st-preview">${L('Preview', 'Xem trước')}</button>
        <button class="btn-outline" id="st-suggest">🔎 ${L('Suggest moments', 'Gợi ý thời điểm')}</button>
      </div>
      <div id="st-quick"></div>
      <div id="st-result"></div>
    </div>`;
}

/** Recent overwrites of Portfolio and Financial Status, each offered as "one minute before". */
async function suggest(root: HTMLElement): Promise<void> {
  const box = root.querySelector<HTMLElement>('#st-quick')!;
  box.innerHTML = `<div class="muted st-msg">${L('Reading the version history…', 'Đang đọc lịch sử phiên bản…')}</div>`;
  try {
    const [a, w] = await Promise.all([remoteHistory('accounts', { lite: true }), remoteHistory('wealth', { lite: true })]);
    const rows = [a, w]
      .flatMap((list) =>
        // Newest first per key, so the version that REPLACED row i is row i-1; the shrink
        // ratio is what marks a loss (40 KB replaced by 300 B), not the timestamp.
        list.map((v, i) => ({ v, next: i > 0 ? list[i - 1]!.bytes : null })),
      )
      .sort((x, y) => y.v.archivedAt - x.v.archivedAt)
      .slice(0, 10);
    if (!rows.length) {
      box.innerHTML = `<div class="muted st-msg">${L('No overwrites recorded for Portfolio or Financial Status yet.', 'Chưa có lần ghi đè nào của Portfolio hay Financial Status.')}</div>`;
      return;
    }
    box.innerHTML = `<div class="st-quick-h">${L('Recent changes — pick one to go back to just before it:', 'Thay đổi gần đây — chọn một để quay về ngay trước nó:')}</div>
      <div class="st-quick">${rows
        .map(({ v, next }) => {
          const shrank = next != null && v.bytes > 0 && next < v.bytes * 0.5;
          return `<button class="st-qpick${shrank ? ' st-qpick-bad' : ''}" data-st-at="${v.archivedAt - 60_000}">
              <span class="st-qpick-k">${esc(keyLabel(v.key) || v.key)}</span>
              <span class="st-qpick-t">${stamp(v.archivedAt)}</span>
              <span class="st-qpick-s">${kb(v.bytes)}${next != null ? ` → ${kb(next)}` : ''}${shrank ? ` · ${L('shrank', 'tụt mạnh')}` : ''}</span>
            </button>`;
        })
        .join('')}</div>`;
    box.querySelectorAll<HTMLElement>('[data-st-at]').forEach((b) =>
      b.addEventListener('click', () => {
        setMoment(root, Number(b.dataset.stAt));
        void preview(root);
      }),
    );
  } catch (e) {
    box.innerHTML = `<div class="st-msg st-err">${esc(String((e as Error)?.message ?? e))}</div>`;
  }
}

/**
 * The input only holds minutes, but a quick pick or an undo knows the exact millisecond,
 * and for an undo the difference matters (the restore and the moment before it can sit
 * in the same minute). So the exact value rides along in `data-ms` until the user types.
 */
function setMoment(root: HTMLElement, ms: number): void {
  const input = root.querySelector<HTMLInputElement>('#st-at')!;
  input.value = toLocalInput(ms);
  input.dataset.ms = String(ms);
}

function chosenMoment(root: HTMLElement): number | null {
  const input = root.querySelector<HTMLInputElement>('#st-at');
  const exact = Number(input?.dataset.ms);
  const ms = Number.isFinite(exact) && exact > 0 ? exact : input?.value ? new Date(input.value).getTime() : NaN;
  return Number.isFinite(ms) && ms < Date.now() ? ms : null;
}

async function preview(root: HTMLElement): Promise<void> {
  const out = root.querySelector<HTMLElement>('#st-result')!;
  const at = chosenMoment(root);
  if (at == null) {
    out.innerHTML = `<div class="st-msg st-err">${L('Pick a moment in the past.', 'Chọn một thời điểm trong quá khứ.')}</div>`;
    return;
  }
  out.innerHTML = `<div class="muted st-msg">${L('Comparing with', 'Đang so với')} ${stamp(at)}…</div>`;
  let changes: RestoreAtChange[];
  try {
    changes = (await remoteRestoreAt(at, { dryRun: true })).changes ?? [];
  } catch (e) {
    out.innerHTML = `<div class="st-msg st-err">${esc(String((e as Error)?.message ?? e))}</div>`;
    return;
  }
  if (!changes.length) {
    out.innerHTML = `<div class="st-msg st-ok">${L(
      `Nothing differs from ${stamp(at)}: everything is already as it was then (items created since are kept).`,
      `Không có gì khác so với ${stamp(at)}: mọi thứ đã như lúc đó (những mục tạo sau vẫn giữ).`,
    )}</div>`;
    return;
  }
  // Data first, caches last; within each, the biggest drop first — that is the loss.
  changes.sort((x, y) => Number(isCache(x.key)) - Number(isCache(y.key)) || (y.thenBytes - (y.nowBytes ?? 0)) - (x.thenBytes - (x.nowBytes ?? 0)));
  const rows = changes
    .map((c) => {
      const lost = c.nowBytes == null || c.nowBytes < c.thenBytes * 0.5;
      const label = keyLabel(c.key);
      return `<tr class="${lost ? 'st-lost' : ''}">
          <td><input type="checkbox" data-st-key="${esc(c.key)}"${isCache(c.key) ? '' : ' checked'}></td>
          <td>${label ? `<b>${esc(label)}</b><div class="st-key">${esc(c.key)}</div>` : `<span class="st-key">${esc(c.key)}</span>`}</td>
          <td class="st-num-c">${kb(c.thenBytes)}</td>
          <td class="st-num-c">${c.nowBytes == null ? L('deleted', 'đã xoá') : kb(c.nowBytes)}</td>
          <td>${stamp(c.changedAt)}</td>
          <td class="st-num-c">${c.events}</td>
        </tr>`;
    })
    .join('');
  out.innerHTML = `<div class="st-prev-h">
        <b>${changes.length}</b> ${L(`item(s) differ from ${stamp(at)}.`, `mục khác với ${stamp(at)}.`)}
        <span class="muted">${L('Red = much smaller now, usually the loss. Caches start unticked.', 'Đỏ = bây giờ nhỏ hơn nhiều, thường là chỗ mất. Bộ nhớ đệm mặc định bỏ tick.')}</span>
      </div>
      <div class="st-prev-wrap"><table class="st-prev">
        <thead><tr><th><input type="checkbox" id="st-all" checked title="${L('All', 'Tất cả')}"></th><th>${L('Item', 'Mục')}</th><th>${L('Then', 'Lúc đó')}</th><th>${L('Now', 'Bây giờ')}</th><th>${L('First changed', 'Đổi lần đầu')}</th><th>${L('Changes', 'Số lần đổi')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="st-rs-go">
        <button class="btn st-danger" id="st-restore">⏪ ${L('Restore the ticked items', 'Khôi phục các mục đã tick')}</button>
        <span class="muted st-msg" id="st-count"></span>
      </div>`;
  const boxes = (): HTMLInputElement[] => Array.from(out.querySelectorAll<HTMLInputElement>('[data-st-key]'));
  const count = (): void => {
    const n = boxes().filter((b) => b.checked).length;
    out.querySelector('#st-count')!.textContent = L(`${n} ticked`, `${n} mục đã tick`);
    (out.querySelector('#st-restore') as HTMLButtonElement).disabled = n === 0;
  };
  out.querySelector<HTMLInputElement>('#st-all')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    boxes().forEach((b) => (b.checked = on));
    count();
  });
  boxes().forEach((b) => b.addEventListener('change', count));
  count();
  out.querySelector('#st-restore')!.addEventListener('click', () => void restore(root, at, boxes().filter((b) => b.checked).map((b) => b.dataset.stKey!)));
}

async function restore(root: HTMLElement, at: number, keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (
    !confirm(
      L(
        `Restore ${keys.length} item(s) to how they were at ${stamp(at)}?\n\nClose the app on your other devices first. The current values are archived, so this can be undone.`,
        `Khôi phục ${keys.length} mục về như lúc ${stamp(at)}?\n\nHãy đóng app trên các thiết bị khác trước. Giá trị hiện tại được lưu lại, nên có thể hoàn tác.`,
      ),
    )
  )
    return;
  const btn = root.querySelector<HTMLButtonElement>('#st-restore');
  if (btn) btn.disabled = true;
  const msg = root.querySelector<HTMLElement>('#st-count')!;
  msg.textContent = L('Restoring…', 'Đang khôi phục…');
  try {
    const r = await remoteRestoreAt(at, { keys });
    try {
      sessionStorage.setItem(UNDO_KEY, JSON.stringify({ at, done: r.updatedAt ?? Date.now(), n: r.restored ?? keys.length }));
    } catch {
      /* no undo hint; the restore itself is done */
    }
    // Bring the restored values down before the reload, as the one-key restore does.
    if (ctxRef) await pullAndMerge(ctxRef.synced);
    msg.className = 'st-msg st-ok';
    msg.textContent = L(`Restored ${r.restored ?? keys.length} item(s). Reloading…`, `Đã khôi phục ${r.restored ?? keys.length} mục. Đang tải lại…`);
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    msg.className = 'st-msg st-err';
    msg.textContent = L('Restore failed: ', 'Khôi phục thất bại: ') + String((e as Error)?.message ?? e);
    if (btn) btn.disabled = false;
  }
}

// ── page ─────────────────────────────────────────────────────────────────────

function scrollToSection(id: string): void {
  document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function markToc(root: HTMLElement, id: string): void {
  root.querySelectorAll<HTMLElement>('[data-st-go]').forEach((b) => {
    const on = b.dataset.stGo === id;
    b.classList.toggle('on', on);
    // Keep the active chip in view on the narrow layout, where the TOC scrolls sideways.
    if (on && window.matchMedia('(max-width: 900px)').matches) b.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
}

export function renderSettings(ctx: AppContext): void {
  const root = $('#tab-settings');
  if (!root) return;
  ctxRef = ctx;
  root.innerHTML = `
    <div class="st-hero">
      <h1>${L('Settings & Guides', 'Cài đặt & Hướng dẫn')}</h1>
      <p class="subtitle">${L(
        'Your data and its sync, restoring to a point in time, running and deploying the website, and keeping the scanner alive — step by step, every command one click from the clipboard.',
        'Dữ liệu và đồng bộ, khôi phục về một thời điểm, chạy và deploy trang web, giữ scanner hoạt động — từng bước một, mỗi lệnh chỉ một cú bấm là vào clipboard.',
      )}</p>
      <div class="st-hero-note">🔒 ${L(
        'No secret appears on this page. Anything in <code>&lt;ANGLE_BRACKETS&gt;</code> is a placeholder you replace; secrets are typed only where a command asks for them.',
        'Trang này không chứa secret nào. Mọi thứ trong <code>&lt;NGOẶC_NHỌN&gt;</code> là chỗ bạn thay bằng giá trị thật; secret chỉ gõ khi một lệnh hỏi.',
      )}</div>
    </div>
    <div class="st-layout">
      ${tocHtml()}
      <div class="st-body">${SECTIONS.map(sectionHtml).join('')}</div>
    </div>`;

  root.querySelectorAll<HTMLElement>('[data-st-go]').forEach((b) =>
    b.addEventListener('click', () => {
      scrollToSection(b.dataset.stGo!);
      markToc(root, b.dataset.stGo!);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-st-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      const text = b.closest('.st-cmd')?.querySelector('pre')?.textContent ?? '';
      if (!text) return;
      void copyToClipboard(text, b);
      b.closest('.st-cmd')?.classList.add('copied');
      setTimeout(() => b.closest('.st-cmd')?.classList.remove('copied'), 1800);
    }),
  );

  // Data & sync actions.
  const dataMsg = root.querySelector<HTMLElement>('#st-data-msg');
  root.querySelectorAll<HTMLElement>('[data-st-act]').forEach((b) =>
    b.addEventListener('click', async () => {
      switch (b.dataset.stAct) {
        case 'sync':
          openSyncSettings(ctx);
          break;
        case 'ai':
          void openLlmSettings(ctx);
          break;
        case 'theme':
          applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
          renderSettings(ctx);
          break;
        case 'lang':
          setLang(vi() ? 'en' : 'vi'); // main.ts re-renders the open page on a language change
          break;
        case 'playbook':
          void openPlaybookSettingsHere(ctx, () => void fillPlaybookPanel(root, ctx));
          break;
        case 'learn':
          location.hash = '#learn';
          break;
        case 'export':
          try {
            const n = await exportAllData(ctx);
            if (dataMsg) {
              dataMsg.className = 'st-msg st-ok';
              dataMsg.textContent = L(`Downloaded a backup of ${n} items.`, `Đã tải bản sao lưu ${n} mục.`);
            }
          } catch (e) {
            if (dataMsg) {
              dataMsg.className = 'st-msg st-err';
              dataMsg.textContent = String((e as Error)?.message ?? e);
            }
          }
          break;
      }
    }),
  );

  void fillPlaybookPanel(root, ctx);

  // Restore panel.
  root.querySelector('#st-preview')?.addEventListener('click', () => void preview(root));
  root.querySelector('#st-suggest')?.addEventListener('click', () => void suggest(root));
  const atInput = root.querySelector<HTMLInputElement>('#st-at');
  atInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void preview(root);
  });
  atInput?.addEventListener('input', () => delete atInput.dataset.ms);
  root.querySelector<HTMLElement>('[data-st-undo]')?.addEventListener('click', (e) => {
    const at = Number((e.currentTarget as HTMLElement).dataset.stUndo);
    setMoment(root, at);
    void preview(root);
  });

  // TOC follows the reading position: the section nearest the top is the current one.
  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      const top = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) markToc(root, (top.target as HTMLElement).dataset.stSec!);
    },
    { rootMargin: '-80px 0px -60% 0px' },
  );
  root.querySelectorAll('[data-st-sec]').forEach((s) => observer!.observe(s));
  markToc(root, SECTIONS[0]!.id);

  if (pendingSection) {
    const id = pendingSection;
    pendingSection = null;
    requestAnimationFrame(() => scrollToSection(id));
  }
}
