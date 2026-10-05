/**
 * Settings & Guides — one page for everything that is not market data: the data on
 * this device and its sync, restoring the whole account to a moment, running and
 * deploying the website, and operating the scanner VM.
 *
 * The words live in `settingsGuide.ts`; this file draws them and runs the two live
 * panels (data & sync, restore to a moment).
 *
 * ── LAYOUT ──────────────────────────────────────────────────────────────────
 * A hero with status tiles (sync, colour, alerts, the VM…), then a sticky contents
 * column that works as TABS: one section is on screen at a time, with previous/next
 * at its foot, instead of fifteen cards in one endless scroll. Every section is still
 * in the DOM (hidden), so each live panel is wired once and keeps its state while the
 * user looks elsewhere. The open section survives a reload in sessionStorage.
 * The TOC links are buttons, NOT `#anchors`: the hash is the app's tab router
 * (`#scanner`, `#settings`), and an anchor would be read as a tab.
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
import { ACCENTS, BACKDROPS, DEFAULT_ACCENT, DEFAULT_BACKDROP, TONE_RANGE, accentPair, applyAccent, applyBackdrop, applyTheme, applyTone, backdropOf, clashesWithPnl, previewBackdrop, previewTone, savedAccent, savedBackdrop, savedTone, type ToneTheme } from '../ui/theme.js';
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
import { vmPanel, wireVm } from './vmPanel.js';
import { usersPanel, wireUsers } from './usersPanel.js';
import { pageHero } from '../ui/pageHero.js';
import { currentAlertsDigest, readAlertsSeen } from '../portfolio/alertsFeed.js';

const UNDO_KEY = 'settings:lastRestore';
const SEC_KEY = 'settings:section';

let pendingSection: string | null = null;
let ctxRef: AppContext | null = null;

/** Open the page on one section, e.g. `openSettingsAt('scan-trouble')`. */
export function openSettingsAt(id: string): void {
  pendingSection = id;
  const root = $('#tab-settings');
  if (root && !root.classList.contains('hidden') && root.childElementCount) {
    showSection(root, id);
    pendingSection = null;
    return;
  }
  location.hash = '#settings'; // main.ts's hashchange handler switches tabs
}

function lastSection(): string {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(SEC_KEY);
  } catch {
    /* private mode */
  }
  return SECTIONS.some((s) => s.id === id) ? id! : SECTIONS[0]!.id;
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
        <button class="st-copy" data-st-copy>${L('Copy', 'Copy')}</button>
      </div>
      <pre>${body}</pre>
    </div>`;
}

/** The button legend: one card per tier, one row per button, and the ✕ list. */
function buttonsHtml(s: GuideStep): string {
  const tiers = (s.buttons ?? []).map((t) => `<div class="st-bt st-bt-${t.tone}">
      <div class="st-bt-head"><span class="st-bt-dot" aria-hidden="true"></span><b>${say(t.title)}</b><span>${say(t.note)}</span></div>
      ${t.rows.map((r) => `<div class="st-bt-row">
          <span class="st-bt-ico" aria-hidden="true">${r.icon}</span>
          <div class="st-bt-txt">
            <div class="st-bt-name">${say(r.name)}</div>
            <div class="st-bt-does">${prose(r.does)}</div>
            <code class="st-bt-runs">${esc(r.runs)}</code>
          </div>
        </div>`).join('')}
    </div>`).join('');
  const never = s.never?.length
    ? `<div class="st-never">
        <div class="st-never-h">🛡 ${L('No button can ever', 'Không nút nào làm được')}</div>
        <ul>${s.never.map((n) => `<li>${prose(n)}</li>`).join('')}</ul>
      </div>`
    : '';
  return tiers || never ? `<div class="st-bts">${tiers}${never}</div>` : '';
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
        ${buttonsHtml(s)}
        ${s.warn ? `<div class="st-warn">⚠ ${prose(s.warn)}</div>` : ''}
        ${s.cmd ? cmdBlock(s.cmd, s.where) : ''}
      </div>
    </li>`;
}

/** The sections that carry a live control, not only words. Marked in the TOC. */
const LIVE = new Set(['data', 'users', 'look', 'restore', 'playbook', 'scan-remote']);

