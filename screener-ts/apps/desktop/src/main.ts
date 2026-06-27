import './styles.css';
import { AppContext, loadConfig } from './context.js';
import { $, $$ } from './ui/dom.js';
import { initModal, onModalClose } from './ui/stockModal.js';
import { renderPicks, renderScreener, renderSectors } from './tabs/screenerTabs.js';
import { renderWatchlist, renderLearn } from './tabs/miscTabs.js';
import { renderPortfolio } from './tabs/portfolioTab.js';
import { renderBacktest } from './tabs/backtestTab.js';
import { renderBlog } from './tabs/blogTab.js';
import { renderPlaybook } from './tabs/playbookTab.js';
import { renderCaseStudies } from './tabs/caseStudiesTab.js';
import { renderAbout } from './tabs/aboutTab.js';
import { renderLanding } from './ui/landing.js';
import { runSplash } from './ui/splash.js';
import { pageTransition } from './ui/transition.js';
import { renderToolLanding } from './ui/toolLanding.js';
import { showGate, isUnlocked } from './ui/authGate.js';
import { t, setLang, getLang, onLangChange } from './ui/i18n.js';
import { initTheme, onThemeChange, applyTheme } from './ui/theme.js';
import { openSyncSettings, onSynced } from './ui/syncSettings.js';
import { isSyncEnabled } from './adapters/syncClient.js';
import { pullAndMerge } from './adapters/storage.js';

// Surface a FATAL init failure visibly (a blank screen hides the cause). This is
// only used for the synchronous init below — we deliberately do NOT trap every
// async/window error, since benign runtime hiccups (e.g. a chart resize after
// disposal) must not blank the whole app.
function showFatal(msg: string): void {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;inset:12px;z-index:9999;background:#1a0d10;color:#ffb3ba;border:1px solid #ff5d6c;border-radius:12px;padding:16px;font:13px/1.5 monospace;white-space:pre-wrap;overflow:auto';
  box.textContent = 'App error:\n\n' + msg;
  document.body.appendChild(box);
}

const ctx = new AppContext(loadConfig());
initTheme();
initModal();
// When the stock modal closes, re-render the open tab so any watchlist change
// made inside it (add/remove via the picker) shows immediately.
onModalClose(() => {
  if (entered && currentTab === 'watchlist') renderTab('watchlist');
});

const TABS = ['picks', 'screener', 'watchlist', 'sectors', 'portfolio', 'backtest', 'blog', 'playbook', 'casestudies', 'learn', 'about'] as const;
type Tab = (typeof TABS)[number];

let entered = false;
let currentTab: Tab = 'picks';

/** Apply translations to every [data-i18n] node and sync the language toggle. */
function applyStaticI18n(): void {
  $$('[data-i18n]').forEach((node) => {
    const key = (node as HTMLElement).dataset.i18n!;
    node.textContent = t(key);
  });
  $$('[data-lang-btn]').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.langBtn === getLang()),
  );
}

function renderTab(tab: Tab): void {
  switch (tab) {
    case 'picks':
      renderPicks(ctx);
      break;
    case 'screener':
      renderScreener(ctx);
      break;
    case 'sectors':
      renderSectors(ctx);
      break;
    case 'watchlist':
      renderWatchlist(ctx);
      break;
    case 'portfolio':
      void renderPortfolio(ctx);
      break;
    case 'backtest':
      renderBacktest(ctx);
      break;
    case 'blog':
      renderBlog(ctx);
      break;
    case 'playbook':
      renderPlaybook(ctx);
      break;
    case 'casestudies':
      renderCaseStudies(ctx);
      break;
    case 'learn':
      renderLearn();
      break;
    case 'about':
      renderAbout();
      break;
  }
}

function show(tab: Tab): void {
  currentTab = tab;
  $$('[data-tab]').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab),
  );
  TABS.forEach((name) => $(`#tab-${name}`)!.classList.toggle('hidden', name !== tab));
  // Highlight the "More" trigger when one of its collapsed tabs is the active one.
  const more = $('#nav-more-btn')?.closest('.nav-more');
  if (more) {
    const activeInMore = !!more.querySelector('.nav-more-panel [data-tab].active');
    more.classList.toggle('has-active', activeInMore);
  }
  renderTab(tab);
}


