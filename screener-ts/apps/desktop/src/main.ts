import './styles.css';
import { AppContext, loadConfig } from './context.js';
import { $, $$ } from './ui/dom.js';
import { initModal, onModalClose } from './ui/stockModal.js';
import { renderPicks, renderScreener, renderSectors } from './tabs/screenerTabs.js';
import { renderWatchlist, renderLearn } from './tabs/miscTabs.js';
import { renderPortfolio } from './tabs/portfolioTab.js';
import { migrateAccountsBlob } from './portfolio/store.js';
import { renderCalendar } from './tabs/calendarTab.js';
import { renderBacktest } from './tabs/backtestTab.js';
import { renderPlaybook } from './tabs/playbookTab.js';
import { renderCaseStudies } from './tabs/caseStudiesTab.js';
import { renderScanner } from './tabs/scannerTab.js';
import { renderAbout } from './tabs/aboutTab.js';
import { renderLanding } from './ui/landing.js';
import { runSplash } from './ui/splash.js';
import { pageTransition } from './ui/transition.js';
import { renderToolLanding } from './ui/toolLanding.js';
import { showGate, isUnlocked } from './ui/authGate.js';
import { t, setLang, getLang, onLangChange } from './ui/i18n.js';
import { initTheme, onThemeChange, applyTheme } from './ui/theme.js';
import { openSyncSettings, onSynced } from './ui/syncSettings.js';
import { mountSyncStatus, refreshSyncStatus } from './ui/syncStatus.js';
import { openLlmSettings } from './ui/llmSettings.js';
import { openChatPanel, closeChatPanel, isChatOpen } from './ui/chatPanel.js';
import { isSyncEnabled } from './adapters/syncClient.js';
import { pullAndMerge, openSyncGate } from './adapters/storage.js';

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

const TABS = ['picks', 'screener', 'watchlist', 'sectors', 'calendar', 'portfolio', 'backtest', 'playbook', 'casestudies', 'scanner', 'learn', 'about'] as const;
type Tab = (typeof TABS)[number];

let entered = false;
/**
 * The tab shown on entering the app.
 *
 * Calendar, not Portfolio: the dated events in the next 30 days are the thing that
 * is time-sensitive and changes without you doing anything, so it is what is worth
 * seeing first. Portfolio is a lookup you go to deliberately.
 *
 * One consequence had to be handled: the `accounts` slimming migration used to run
 * only when Portfolio rendered. It is now queued at boot — see
 * `migrateAccountsBlob`.
 */
let currentTab: Tab = 'calendar';

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
    case 'calendar':
      renderCalendar(ctx);
      break;
    case 'portfolio':
      void renderPortfolio(ctx);
      break;
    case 'backtest':
      renderBacktest(ctx);
      break;
    case 'playbook':
      renderPlaybook(ctx);
      break;
    case 'casestudies':
      renderCaseStudies(ctx);
      break;
    case 'scanner':
      renderScanner(ctx);
      break;
    case 'learn':
      renderLearn();
      break;
    case 'about':
      renderAbout();
      break;
  }
}

/**
 * ── Deep links ──────────────────────────────────────────────────────────────
 * `#scanner` is the link the scanner's own morning Telegram message carries
 * (`nightly.dashboard_url()` derives it from `SCANNER_PUSH_URL`, so the two can
 * never point at different domains). Without this the link opened the app on the
 * default tab and the reader had to go and find the scanner by hand, which is
 * exactly the friction the link existed to remove.
 *
 * Only `#<tab>` is understood — no router, no library, no path segments. Anything
 * else in the hash is ignored rather than guessed at.
 */
function tabFromHash(): Tab | null {
  const h = location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : null;
}

function syncHash(tab: Tab): void {
  const want = `#${tab}`;
  if (location.hash === want) return;
  // replaceState, not `location.hash = …`. Two reasons, both about Back:
  // assigning pushes a history entry per tab click, so after browsing five tabs
  // Back walks backwards through all five instead of leaving the app; and it
  // would re-enter the `hashchange` handler below, which then calls show() again.
  // The cost is that Back does not step between tabs — the same as before this
  // existed, so nothing regresses.
  history.replaceState(null, '', want);
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
  syncHash(tab);
  renderTab(tab);
}