function sectionHtml(s: GuideSection, i: number, active: string): string {
  const panel = s.id === 'data' ? dataPanel() : s.id === 'look' ? lookPanel() : s.id === 'restore' ? restorePanel() : s.id === 'playbook' ? playbookPanel() : s.id === 'scan-remote' ? vmPanel() : s.id === 'users' ? usersPanel() : '';
  const prev = SECTIONS[i - 1];
  const next = SECTIONS[i + 1];
  const nav = (x: GuideSection | undefined, dir: 'prev' | 'next'): string => x
    ? `<button class="st-pn st-pn-${dir}" data-st-go="${x.id}">
        <small>${dir === 'prev' ? L('← Previous', '← Trước') : L('Next →', 'Tiếp →')}</small>
        <span><i aria-hidden="true">${x.icon}</i>${say(x.title)}</span>
      </button>`
    : '<span></span>';
  const chips = [
    LIVE.has(s.id) ? `<span class="st-chip st-chip-live">${L('Live setting', 'Cài đặt trực tiếp')}</span>` : '',
    s.steps.length ? `<span class="st-chip">${s.steps.length} ${L(s.steps.length > 1 ? 'steps' : 'step', 'bước')}</span>` : '',
  ].join('');
  return `<section class="card st-sec" id="st-${s.id}" data-st-sec="${s.id}"${s.id === active ? '' : ' hidden'}>
      <header class="st-sec-head">
        <span class="st-sec-icon" aria-hidden="true">${s.icon}</span>
        <div class="st-sec-tt">
          <div class="st-kicker">${say(GROUPS[s.group])} <span class="st-kicker-n">${String(i + 1).padStart(2, '0')} / ${String(SECTIONS.length).padStart(2, '0')}</span></div>
          <h2>${say(s.title)}</h2>
        </div>
        <div class="st-sec-chips">${chips}</div>
      </header>
      <p class="st-lead">${prose(s.lead)}</p>
      ${panel ? `<div class="st-panel">${panel}</div>` : ''}
      ${s.steps.length ? `<ol class="st-steps">${s.steps.map(stepHtml).join('')}</ol>` : ''}
      ${s.tip ? `<div class="st-tip">💡 ${prose(s.tip)}</div>` : ''}
      <footer class="st-pager">${nav(prev, 'prev')}${nav(next, 'next')}</footer>
    </section>`;
}

function tocHtml(): string {
  const groups = (Object.keys(GROUPS) as GuideSection['group'][])
    .map((g) => {
      const items = SECTIONS.filter((s) => s.group === g);
      return `<div class="st-toc-group">
          <div class="st-toc-gh">${say(GROUPS[g])}</div>
          ${items.map((s) => `<button class="st-toc-link" data-st-go="${s.id}" data-st-find="${esc(`${s.title.en} ${s.title.vi} ${s.lead.en} ${s.lead.vi}`.toLowerCase())}"><span class="st-toc-ic" aria-hidden="true">${s.icon}</span><span class="st-toc-t">${say(s.title)}</span>${LIVE.has(s.id) ? `<i class="st-toc-live" title="${L('Live setting', 'Cài đặt trực tiếp')}"></i>` : ''}</button>`).join('')}
        </div>`;
    })
    .join('');
  return `<nav class="st-toc" aria-label="${L('Contents', 'Mục lục')}">
      <label class="st-find"><span aria-hidden="true">⌕</span><input type="search" id="st-find" placeholder="${L('Search settings & guides', 'Tìm cài đặt & hướng dẫn')}" autocomplete="off" /></label>
      ${groups}
      <div class="st-find-none muted" hidden>${L('Nothing matches.', 'Không có mục nào khớp.')}</div>
    </nav>`;
}

// ── data & sync panel ────────────────────────────────────────────────────────

function dataPanel(): string {
  const on = isSyncEnabled();
  const state = !on
    ? `<span class="st-dot st-dot-off"></span>${L('Sync is off on this device — the data lives only here.', 'Máy này chưa bật sync — dữ liệu chỉ nằm ở đây.')}`
    : isHydrated()
      ? `<span class="st-dot st-dot-on"></span>${L('Syncing — this device is up to date with the server.', 'Đang sync — máy này đã khớp với server.')}`
      : `<span class="st-dot st-dot-wait"></span>${L('Connecting to the server…', 'Đang kết nối server…')}`;
  const light = document.documentElement.classList.contains('light');
  return `<div class="st-panel">
      <div class="st-status">${state}</div>
      <div class="st-actions">
        <button class="btn" data-st-act="sync">☁️ ${L('Sync & versions', 'Sync & các bản cũ')}</button>
        <button class="btn-outline" data-st-act="export">⬇ ${L('Export backup', 'Xuất bản sao lưu')}</button>
        <button class="btn-outline" data-st-act="ai">✨ ${L('AI assistant', 'Trợ lý AI')}</button>
        <button class="btn-outline" data-st-act="theme">${light ? '🌙 ' + L('Dark theme', 'Giao diện tối') : '☀️ ' + L('Light theme', 'Giao diện sáng')}</button>
        <button class="btn-outline" data-st-act="lang">${vi() ? '🇬🇧 English' : '🇻🇳 Tiếng Việt'}</button>
      </div>
      <div class="st-msg" id="st-data-msg"></div>
    </div>`;
}