function enterApp(): void {
  $('#tool-landing')!.classList.add('hidden');
  $('#app')!.classList.remove('hidden');
  applyStaticI18n();
  if (entered) return;
  entered = true;
  show('picks');
}

function showToolLanding(): void {
  $('#landing')!.classList.add('hidden');
  $('#app')!.classList.add('hidden');
  $('#tool-landing')!.classList.remove('hidden');
  renderToolLanding(
    $('#tool-landing')!,
    (trigger) => pageTransition(trigger ?? null, enterApp),
    (trigger) => goToLanding(trigger),
  );
}

function requestPrivateAccess(trigger?: Element): void {
  pageTransition(trigger ?? null, () => showGate(showToolLanding));
}

function goToLanding(trigger?: Element): void {
  pageTransition(trigger ?? null, () => {
    $('#app')!.classList.add('hidden');
    $('#tool-landing')!.classList.add('hidden');
    $('#landing')!.classList.remove('hidden');
    renderLanding($('#landing')!, requestPrivateAccess);
  });
}

// ── App cinematic menu overlay ────────────────────────────────────────────────
function buildAppMenu(): HTMLElement {
  const lang = getLang();
  const isLight = document.documentElement.classList.contains('light');
  const el = document.createElement('div');
  el.id = 'app-menu';
  el.innerHTML = `
    <header class="sl-menu-header">
      <span class="sl-menu-brand">The Professional</span>
      <button id="app-menu-close" aria-label="Close menu">✕</button>
    </header>
    <nav class="app-menu-nav">
      <div class="app-menu-col">
        <button class="sl-menu-item" id="app-menu-home">${t('nav.home')}</button>
        <button class="sl-menu-item" data-amtab="picks">${t('nav.picks')}</button>
        <button class="sl-menu-item" data-amtab="screener">${t('nav.screener')}</button>
        <button class="sl-menu-item" data-amtab="watchlist">${t('nav.watchlist')}</button>
        <button class="sl-menu-item" data-amtab="sectors">${t('nav.sectors')}</button>
        <button class="sl-menu-item" data-amtab="portfolio">${t('nav.portfolio')}</button>
      </div>
      <div class="app-menu-col">
        <button class="sl-menu-item" data-amtab="backtest">${t('nav.backtest')}</button>
        <button class="sl-menu-item" data-amtab="blog">${t('nav.blog')}</button>
        <button class="sl-menu-item" data-amtab="playbook">${t('nav.playbook')}</button>
        <button class="sl-menu-item" data-amtab="casestudies">${t('nav.casestudies')}</button>
        <button class="sl-menu-item" data-amtab="learn">${t('nav.learn')}</button>
        <button class="sl-menu-item" data-amtab="about">${t('nav.about')}</button>
      </div>
    </nav>
    <div class="sl-menu-items app-menu-footer">
      <div class="sl-menu-controls">
        <button class="sl-menu-ctrl${lang === 'en' ? ' active' : ''}" data-aml="en">EN</button>
        <button class="sl-menu-ctrl${lang === 'vi' ? ' active' : ''}" data-aml="vi">VI</button>
      </div>
      <button class="sl-menu-ctrl" id="app-menu-theme">${isLight ? '☀️' : '🌙'}</button>
      <button class="sl-menu-ctrl" id="app-menu-sync">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
        Sync
      </button>
    </div>`;
  document.body.appendChild(el);
  return el;
}

let appMenuEl: HTMLElement | null = null;
let appMenuWired = false;
function getAppMenu(): HTMLElement {
  if (!appMenuEl || !document.body.contains(appMenuEl)) { appMenuEl = buildAppMenu(); appMenuWired = false; }
  return appMenuEl;
}

function openAppMenu(): void {
  const menu = getAppMenu();
  // Highlight the currently active tab
  menu.querySelectorAll<HTMLElement>('[data-amtab]').forEach((b) =>
    b.classList.toggle('sl-menu--active', b.dataset.amtab === currentTab),
  );
  menu.classList.add('app-menu--open');
  document.body.style.overflow = 'hidden';
  const tgl = $('#menu-toggle');
  if (tgl) tgl.setAttribute('aria-expanded', 'true');
}
function closeAppMenu(): void {
  appMenuEl?.classList.remove('app-menu--open');
  document.body.style.overflow = '';
  const tgl = $('#menu-toggle');
  if (tgl) tgl.setAttribute('aria-expanded', 'false');
}