/**
 * Open a tab named in the URL hash on a cold load.
 *
 * Goes through the gate like any other way in: a deep link must not be a way past
 * the access code. `showGate` calls straight through when the code was already
 * entered on this device, so the usual case costs no extra click. `#landing` is
 * hidden here rather than in `enterApp`, which is only ever reached from the tool
 * landing and so has never needed to.
 *
 * `mandatory`: on a device without the code there is nothing to fall back to — the
 * landing is held hidden until the boot gate passes (see the boot block), so a
 * dismissible gate would dismiss to a blank page.
 */
function openDeepLink(tab: Tab): void {
  showGate(() => {
    $('#landing')!.classList.add('hidden');
    enterApp(tab);
  }, { mandatory: true });
}


/**
 * `tab` is the tab the caller is about to open, when it knows. The menu passes it
 * so the default tab is not rendered first and thrown away — with Calendar as the
 * default that throwaway render costs an upstream fetch, not just DOM work.
 */
function enterApp(tab?: Tab): void {
  $('#tool-landing')!.classList.add('hidden');
  $('#app')!.classList.remove('hidden');
  applyStaticI18n();
  if (entered) return;
  entered = true;
  // Queue the `accounts` slimming rewrite regardless of which tab opens. This used
  // to happen inside Portfolio's load(); with Calendar as the default tab, leaving
  // it there would mean a user who never opens Portfolio keeps a 912 KB row
  // syncing forever. It only acts on a blob that still carries the chart cache.
  void migrateAccountsBlob(ctx);
  show(tab ?? currentTab);
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
    renderLanding($('#landing')!, requestPrivateAccess, openStory);
  });
}

/**
 * The landing page's "story" link. The story is a tab now, not a page of its own,
 * so this is the ordinary way into the app aimed at About — it still goes through
 * the gate, which is a no-op once the device holds the code.
 */
function openStory(trigger?: Element): void {
  pageTransition(trigger ?? null, () =>
    showGate(() => {
      $('#landing')!.classList.add('hidden');
      enterApp('about');
    }),
  );
}

/**
 * The assistant's mark: a taijitu, in both the menu and the launcher.
 *
 * ── HOW IT IS DRAWN ─────────────────────────────────────────────────────────
 * The classic four-arc construction, filled rather than stroked, so it stays a
 * crisp two-tone disc at 16px and at 46px with no hairline artefacts:
 *   outer circle r12 → the light half
 *   one path: the right semicircle, then the r6 lobe bulging left at the bottom
 *             and the r6 lobe bulging right at the top → the dark half
 *   two eyes at the lobe centres (12,6) and (12,18), each the other's colour
 *
 * ── AND WHY IT IS TWO CLASSES, NOT TWO LITERAL COLOURS ──────────────────────
 * `.yy-a` is the accent, `.yy-b` is `currentColor`. That is what lets the same
 * markup sit on the menu row (inheriting the row's ink) and on the launcher
 * (inheriting the page's) and invert correctly between the light and dark themes,
 * which a hard-coded black-and-white pair could not do on either.
 */