// ── appearance panel ─────────────────────────────────────────────────────────

/** The colour being looked at, saved or not. Survives a re-render of the page. */
let lookPick: string | null = null;

const lightNow = (): boolean => document.documentElement.classList.contains('light');

/** `--accent`/`--accent2` set on one element, so only the preview wears the candidate. */
function lookVars(choice: string): string {
  const [a, b] = accentPair(choice, lightNow() ? 'light' : 'dark');
  return `--accent:${a};--accent2:${b};--accent-wash:color-mix(in srgb, ${a} 12%, transparent);--accent-line:color-mix(in srgb, ${a} 45%, transparent)`;
}

function lookPanel(): string {
  const saved = savedAccent();
  const pick = lookPick ?? saved;
  const custom = pick.startsWith('#') ? pick : saved.startsWith('#') ? saved : '#ff8a3d';
  const sw = ACCENTS.map((a) => {
    const [c1, c2] = lightNow() ? a.light : a.dark;
    return `<button type="button" class="st-sw${pick === a.id ? ' on' : ''}" data-look="${a.id}" aria-pressed="${pick === a.id}">
        <span class="st-sw-dot" style="background:linear-gradient(135deg, ${c1}, ${c2})"></span>${say(a.name)}${saved === a.id ? `<em>${L('saved', 'đang dùng')}</em>` : ''}</button>`;
  }).join('');
  return `<div class="st-panel st-look">
      <div class="st-sw-grid">
        ${sw}
        <label class="st-sw st-sw-custom${pick.startsWith('#') ? ' on' : ''}" title="${L('Any colour you like', 'Màu bất kỳ bạn thích')}">
          <input type="color" id="st-look-custom" value="${custom}" />${L('Your own', 'Màu riêng')}${saved.startsWith('#') ? `<em>${L('saved', 'đang dùng')}</em>` : ''}
        </label>
      </div>
      <div class="st-look-prev" id="st-look-prev" style="${lookVars(pick)}">
        <span class="st-look-cap">${L('Preview', 'Xem trước')}</span>
        <button type="button" class="btn" tabindex="-1">${L('Run scan', 'Chạy quét')}</button>
        <button type="button" class="btn-outline" tabindex="-1">${L('Secondary', 'Nút phụ')}</button>
        <span class="st-look-chip">BO · 92</span>
        <b class="st-look-sym">NVDA</b>
        <span class="st-look-bar"><i></i></span>
      </div>
      <div class="st-msg" id="st-look-msg">${pick.startsWith('#') && clashesWithPnl(pick)
        ? `⚠️ ${L('This looks like the gain/loss green or red — numbers may be harder to read.', 'Màu này giống màu xanh lãi / đỏ lỗ — đọc số lãi lỗ có thể bị nhầm.')}`
        : pick === 'jade'
          ? `ℹ️ ${L('Gains stay the brighter mint green; jade is darker, so the two still read apart.', 'Lãi vẫn là màu xanh bạc hà sáng hơn; ngọc bích đậm hơn nên vẫn phân biệt được.')}`
          : ''}</div>
      <div class="st-actions">
        <button class="btn" data-look-save${pick === saved ? ' disabled' : ''}>💾 ${L('Save colour', 'Lưu màu')}</button>
        <button class="btn-outline" data-look-reset${saved === DEFAULT_ACCENT && pick === DEFAULT_ACCENT ? ' disabled' : ''}>↺ ${L('Back to default', 'Về màu mặc định')}</button>
      </div>
      ${backdropRows()}
      ${toneRows()}
    </div>`;
}

/**
 * The background's colour: six rooms and "your own". A tap applies and saves at once — unlike
 * the accent there is nothing to compare against first, the whole page IS the preview.
 */