function wireAppMenu(): void {
  if (appMenuWired) return;
  appMenuWired = true;
  const menu = getAppMenu();
  menu.querySelector('#app-menu-close')?.addEventListener('click', closeAppMenu);
  menu.querySelector('#app-menu-home')?.addEventListener('click', (e) => {
    closeAppMenu();
    pageTransition(e.currentTarget as Element, showToolLanding);
  });
  menu.querySelectorAll<HTMLElement>('[data-amtab]').forEach((b) => {
    b.addEventListener('click', (e) => {
      const tab = b.dataset.amtab as Tab;
      closeAppMenu();
      pageTransition(e.currentTarget as Element, () => { enterApp(); show(tab); });
    });
  });
  menu.querySelectorAll<HTMLElement>('[data-aml]').forEach((b) =>
    b.addEventListener('click', () => {
      pageTransition(b, () => {
        closeAppMenu();
        setLang(b.dataset.aml as 'en' | 'vi');
        if (appMenuEl) { appMenuEl.remove(); appMenuEl = null; }
      });
    }),
  );
  menu.querySelector('#app-menu-theme')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as Element;
    const light = document.documentElement.classList.contains('light');
    pageTransition(btn, () => {
      closeAppMenu();
      applyTheme(light ? 'dark' : 'light');
      if (appMenuEl) { appMenuEl.remove(); appMenuEl = null; }
    });
  });
  menu.querySelector('#app-menu-sync')?.addEventListener('click', () => {
    closeAppMenu();
    openSyncSettings(ctx);
  });
}

const closeNav = (): void => closeAppMenu();

$('#menu-toggle')?.addEventListener('click', () => {
  const menu = getAppMenu();
  if (menu.classList.contains('app-menu--open')) {
    closeAppMenu();
  } else {
    wireAppMenu();
    openAppMenu();
  }
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAppMenu(); });

$('#logo-home')?.addEventListener('click', (e) => pageTransition(e.currentTarget as Element, showToolLanding));
$('#logo-home')?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') pageTransition($('#logo-home')!, showToolLanding); });

onLangChange(() => {
  applyStaticI18n();
  if (entered) renderTab(currentTab);
});

// Re-render the open tab on theme switch so charts pick up the new CSS colors.
onThemeChange(() => {
  if (entered) renderTab(currentTab);
});

// ── Device sync ──────────────────────────────────────────────────────────────
function reflectSyncState(): void {
  const btn = document.getElementById('app-menu-sync');
  if (btn) btn.classList.toggle('sync-on', isSyncEnabled());
}
onSynced(() => {
  reflectSyncState();
  if (entered) renderTab(currentTab);
});
reflectSyncState();

// On boot: if a code is already stored, pull+merge in the background, then
// refresh the open tab so the latest cross-device data appears without a manual
// sync. Best-effort — offline just leaves the local copy in place.
if (isSyncEnabled()) {
  void pullAndMerge(ctx.synced)
    .then((n) => {
      if (n > 0 && entered) renderTab(currentTab);
    })
    .catch(() => {});
}

// Boot splash → then show landing.
try {
  renderLanding($('#landing')!, requestPrivateAccess);
  applyStaticI18n();
  (window as unknown as { __APP_READY__?: boolean }).__APP_READY__ = true;
  void runSplash(); // overlay sits on top; fades away when ring completes
} catch (e) {
  showFatal(String((e as Error)?.stack || e));
}

// PWA: register the service worker so the app is installable ("Add to Home
// Screen") and opens instantly / offline. Skipped inside the Tauri shell (it
// has no SW) and on insecure origins. The SW never caches /api/* so stock data
// stays live.
const isTauriShell = typeof window !== 'undefined' && '__TAURI__' in window;
if (!isTauriShell && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* non-fatal: app still works without the SW */
    });
  });
}