const CHAT_ICON =
  '<svg class="yy" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<circle class="yy-a" cx="12" cy="12" r="12"/>' +
  '<path class="yy-b" d="M12 0A12 12 0 0 1 12 24A6 6 0 0 1 12 12A6 6 0 0 0 12 0Z"/>' +
  '<circle class="yy-a" cx="12" cy="6" r="1.9"/>' +
  '<circle class="yy-b" cx="12" cy="18" r="1.9"/>' +
  '</svg>';

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
        <button class="sl-menu-item" data-amtab="portfolio">${t('nav.portfolio')}</button>
        <button class="sl-menu-item" data-amtab="picks">${t('nav.picks')}</button>
        <button class="sl-menu-item" data-amtab="screener">${t('nav.screener')}</button>
        <button class="sl-menu-item" data-amtab="watchlist">${t('nav.watchlist')}</button>
        <button class="sl-menu-item" data-amtab="sectors">${t('nav.sectors')}</button>
        <button class="sl-menu-item" data-amtab="calendar">${t('nav.calendar')}</button>
      </div>
      <div class="app-menu-col">
        <button class="sl-menu-item" data-amtab="backtest">${t('nav.backtest')}</button>
        <button class="sl-menu-item" data-amtab="playbook">${t('nav.playbook')}</button>
        <button class="sl-menu-item" data-amtab="casestudies">${t('nav.casestudies')}</button>
        <button class="sl-menu-item" data-amtab="scanner">${t('nav.scanner')}</button>
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
      <button class="sl-menu-ctrl" id="app-menu-ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 3v2m0 14v2m-9-9h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4"/><circle cx="12" cy="12" r="3.5"/></svg>
        ${t('ai.menu')}
      </button>
      <button class="sl-menu-ctrl" id="app-menu-chat">
        ${CHAT_ICON}
        ${t('chat.title')}
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
      // Pass the tab in: enterApp would otherwise render the default tab first and
      // discard it, which for Calendar means a wasted upstream fetch.
      pageTransition(e.currentTarget as Element, () => { enterApp(tab); show(tab); });
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
  menu.querySelector('#app-menu-ai')?.addEventListener('click', () => {
    closeAppMenu();
    void openLlmSettings(ctx);
  });
  menu.querySelector('#app-menu-chat')?.addEventListener('click', () => {
    closeAppMenu();
    void openChatPanel(ctx);
  });
}

// ── Assistant launcher ────────────────────────────────────────────────────────

/**
 * A floating button, not a tab.
 *
 * Same reason the assistant is a panel: every question is about the screen the user
 * is already on, so the way in must not replace that screen. It is appended INSIDE
 * `#app`, which means it disappears with the app on the landing pages without any
 * visibility bookkeeping of its own.
 */
function mountChatLauncher(): void {
  const app = $('#app');
  if (!app) return;
  const existing = app.querySelector<HTMLButtonElement>('#chat-fab');
  const btn = existing ?? document.createElement('button');
  if (!existing) {
    btn.id = 'chat-fab';
    btn.type = 'button';
    btn.innerHTML = CHAT_ICON;
    btn.addEventListener('click', () => void openChatPanel(ctx));
    app.appendChild(btn);
  }
  btn.title = t('chat.title');
  btn.setAttribute('aria-label', t('chat.title'));
}
mountChatLauncher();
// Re-labelled rather than rebuilt: the listener would be lost with the element.
onLangChange(() => mountChatLauncher());

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
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeAppMenu();
  // Only the topmost layer closes. A dialog opened FROM the panel (the API-key
  // form) owns Escape while it is up; closing the panel underneath it would leave
  // the user staring at a form belonging to something that is no longer there.
  if (isChatOpen() && !document.querySelector('.dialog-host')) closeChatPanel();
});
// A second `#scanner` link clicked while the app is already open, or the hash
// edited by hand. Ignored unless the app is actually on screen: changing the hash
// while the landing page is up must not silently unlock and reveal the app.
window.addEventListener('hashchange', () => {
  const tab = tabFromHash();
  if (!tab || tab === currentTab) return;
  if ($('#app')!.classList.contains('hidden')) return;
  show(tab);
});
window.addEventListener('app:show-tab', (e) => {
  const tab = (e as CustomEvent<Tab>).detail;
  enterApp();
  currentTab = tab;
  TABS.forEach((name) => $(`#tab-${name}`)!.classList.toggle('hidden', name !== tab));
});

$('#logo-home')?.addEventListener('click', (e) => pageTransition(e.currentTarget as Element, showToolLanding));
$('#logo-home')?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') pageTransition($('#logo-home')!, showToolLanding); });

function reRenderCurrentPage(): void {
  applyStaticI18n();
  if (!$('#app')!.classList.contains('hidden')) {
    renderTab(currentTab);
  } else if (!$('#tool-landing')!.classList.contains('hidden')) {
    renderToolLanding(
      $('#tool-landing')!,
      (trigger) => pageTransition(trigger ?? null, enterApp),
      (trigger) => goToLanding(trigger),
    );
  } else if (!$('#landing')!.classList.contains('hidden')) {
    renderLanding($('#landing')!, requestPrivateAccess, openStory);
  }
}