function backdropRows(): string {
  const saved = savedBackdrop();
  const dark = !lightNow();
  const dot = (id: string): string => {
    const p = backdropOf(id)[dark ? 'dark' : 'light'];
    const c = (g: string): string => `rgba(${g.split(',').slice(0, 3).join(',')},1)`;
    return `<span class="st-sw-dot" style="background:radial-gradient(circle at 25% 25%, ${c(p.glows[0]!)}, transparent 60%), radial-gradient(circle at 80% 30%, ${c(p.glows[1]!)}, transparent 60%), radial-gradient(circle at 60% 85%, ${c(p.glows[3]!)}, transparent 60%), ${p.base[0]}"></span>`;
  };
  const custom = saved.startsWith('#') ? saved : '#3a7bd5';
  return `<div class="st-tone-box st-bg-box">
      <div class="st-look-cap">${L('Background colour', 'Màu nền')}</div>
      <div class="st-sw-grid">
        ${BACKDROPS.map((b) => `<button type="button" class="st-sw${saved === b.id ? ' on' : ''}" data-backdrop="${b.id}" aria-pressed="${saved === b.id}">${dot(b.id)}${say(b.name)}</button>`).join('')}
        <label class="st-sw st-sw-custom${saved.startsWith('#') ? ' on' : ''}" title="${L('Any colour: the room is built from it', 'Màu bất kỳ: nền được dựng từ màu này')}">
          <input type="color" id="st-bg-custom" value="${custom}" />${L('Your own', 'Màu riêng')}
        </label>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:6px">${L('Applies to both themes; the brightness sliders below still work on top of it.', 'Áp dụng cho cả nền tối và sáng; thanh độ sáng bên dưới vẫn chỉnh được trên màu này.')}</div>
      ${saved !== DEFAULT_BACKDROP ? `<div class="st-actions"><button class="btn-outline" data-backdrop="${DEFAULT_BACKDROP}">↺ ${L('Default background', 'Nền mặc định')}</button></div>` : ''}
    </div>`;
}

/** One brightness slider per theme. The one for the theme on screen previews live;
 *  the other saves, and shows once you switch. */
function toneRows(): string {
  const now: ToneTheme = lightNow() ? 'light' : 'dark';
  const row = (t: ToneTheme): string => {
    const [lo, hi] = TONE_RANGE[t];
    const v = savedTone(t);
    const name = t === 'dark' ? L('Dark background', 'Nền tối') : L('Light background', 'Nền sáng');
    const ends =
      t === 'dark'
        ? [L('Darkest · default', 'Tối nhất · mặc định'), L('Lighter', 'Sáng hơn')]
        : [L('Dimmer', 'Dịu hơn'), L('default', 'mặc định'), L('Brighter', 'Sáng hơn')];
    return `<div class="st-tone-row${t === now ? ' on' : ''}">
        <div class="st-tone-head">
          <b>${t === 'dark' ? '🌙' : '☀️'} ${name}</b>${t === now ? `<em>${L('on screen', 'đang hiển thị')}</em>` : `<span class="muted">${L('switch theme to see it', 'chuyển giao diện để xem')}</span>`}
          <output class="st-tone-v" data-tone-v="${t}">${v > 0 ? '+' : ''}${v}</output>
        </div>
        <input type="range" class="st-tone" data-tone="${t}" min="${lo}" max="${hi}" step="1" value="${v}" aria-label="${name}" />
        <div class="st-tone-ends">${ends.map((e) => `<span>${e}</span>`).join('')}</div>
      </div>`;
  };
  return `<div class="st-tone-box">
      <div class="st-look-cap">${L('Background brightness', 'Độ sáng nền')}</div>
      ${row('dark')}${row('light')}
      <div class="st-actions"><button class="btn-outline" data-tone-reset${savedTone('dark') === 0 && savedTone('light') === 0 ? ' disabled' : ''}>↺ ${L('Default brightness', 'Độ sáng mặc định')}</button></div>
    </div>`;
}

/** Re-draw only the panel, so picking a swatch does not jump the page to the top. */
function repaintLook(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('.st-look');
  if (!host) return;
  host.outerHTML = lookPanel();
  wireLook(root);
}

