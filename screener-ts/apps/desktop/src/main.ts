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
import { initTheme, onThemeChange } from './ui/theme.js';
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

// ── "More ▾" desktop dropdown ─────────────────────────────────────────────────
function setMoreOpen(open: boolean): void {
  const more = $('#nav-more-btn')?.closest('.nav-more');
  if (!more) return;
  more.classList.toggle('open', open);
  $('#nav-more-btn')?.setAttribute('aria-expanded', String(open));
}
$('#nav-more-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const more = $('#nav-more-btn')?.closest('.nav-more');
  setMoreOpen(!more?.classList.contains('open'));
});
// Close the dropdown on any outside click.
document.addEventListener('click', (e) => {
  const more = $('#nav-more-btn')?.closest('.nav-more');
  if (more?.classList.contains('open') && !more.contains(e.target as Node)) setMoreOpen(false);
});

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

// ── Mobile nav dropdown ──────────────────────────────────────────────────────
// On phones the inline top-nav tabs collapse behind the hamburger into a
// dropdown. We toggle a class on #app and keep aria-expanded in sync; tapping a
// nav item or the backdrop closes it.
function setNav(open: boolean): void {
  $('#app')!.classList.toggle('nav-open', open);
  const tgl = $('#menu-toggle');
  if (tgl) tgl.setAttribute('aria-expanded', String(open));
}
const closeNav = (): void => setNav(false);

$('#menu-toggle')?.addEventListener('click', () =>
  setNav(!$('#app')!.classList.contains('nav-open')),
);
$('#sidebar-backdrop')?.addEventListener('click', closeNav);
$('#sidebar-backdrop')?.addEventListener('touchend', closeNav);
// Close the dropdowns with Escape for keyboard/desktop users.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeNav();
    setMoreOpen(false);
  }
});

// Nav wiring. Selecting a tab closes the mobile drawer AND the desktop "More"
// dropdown so the chosen tab is revealed cleanly.
$$('[data-tab]').forEach((b) =>
  b.addEventListener('click', (e) => {
    const tab = (b as HTMLElement).dataset.tab as Tab;
    closeNav();
    setMoreOpen(false);
    pageTransition(e.currentTarget as Element, () => show(tab));
  }),
);
$('#logo-home')?.addEventListener('click', (e) => goToLanding(e.currentTarget as Element));
$('#nav-home')?.addEventListener('click', (e) => { closeNav(); pageTransition(e.currentTarget as Element, showToolLanding); });

// Language toggle: persist, re-translate static chrome, and re-render the open tab
// so dynamic content (and the analysis summary's EN/VI) follows the switch.
$$('[data-lang-btn]').forEach((b) =>
  b.addEventListener('click', (e) => {
    pageTransition(e.currentTarget as Element, () =>
      setLang((b as HTMLElement).dataset.langBtn as 'en' | 'vi')
    );
  }),
);
onLangChange(() => {
  applyStaticI18n();
  if (entered) renderTab(currentTab);
});

// Re-render the open tab on theme switch so charts pick up the new CSS colors.
onThemeChange(() => {
  if (entered) renderTab(currentTab);
});

// ── Device sync ──────────────────────────────────────────────────────────────
// The cloud button opens the access-code dialog. A small dot on the button marks
// "sync on". After a code is entered the dialog pulls+merges remote data and
// calls back here to re-render the open tab so synced data shows immediately.
function reflectSyncState(): void {
  $('#sync-toggle')?.classList.toggle('sync-on', isSyncEnabled());
}
$('#sync-toggle')?.addEventListener('click', () => openSyncSettings(ctx));
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