onLangChange(() => {
  if (appMenuEl) { appMenuEl.remove(); appMenuEl = null; }
  reRenderCurrentPage();
});

// Re-render the open tab on theme switch so charts pick up the new CSS colors.
onThemeChange(() => {
  if (entered) renderTab(currentTab);
});

// ── Device sync ──────────────────────────────────────────────────────────────
/**
 * The menu item's own on/off tint. Note this used to be the ONLY sync feedback
 * anywhere, and it had silently stopped working: the class is applied to
 * `#app-menu-sync`, but every rule for it was written for a `#sync-toggle` button
 * that no longer exists in the top bar. The styles now match this selector, and
 * the always-visible pill (`mountSyncStatus`) is what actually reports health —
 * a signal inside a closed menu cannot warn anyone.
 */
function reflectSyncState(): void {
  const btn = document.getElementById('app-menu-sync');
  if (btn) btn.classList.toggle('sync-on', isSyncEnabled());
  refreshSyncStatus();
}
onSynced(() => {
  reflectSyncState();
  if (entered) renderTab(currentTab);
});
mountSyncStatus(ctx);
reflectSyncState();

// On boot: if a code is already stored, pull+merge in the background, then
// refresh the open tab so the latest cross-device data appears without a manual
// sync. Best-effort — offline just leaves the local copy in place.
//
// Until this pull lands, SyncedStorage holds every push back (see the hydration
// gate in storage.ts): tabs render immediately and may seed local defaults, but
// those defaults must not be uploaded, or last-write-wins hands victory to an
// empty new device over the real remote data.
if (isSyncEnabled()) {
  void pullAndMerge(ctx.synced)
    .then((n) => {
      if (n > 0 && entered) renderTab(currentTab);
    })
    .catch(() => {});
} else {
  // No code: nothing to wait for, so open the gate (a code entered later runs
  // its own pullAndMerge, which re-shuts and re-opens it around that merge).
  openSyncGate();
}

// Boot splash → access code → landing.
//
// The order is the point. The splash runs to 100%, and only then does anything
// else happen: a device that already holds the code gets the landing page as the
// splash wipes away, and a device that does not gets the code prompt and nothing
// else — the landing is rendered but held hidden, so an unknown machine never even
// sees what is behind the door. That is why this awaits `runSplash()` instead of
// firing it off; the gate must not appear under a splash that is still animating.
try {
  const landing = $('#landing')!;
  renderLanding(landing, requestPrivateAccess, openStory);
  applyStaticI18n();
  (window as unknown as { __APP_READY__?: boolean }).__APP_READY__ = true;

  const deep = tabFromHash();
  const locked = !isUnlocked();
  if (locked) landing.classList.add('hidden');

  void runSplash().then(() => {
    if (deep) { openDeepLink(deep); return; }
    if (!locked) return; // landing is already on screen
    showGate(() => landing.classList.remove('hidden'), { mandatory: true });
  });
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
    // Was this tab already under a worker's control? If not, the very first
    // install will claim it mid-session and fire `controllerchange` — that is
    // not a new deploy, so don't treat it as one.
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker
      // updateViaCache: 'none' — without it the browser may satisfy the sw.js
      // request from the HTTP cache, so reg.update() below would compare the
      // deployed worker against a cached copy of itself and see no change.
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // A single-page app never navigates, so the browser has no natural
        // moment to notice a redeployed sw.js — a tab left open (or an
        // installed PWA resumed from the app switcher) can run stale code
        // indefinitely. Check explicitly: once on load, on every return to the
        // foreground, and hourly for a tab that just stays open.
        const check = (): void => void reg.update().catch(() => undefined);
        check();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(() => {
        /* non-fatal: app still works without the SW */
      });

    // The new worker calls skipWaiting + clients.claim, so it takes over this
    // page as soon as it activates. The already-loaded JS is still the old
    // build, so reload once to pick up the new one.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload();
    });
  });
}