function wireLook(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('.st-look');
  if (!host) return;
  host.querySelectorAll<HTMLElement>('[data-look]').forEach((b) =>
    b.addEventListener('click', () => {
      lookPick = b.dataset.look!;
      repaintLook(root);
    }),
  );
  const input = host.querySelector<HTMLInputElement>('#st-look-custom');
  // `input` fires while the native picker is dragged: move the preview only, re-draw on `change`.
  input?.addEventListener('input', () => {
    lookPick = input.value.toLowerCase();
    host.querySelector<HTMLElement>('#st-look-prev')?.setAttribute('style', lookVars(lookPick));
  });
  input?.addEventListener('change', () => {
    lookPick = input.value.toLowerCase();
    repaintLook(root);
  });
  host.querySelector('[data-look-save]')?.addEventListener('click', () => {
    const choice = lookPick ?? savedAccent();
    lookPick = null;
    applyAccent(choice); // re-renders the open page, this one included
  });
  host.querySelectorAll<HTMLElement>('[data-backdrop]').forEach((b) =>
    b.addEventListener('click', () => { applyBackdrop(b.dataset.backdrop!); repaintLook(root); }));
  const bg = host.querySelector<HTMLInputElement>('#st-bg-custom');
  bg?.addEventListener('input', () => previewBackdrop(bg.value.toLowerCase()));
  bg?.addEventListener('change', () => { applyBackdrop(bg.value.toLowerCase()); repaintLook(root); });
  host.querySelectorAll<HTMLInputElement>('input[data-tone]').forEach((inp) => {
    const t = inp.dataset.tone as ToneTheme;
    const out = host.querySelector<HTMLElement>(`[data-tone-v="${t}"]`);
    const show = (): void => {
      const v = Number(inp.value);
      if (out) out.textContent = `${v > 0 ? '+' : ''}${v}`;
    };
    // Dragging paints at once; letting go saves. Snaps to 0 near the middle of light's
    // two-way range so the shipped look is easy to find again.
    inp.addEventListener('input', () => {
      if (t === 'light' && Math.abs(Number(inp.value)) <= 2) inp.value = '0';
      show();
      previewTone(t, Number(inp.value));
    });
    inp.addEventListener('change', () => {
      applyTone(t, Number(inp.value));
      const reset = host.querySelector<HTMLButtonElement>('[data-tone-reset]');
      if (reset) reset.disabled = savedTone('dark') === 0 && savedTone('light') === 0;
    });
  });
  host.querySelector('[data-tone-reset]')?.addEventListener('click', () => {
    applyTone('dark', 0);
    applyTone('light', 0);
    repaintLook(root);
  });
  host.querySelector('[data-look-reset]')?.addEventListener('click', () => {
    lookPick = null;
    applyAccent(DEFAULT_ACCENT);
  });
}

// ── playbook panel ───────────────────────────────────────────────────────────

/** The frame; `fillPlaybookPanel` puts the live numbers in once the config is read. */
function playbookPanel(): string {
  return `<div class="st-panel st-pb">
      <div class="st-pb-stats" id="st-pb-stats"><span class="muted">${L('Reading your settings…', 'Đang đọc cấu hình…')}</span></div>
      <div class="st-actions">
        <button class="btn" data-st-act="playbook">⚙ ${L('Open playbook settings', 'Mở cài đặt Playbook')}</button>
        <button class="btn-outline" data-st-act="learn">📘 ${L('Read the playbook', 'Đọc Playbook')}</button>
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
      reg ? L(`SPY, close of ${reg.asOf}`, `SPY, giá đóng cửa ${reg.asOf}`) : L('Not measured yet: open Portfolio once', 'Chưa đo: mở Danh mục một lần là có'),
      doc?.color ?? 'var(--faint)'),
    tile(L('Risk per trade', 'Rủi ro mỗi lệnh'),
      cfg.pinnedRiskPct != null ? `${cfg.pinnedRiskPct}%` : `${ladder.learningPct}–${ladder.stablePct}%`,
      cfg.pinnedRiskPct != null ? L('Pinned by you', 'Đã ghim tay') : L('Automatic, from your record', 'Tự động, theo thành tích giao dịch'), 'var(--blue)'),
    tile(L('Setups changed', 'Setup đã chỉnh'), String(setups.length),
      setups.length ? setups.join(' · ') : L('All on the book’s defaults', 'Tất cả theo mặc định của Playbook'), 'var(--danger)'),
    tile(L('Other edits', 'Chỉnh sửa khác'), String(other),
      L('Ladder, grade lines, exit reasons', 'Thang rủi ro, ngưỡng hạng, lý do bán'), 'var(--violet)'),
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
    pf_playbook_cfg: ['Playbook settings', 'Cài đặt Playbook'],
    ui_collapsed: ['Folded sections', 'Các mục đã thu gọn'],
  };
  const hit = named[key];
  if (hit) return vi() ? hit[1] : hit[0];
  if (key.startsWith('plan:')) return L(`Trade plan ${key.slice(5)}`, `Trade plan ${key.slice(5)}`);
  if (key.startsWith('watchlist')) return L('Watchlists', 'Watchlist');
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
      'Cần bật sync: máy này không có bản nào trên server để khôi phục.',
    )}</div></div>`;
  }
  let undo = '';
  try {
    const last = JSON.parse(sessionStorage.getItem(UNDO_KEY) ?? 'null') as { at: number; done: number; n: number } | null;
    if (last)
      undo = `<div class="st-undo">✅ ${L(
        `Restored ${last.n} item(s) to ${stamp(last.at)}. To undo, restore to`,
        `Đã khôi phục ${last.n} mục về ${stamp(last.at)}. Muốn hoàn tác thì khôi phục về`,
      )} <b>${stamp(last.done - 1000)}</b>.
        <button class="btn-outline" data-st-undo="${last.done - 1000}">${L('Prepare undo', 'Chuẩn bị hoàn tác')}</button></div>`;
  } catch {
    /* sessionStorage unavailable: no undo hint, the restore still works */
  }
  return `<div class="st-panel st-restore">
      ${undo}
      <div class="st-rs-row">
        <label class="st-rs-label" for="st-at">${L('Moment (your local time)', 'Thời điểm (giờ máy bạn)')}</label>
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
      box.innerHTML = `<div class="muted st-msg">${L('No overwrites recorded for Portfolio or Financial Status yet.', 'Danh mục và Tình trạng tài chính chưa bị ghi đè lần nào.')}</div>`;
      return;
    }
    box.innerHTML = `<div class="st-quick-h">${L('Recent changes — pick one to go back to just before it:', 'Thay đổi gần đây — chọn một để quay về ngay trước lúc đó:')}</div>
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
      `Không có gì khác so với ${stamp(at)}: mọi thứ vẫn như lúc đó (các mục tạo sau vẫn được giữ).`,
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
        <b>${changes.length}</b> ${L(`item(s) differ from ${stamp(at)}.`, `mục khác so với ${stamp(at)}.`)}
        <span class="muted">${L('Red = much smaller now, usually the loss. Caches start unticked.', 'Đỏ = giờ nhỏ hơn nhiều, thường là chỗ bị mất. Cache mặc định không tick.')}</span>
      </div>
      <div class="st-prev-wrap"><table class="st-prev">
        <thead><tr><th><input type="checkbox" id="st-all" checked title="${L('All', 'Tất cả')}"></th><th>${L('Item', 'Mục')}</th><th>${L('Then', 'Lúc đó')}</th><th>${L('Now', 'Hiện tại')}</th><th>${L('First changed', 'Đổi lần đầu')}</th><th>${L('Changes', 'Số lần đổi')}</th></tr></thead>
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
        `Khôi phục ${keys.length} mục về như lúc ${stamp(at)}?\n\nNhớ đóng app trên các máy khác trước. Giá trị hiện tại vẫn được lưu lại nên hoàn tác được.`,
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
    msg.textContent = L('Restore failed: ', 'Khôi phục lỗi: ') + String((e as Error)?.message ?? e);
    if (btn) btn.disabled = false;
  }
}

// ── page ─────────────────────────────────────────────────────────────────────

/** Show one section, hide the rest, and bring its top into view if the page has
 * scrolled past it (switching from the foot of a long section). */
function showSection(root: HTMLElement, id: string): void {
  const el = root.querySelector<HTMLElement>(`#st-${CSS.escape(id)}`);
  if (!el) return;
  root.querySelectorAll<HTMLElement>('[data-st-sec]').forEach((s) => (s.hidden = s !== el));
  el.classList.remove('st-in');
  void el.offsetWidth; // restart the entrance animation
  el.classList.add('st-in');
  markToc(root, id);
  try {
    sessionStorage.setItem(SEC_KEY, id);
  } catch {
    /* private mode */
  }
  const layout = root.querySelector<HTMLElement>('.st-layout');
  if (layout && layout.getBoundingClientRect().top < 0) layout.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const active = pendingSection && SECTIONS.some((s) => s.id === pendingSection) ? pendingSection : lastSection();
  pendingSection = null;
  root.innerHTML = `
    ${pageHero({
      icon: '⚙️',
      kicker: L('Workspace', 'Không gian làm việc'),
      title: L('Settings & Guides', 'Cài đặt & Hướng dẫn'),
      sub: L(
        'Your data and its sync, the look of the app, restoring to a point in time, deploying the website and keeping the scanner alive — every command one click from the clipboard.',
        'Dữ liệu và đồng bộ, giao diện, khôi phục về một thời điểm, deploy trang web và giữ Scanner luôn chạy — lệnh nào cũng chỉ một cú bấm là vào clipboard.',
      ),
      tone: 'var(--accent)',
      foot: `${overviewHtml()}
        <div class="st-hero-note">🔒 ${L(
          'No secret appears on this page. Anything in <code>&lt;ANGLE_BRACKETS&gt;</code> is a placeholder you replace; secrets are typed only where a command asks for them.',
          'Trang này không chứa secret nào. Mọi thứ trong <code>&lt;NGOẶC_NHỌN&gt;</code> là chỗ cần thay bằng giá trị thật; secret chỉ gõ vào khi lệnh hỏi.',
        )}</div>`,
    })}
    <div class="st-layout">
      ${tocHtml()}
      <div class="st-body">${SECTIONS.map((s, i) => sectionHtml(s, i, active)).join('')}</div>
    </div>`;

  root.querySelectorAll<HTMLElement>('[data-st-go], [data-ov-go]').forEach((b) =>
    b.addEventListener('click', () => showSection(root, (b.dataset.stGo ?? b.dataset.ovGo)!)),
  );
  wireFind(root);
  void fillOverview(root, ctx);
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
  wireLook(root);
  wireVm(root);
  wireUsers(root, true, ctx);

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

  markToc(root, active);
}

// ── overview tiles ───────────────────────────────────────────────────────────

interface OvTile {
  go: string;
  icon: string;
  k: string;
  v: string;
  s: string;
  tone?: string;
  /** Filled after the first paint (it needs the bridge or storage). */
  slot?: string;
}

function overviewHtml(): string {
  const sync = isSyncEnabled();
  const light = document.documentElement.classList.contains('light');
  const ac = savedAccent();
  const preset = ACCENTS.find((a) => a.id === ac);
  const tiles: OvTile[] = [
    {
      go: 'data', icon: '☁️', k: L('Sync', 'Đồng bộ'),
      v: sync ? L('On', 'Đang bật') : L('Off', 'Đang tắt'),
      s: sync ? L('Every device shares one account', 'Mọi thiết bị dùng chung một tài khoản') : L('Data lives only on this device', 'Dữ liệu chỉ nằm trên máy này'),
      tone: sync ? 'var(--up)' : 'var(--warn)',
    },
    {
      go: 'look', icon: '🎨', k: L('Appearance', 'Giao diện'),
      v: preset ? say(preset.name) : ac.startsWith('#') ? ac.toUpperCase() : say(ACCENTS[0]!.name),
      s: `${light ? L('Light theme', 'Nền sáng') : L('Dark theme', 'Nền tối')} · ${vi() ? 'Tiếng Việt' : 'English'}`,
      tone: 'var(--accent)',
    },
    {
      go: 'scan-alerts', icon: '🔔', k: L('Telegram alerts', 'Cảnh báo Telegram'),
      v: '—', s: L('Set on the Watchlist tab', 'Cài ở tab Watchlist'), slot: 'alerts',
    },
    {
      go: 'scan-remote', icon: '🛰️', k: L('Scanner VM', 'Scanner VM'),
      v: '—', s: L('Run commands from here', 'Chạy lệnh ngay tại đây'), slot: 'vm',
    },
    {
      go: 'restore', icon: '⏪', k: L('Restore', 'Khôi phục'),
      v: L('Any moment', 'Mọi thời điểm'), s: L('Roll the account back, with undo', 'Đưa tài khoản về quá khứ, có hoàn tác'),
    },
    {
      go: 'deploy', icon: '🚀', k: L('Website', 'Trang web'),
      v: L('Build & deploy', 'Build & deploy'), s: L('Cloudflare Pages, step by step', 'Cloudflare Pages, từng bước'),
    },
  ];
  return `<div class="scan-ov st-ov" role="list">${tiles.map((x) =>
    `<button class="scan-ov-tile${x.tone ? '' : ' is-quiet'}" role="listitem" data-ov-go="${x.go}"${x.slot ? ` data-ov-slot="${x.slot}"` : ''}${x.tone ? ` style="--c:${x.tone}"` : ''}>`
    + `<span class="scan-ov-top"><span class="st-ov-ic" aria-hidden="true">${x.icon}</span>`
    + `<span class="scan-ov-k">${x.k}</span><span class="scan-ov-go" aria-hidden="true">→</span></span>`
    + `<b class="scan-ov-v">${x.v}</b><small class="scan-ov-s">${x.s}</small></button>`).join('')}</div>`;
}

function setTile(root: HTMLElement, slot: string, v: string, s: string, tone?: string): void {
  const t = root.querySelector<HTMLElement>(`[data-ov-slot="${slot}"]`);
  if (!t) return;
  t.querySelector('.scan-ov-v')!.textContent = v;
  t.querySelector('.scan-ov-s')!.textContent = s;
  t.classList.toggle('is-quiet', !tone);
  if (tone) t.style.setProperty('--c', tone);
}

/** The two tiles that need storage or the bridge. `scanner:alerts_seen` doubles as the
 * VM's heartbeat: watchd rewrites it at least every 30 minutes. */
async function fillOverview(root: HTMLElement, ctx: AppContext): Promise<void> {
  try {
    const d = await currentAlertsDigest(ctx);
    if (!d.on) setTile(root, 'alerts', L('Off', 'Đang tắt'), L('Master switch is off', 'Công tắc chính đang tắt'));
    else if (d.n) setTile(root, 'alerts', L(`${d.n} tickers`, `${d.n} mã`), L('Watched while their market is open', 'Canh khi thị trường của mã đang mở'), 'var(--up)');
    else setTile(root, 'alerts', L('No list on', 'Chưa bật danh sách'), L('Pick lists on the Watchlist tab', 'Chọn danh sách ở tab Watchlist'));
  } catch {
    /* the tile keeps its placeholder */
  }
  if (!isSyncEnabled()) {
    setTile(root, 'vm', L('Needs sync', 'Cần đồng bộ'), L('The VM talks through the sync bridge', 'VM nói chuyện qua bridge đồng bộ'));
    return;
  }
  const seen = await readAlertsSeen().catch(() => null);
  if (!root.isConnected) return;
  const at = seen ? Date.parse(seen.value.at) : NaN;
  if (!Number.isFinite(at)) {
    setTile(root, 'vm', L('No heartbeat yet', 'Chưa có nhịp'), L('Restart watchd once after updating', 'Khởi động lại watchd sau khi cập nhật'));
    return;
  }
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  const ago = min < 60 ? L(`${min} min ago`, `${min} phút trước`)
    : min < 2880 ? L(`${Math.round(min / 60)} h ago`, `${Math.round(min / 60)} giờ trước`)
      : L(`${Math.round(min / 1440)} days ago`, `${Math.round(min / 1440)} ngày trước`);
  const fresh = min <= 45;
  setTile(root, 'vm', fresh ? L('Alive', 'Đang chạy') : L('Quiet', 'Im lặng'), L(`watchd answered ${ago}`, `watchd trả lời ${ago}`), fresh ? 'var(--up)' : 'var(--warn)');
}

/** The TOC filter: matches title and lead in both languages, Enter opens the first hit. */
function wireFind(root: HTMLElement): void {
  const inp = root.querySelector<HTMLInputElement>('#st-find');
  if (!inp) return;
  const links = [...root.querySelectorAll<HTMLElement>('.st-toc-link')];
  const run = (): HTMLElement[] => {
    const q = inp.value.trim().toLowerCase();
    const hits = links.filter((b) => !q || (b.dataset.stFind ?? '').includes(q));
    links.forEach((b) => (b.hidden = !hits.includes(b)));
    root.querySelectorAll<HTMLElement>('.st-toc-group').forEach((g) => {
      g.hidden = ![...g.querySelectorAll<HTMLElement>('.st-toc-link')].some((b) => !b.hidden);
    });
    const none = root.querySelector<HTMLElement>('.st-find-none');
    if (none) none.hidden = hits.length > 0;
    return hits;
  };
  inp.addEventListener('input', () => void run());
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = run()[0];
      if (first) showSection(root, first.dataset.stGo!);
    } else if (e.key === 'Escape') {
      inp.value = '';
      run();
    }
  });
}
