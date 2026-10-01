import './styles.css';
import { AppContext, loadConfig } from './context.js';
import { $, $$ } from './ui/dom.js';
import { initModal, onModalClose } from './ui/stockModal.js';
import { renderPicks, renderScreener, renderSectors } from './tabs/screenerTabs.js';
import { renderWatchlist, renderLearn } from './tabs/miscTabs.js';
import { renderPortfolio } from './tabs/portfolioTab.js';
import { renderWealth } from './tabs/wealthTab.js';
import { migrateAccountsBlob, invalidateAccounts } from './portfolio/store.js';
import { renderCalendar } from './tabs/calendarTab.js';
import { renderBacktest } from './tabs/backtestTab.js';
import { renderCaseStudies } from './tabs/caseStudiesTab.js';
import { renderScanner } from './tabs/scannerTab.js';
import { renderAbout } from './tabs/aboutTab.js';
import { renderSettings } from './tabs/settingsTab.js';
import { renderLanding } from './ui/landing.js';
import { runSplash } from './ui/splash.js';
import { pageTransition } from './ui/transition.js';
import { showGate, isUnlocked } from './ui/authGate.js';
import { t, setLang, getLang, onLangChange } from './ui/i18n.js';
import { initTheme, onThemeChange, applyTheme } from './ui/theme.js';
import { openSyncSettings, onSynced } from './ui/syncSettings.js';
import { mountSyncStatus, refreshSyncStatus } from './ui/syncStatus.js';
import { openLlmSettings } from './ui/llmSettings.js';
import { openChatPanel, closeChatPanel, isChatOpen } from './ui/chatPanel.js';
import { ORB_MARK } from './ui/emblem.js';
import { isSyncEnabled } from './adapters/syncClient.js';
import { pullAndMerge, openSyncGate, isHydrated } from './adapters/storage.js';
import { PAGES, PAGE_GROUPS, pageInfo, noteVisit, recentPages } from './ui/pages.js';
import { openPalette, isPaletteOpen, type PaletteItem } from './ui/commandPalette.js';
import { SECTIONS as GUIDE_SECTIONS, GROUPS as GUIDE_GROUPS } from './tabs/settingsGuide.js';
import { openSettingsAt } from './tabs/settingsTab.js';
import { NAV as PLAYBOOK_NAV } from './tabs/swingPlaybook.js';
import { jumpToLearn } from './ui/stickyToc.js';

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

const TABS = ['picks', 'screener', 'watchlist', 'sectors', 'calendar', 'portfolio', 'wealth', 'backtest', 'casestudies', 'scanner', 'learn', 'about', 'settings'] as const;
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
    case 'wealth':
      void renderWealth(ctx);
      break;
    case 'backtest':
      renderBacktest(ctx);
      break;
    case 'casestudies':
      renderCaseStudies(ctx);
      break;
    case 'scanner':
      renderScanner(ctx);
      break;
    case 'learn':
      renderLearn(ctx);
      takeAliasJump();
      break;
    case 'about':
      renderAbout(discoverFromStory);
      break;
    case 'settings':
      renderSettings(ctx);
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
  const alias = HASH_ALIAS[h];
  if (alias) {
    aliasJump = alias[1];
    return alias[0];
  }
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : null;
}

/**
 * Hashes of pages that were merged into another one, so old links and bookmarks
 * still land somewhere sensible: the tab, then the section to scroll to.
 * `#playbook` was its own tab until its checklist and prompts moved into Learn §15.
 */
const HASH_ALIAS: Record<string, [Tab, string]> = {
  playbook: ['learn', 'swp-routine'],
};
let aliasJump: string | null = null;

/** Scroll to the section an aliased hash asked for, once, after its tab rendered. */
function takeAliasJump(): void {
  const id = aliasJump;
  aliasJump = null;
  if (id) requestAnimationFrame(() => jumpToLearn(id, false));
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
  noteVisit(tab);
  paintCrumb();
  renderTab(tab);
}

/**
 * Where you are, beside the wordmark: "Money / Financial Status". With fourteen pages
 * behind one menu, the page title scrolls away and the closed menu does not say it.
 */
function paintCrumb(): void {
  const el = $('#nav-crumb');
  if (!el) return;
  const info = pageInfo(currentTab);
  const lang = getLang();
  const group = info ? PAGE_GROUPS.find((g) => g.id === info.group)?.title[lang] : '';
  el.innerHTML = info
    ? `<span class="nav-crumb-g">${group}</span><span class="nav-crumb-sep">/</span><span class="nav-crumb-p">${info.icon} ${t(`nav.${info.id}`)}</span>`
    : '';
  const label = $('#nav-search .nav-search-l');
  if (label) label.textContent = lang === 'vi' ? 'Tìm trang, mục…' : 'Search pages…';
  const kbd = $('#nav-search .nav-search-k');
  if (kbd) kbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
  $('#nav-search')?.setAttribute('aria-label', lang === 'vi' ? 'Tìm kiếm' : 'Search');
  $('#nav-theme')?.setAttribute('aria-label', lang === 'vi' ? 'Đổi giao diện sáng / tối' : 'Toggle light / dark');
  const nav = $('#nav-groups');
  if (nav) nav.innerHTML = PAGE_GROUPS.map((g) => {
    const items = PAGES.filter((p) => p.group === g.id).map((p) =>
      `<button type="button" role="menuitem" class="ng-item${p.id === currentTab ? ' on' : ''}" data-ngtab="${p.id}">`
      + `<span class="ng-ic">${p.icon}</span><span class="ng-txt"><span class="ng-name">${t(`nav.${p.id}`)}</span>`
      + `<span class="ng-desc">${p.desc[lang]}</span></span></button>`).join('');
    return `<div class="ng${info?.group === g.id ? ' active' : ''}" data-ng="${g.id}">`
      + `<button type="button" class="ng-btn" aria-haspopup="true" aria-expanded="false">${g.title[lang]}`
      + `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>`
      + `<div class="ng-pop" role="menu">${items}</div></div>`;
  }).join('');
}

/**
 * The Kraken-style page groups in the top bar (≥1100px; smaller screens keep ☰).
 * Hover opens a group on a mouse, a click opens it everywhere; `.ng-quiet` keeps the
 * one just used from popping back open under a pointer that has not moved away.
 */
function closeNavGroups(): void {
  $$('#nav-groups .ng.open').forEach((g) => {
    g.classList.remove('open');
    g.querySelector('.ng-btn')?.setAttribute('aria-expanded', 'false');
  });
}
const navGroups = $('#nav-groups');
navGroups?.addEventListener('click', (e) => {
  const item = (e.target as Element).closest<HTMLElement>('[data-ngtab]');
  if (item) {
    const tab = item.dataset.ngtab as Tab;
    closeNavGroups();
    navGroups.classList.add('ng-quiet');
    if (tab !== currentTab) pageTransition(item, () => enterApp(tab));
    return;
  }
  const g = (e.target as Element).closest<HTMLElement>('.ng');
  if (!g) return;
  const open = !g.classList.contains('open');
  closeNavGroups();
  g.classList.toggle('open', open);
  g.querySelector('.ng-btn')?.setAttribute('aria-expanded', String(open));
});
navGroups?.addEventListener('mouseleave', () => navGroups.classList.remove('ng-quiet'));
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest?.('#nav-groups')) closeNavGroups();
});
$('#nav-theme')?.addEventListener('click', (e) => {
  const light = document.documentElement.classList.contains('light');
  pageTransition(e.currentTarget as Element, () => {
    applyTheme(light ? 'dark' : 'light');
    // The ☰ menu bakes its theme label in; the next open rebuilds it.
    if (appMenuEl) { appMenuEl.remove(); appMenuEl = null; }
  });
});

// ── Search palette ───────────────────────────────────────────────────────────

/** Open a Learn section: show the tab if it is not the one on screen, then jump. */
function openLearnAt(id: string): void {
  if (currentTab !== 'learn') enterApp('learn');
  requestAnimationFrame(() => jumpToLearn(id));
}

const LEARN_PARTS: [string, string, { en: string; vi: string }][] = [
  ['lb-part-1', '📘', { en: 'The swing-trading playbook', vi: 'Cẩm nang swing trading' }],
  ['lb-part-2', '🗺', { en: 'Working the platform, page by page', vi: 'Dùng nền tảng, từng trang' }],
  ['lb-part-3', '🎯', { en: 'How the score is computed', vi: 'Điểm số được tính thế nào' }],
  ['lb-part-4', '🔤', { en: 'Glossary', vi: 'Thuật ngữ' }],
];

function paletteItems(): { pages: PaletteItem[]; actions: PaletteItem[]; deep: PaletteItem[] } {
  const lang = getLang();
  const vi = lang === 'vi';
  const pages: PaletteItem[] = PAGES.map((p) => ({
    id: `p:${p.id}`,
    icon: p.icon,
    title: t(`nav.${p.id}`),
    sub: p.desc[lang],
    group: vi ? 'Trang' : 'Pages',
    tag: PAGE_GROUPS.find((g) => g.id === p.group)?.title[lang],
    words: `${p.id} ${p.words ?? ''} ${p.desc.en} ${p.desc.vi}`,
    run: () => enterApp(p.id as Tab),
  }));
  const guides: PaletteItem[] = GUIDE_SECTIONS.map((s) => ({
    id: `s:${s.id}`,
    icon: s.icon,
    title: s.title[lang],
    sub: GUIDE_GROUPS[s.group][lang],
    group: t('nav.settings'),
    tag: t('nav.settings'),
    words: `${s.title.en} ${s.title.vi}`,
    run: () => openSettingsAt(s.id),
  }));
  const learn: PaletteItem[] = [
    ...LEARN_PARTS.map(([id, icon, title]) => ({
      id: `l:${id}`, icon, title: title[lang], group: t('nav.learn'), tag: t('nav.learn'),
      words: `${title.en} ${title.vi}`, run: () => openLearnAt(id),
    })),
    ...PLAYBOOK_NAV.map(([id, label]) => ({
      id: `l:swp-${id}`, icon: '📗', title: label[lang],
      sub: vi ? 'Cẩm nang swing trading' : 'Swing-trading playbook',
      group: t('nav.learn'), tag: t('nav.learn'), words: `playbook cam nang ${label.en} ${label.vi}`,
      run: () => openLearnAt(`swp-${id}`),
    })),
  ];
  const light = document.documentElement.classList.contains('light');
  const action = (id: string, icon: string, title: string, run: () => void, words = ''): PaletteItem => ({
    id: `a:${id}`, icon, title, group: vi ? 'Thao tác' : 'Actions', tag: vi ? 'Thao tác' : 'Action', words, run,
  });
  const actions: PaletteItem[] = [
    action('sync', '☁️', vi ? 'Đồng bộ & mã truy cập' : 'Sync & access code', () => openSyncSettings(ctx), 'sync backup export import dong bo'),
    action('ai', '🔑', vi ? 'Khóa AI (API key)' : 'AI key & model', () => void openLlmSettings(ctx), 'ai api key llm'),
    action('chat', '💬', t('chat.title'), () => void openChatPanel(ctx), 'assistant chat ai tro ly'),
    action('theme', light ? '🌙' : '☀️',
      vi ? (light ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng') : light ? 'Switch to dark theme' : 'Switch to light theme',
      () => applyTheme(light ? 'dark' : 'light'), 'theme dark light'),
    action('lang', '🌐', vi ? 'Switch to English' : 'Chuyển sang tiếng Việt', () => setLang(vi ? 'en' : 'vi'), 'language ngon ngu english vietnamese'),
    action('home', '🏠', t('nav.home'), () => goToLanding(), 'home landing trang chu'),
  ];
  return { pages, actions, deep: [...guides, ...learn] };
}

function openSearch(): void {
  if ($('#app')!.classList.contains('hidden')) return;
  closeAppMenu();
  const vi = getLang() === 'vi';
  openPalette({
    lang: getLang,
    items: () => {
      const { pages, actions, deep } = paletteItems();
      return [...pages, ...deep, ...actions];
    },
    idle: () => {
      const { pages, actions } = paletteItems();
      const recent = recentPages()
        .filter((id) => id !== currentTab)
        .map((id) => pages.find((p) => p.id === `p:${id}`))
        .filter((p): p is PaletteItem => !!p)
        .slice(0, 4)
        .map((p) => ({ ...p, group: vi ? 'Mở gần đây' : 'Recent' }));
      return [...recent, ...pages, ...actions];
    },
  });
}

/**
 * Open a tab named in the URL hash on a cold load.
 *
 * Goes through the gate like any other way in: a deep link must not be a way past
 * the access code. `showGate` calls straight through when the code was already
 * entered on this device, so the usual case costs no extra click.
 *
 * `mandatory`: on a device without the code there is nothing to fall back to — the
 * landing is held hidden until the boot gate passes (see the boot block), so a
 * dismissible gate would dismiss to a blank page.
 */
function openDeepLink(tab: Tab): void {
  showGate(() => enterApp(tab), { mandatory: true });
}


/**
 * `tab` is the tab the caller is about to open, when it knows. The menu passes it
 * so the default tab is not rendered first and thrown away — with Calendar as the
 * default that throwaway render costs an upstream fetch, not just DOM work.
 *
 * Hiding the landing is this function's job: there used to be a second "welcome"
 * page in between that did it, and every way into the app now comes straight from
 * the landing instead.
 */
function enterApp(tab?: Tab): void {
  $('#landing')!.classList.add('hidden');
  $('#app')!.classList.remove('hidden');
  applyStaticI18n();
  if (!entered) {
    entered = true;
    // Queue the `accounts` slimming rewrite regardless of which tab opens. This
    // used to happen inside Portfolio's load(); with Calendar as the default tab,
    // leaving it there would mean a user who never opens Portfolio keeps a 912 KB
    // row syncing forever. It only acts on a blob that still carries the chart
    // cache — so it is once per session, and it stays inside this guard.
    void migrateAccountsBlob(ctx);
  }
  // Outside the guard, and that is the whole point. `if (entered) return` used to
  // sit above this line, which made every entry point a one-shot: go Home to the
  // landing and click "Enter the platform" a second time and you did NOT land on
  // Calendar, you landed on whatever tab you happened to leave open. Same for the
  // Story link and About. A caller that names a tab is asking for that tab every
  // time, not only the first time.
  show(tab ?? currentTab);
}

/**
 * "Enter the platform" — the landing page's main call to action.
 *
 * It lands on Calendar, the app itself. There was a second landing page here once
 * (a tile menu of the twelve workspaces) and it earned nobody anything: the reader
 * had already said what they wanted by clicking Enter, and got another page asking
 * the same question. The workspaces are one click away in the menu from wherever
 * they end up instead.
 */
function requestPrivateAccess(trigger?: Element): void {
  pageTransition(trigger ?? null, () => showGate(() => enterApp('calendar')));
}

/** Home: back out of the app to the landing page. */
function goToLanding(trigger?: Element): void {
  pageTransition(trigger ?? null, () => {
    $('#app')!.classList.add('hidden');
    $('#landing')!.classList.remove('hidden');
    renderLanding($('#landing')!, requestPrivateAccess, openStory, openLearn);
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
 * The landing page's "Learn" link — straight to the reading tab.
 *
 * Same shape as `openStory`, and it exists for the same reason: the guides are
 * something you come back to, and "Enter the platform, then go and find Learn" is
 * two clicks and a hunt for a destination the reader already named.
 */
function openLearn(trigger?: Element): void {
  pageTransition(trigger ?? null, () =>
    showGate(() => {
      $('#landing')!.classList.add('hidden');
      enterApp('learn');
    }),
  );
}

/**
 * The round button that ends the story, at the bottom of the last chapter.
 *
 * When the story was the front page this button was the way in. The story is a tab
 * now, so the equivalent is the desk itself — the same place the landing page's
 * "Enter the platform" lands. No gate and no `enterApp`: reading the story means
 * already being inside.
 */
function discoverFromStory(trigger?: Element): void {
  pageTransition(trigger ?? null, () => show('calendar'));
}

/**
 * The assistant's mark: the taijitu disc, in both the menu and the launcher.
 *
 * Why the small mark is the disc alone and not the whole painting — and why the
 * painting is a cropped image rather than SVG at all — is in `ui/emblem.ts`.
 */
const CHAT_ICON = ORB_MARK;

// ── App cinematic menu overlay ────────────────────────────────────────────────

/** Line icons for the menu, drawn in currentColor so both themes come for free. */
const AM_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l1.8 1.8"/>',
  market: '<path d="M4 19h16"/><path d="m5 15 4-5 4 3 6-7"/><path d="M15 6h4v4"/>',
  trade: '<path d="M7 4v16M17 4v16"/><rect x="4.5" y="8" width="5" height="7" rx="1"/><rect x="14.5" y="6" width="5" height="9" rx="1"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  know: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
} as const;
const GROUP_ICON: Record<(typeof PAGE_GROUPS)[number]['id'], keyof typeof AM_PATHS> = {
  market: 'market', trade: 'trade', money: 'money', know: 'know',
};
function amIcon(name: keyof typeof AM_PATHS, size = 16): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${AM_PATHS[name]}</svg>`;
}

function buildAppMenu(): HTMLElement {
  const lang = getLang();
  const vi = lang === 'vi';
  const isLight = document.documentElement.classList.contains('light');
  const el = document.createElement('div');
  el.id = 'app-menu';
  el.className = 'app-menu--grouped';
  el.innerHTML = `
    <header class="sl-menu-header">
      <button class="sl-menu-brand" id="app-menu-brand">The Professional</button>
      <button id="app-menu-close" aria-label="Close menu">✕</button>
    </header>
    <nav class="app-menu-nav app-menu-nav--grouped">
      <div class="am-wrap">
        <button type="button" class="am-search" id="app-menu-search">
          ${amIcon('search', 18)}
          <span>${vi ? 'Tìm trang, mục hướng dẫn, thao tác…' : 'Search pages, guides, actions…'}</span>
          <kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <div class="app-menu-grid">${PAGE_GROUPS.map((g, gi) => {
          const pages = PAGES.filter((p) => p.group === g.id);
          return `<section class="app-menu-group">
            <header class="app-menu-gh">
              <span class="amg-ic">${amIcon(GROUP_ICON[g.id], 17)}</span>
              <span class="amg-t">${g.title[lang]}</span>
              <span class="amg-n">${String(gi + 1).padStart(2, '0')}</span>
            </header>
            <div class="amg-list">${pages
              .map(
                (p) => `<button type="button" class="app-menu-page" data-amtab="${p.id}">
                  <span class="amp-ic" aria-hidden="true">${p.icon}</span>
                  <span class="amp-txt"><span class="amp-name">${t(`nav.${p.id}`)}</span><span class="amp-desc">${p.desc[lang]}</span></span>
                </button>`,
              )
              .join('')}</div>
          </section>`;
        }).join('')}</div>
      </div>
    </nav>
    <footer class="am-bar">
      <div class="am-bar-in">
        <button type="button" class="am-btn" id="app-menu-home">${amIcon('home')}<span>${t('nav.home')}</span></button>
        <span class="am-bar-gap"></span>
        <div class="am-seg" role="group" aria-label="${vi ? 'Ngôn ngữ' : 'Language'}">
          <button type="button" class="${lang === 'en' ? 'active' : ''}" data-aml="en" aria-pressed="${lang === 'en'}">EN</button>
          <button type="button" class="${lang === 'vi' ? 'active' : ''}" data-aml="vi" aria-pressed="${lang === 'vi'}">VI</button>
        </div>
        <button type="button" class="am-btn" id="app-menu-theme" title="${vi ? 'Đổi giao diện sáng / tối' : 'Switch light / dark'}">
          ${amIcon(isLight ? 'moon' : 'sun')}<span>${isLight ? (vi ? 'Giao diện tối' : 'Dark') : vi ? 'Giao diện sáng' : 'Light'}</span>
        </button>
        <button type="button" class="am-btn" id="app-menu-sync">${amIcon('cloud')}<span>Sync</span></button>
        <button type="button" class="am-btn" id="app-menu-ai">${amIcon('key')}<span>${vi ? 'Khóa AI' : 'AI key'}</span></button>
        <button type="button" class="am-btn am-btn-accent" id="app-menu-chat">${CHAT_ICON}<span>${t('chat.title')}</span></button>
      </div>
    </footer>`;
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
  // The wordmark and Home are the same promise: "The Professional" always goes back
  // to the landing page, from the top bar and from inside the menu alike.
  menu.querySelectorAll('#app-menu-home, #app-menu-brand').forEach((b) =>
    b.addEventListener('click', (e) => {
      closeAppMenu();
      goToLanding(e.currentTarget as Element);
    }),
  );
  menu.querySelectorAll<HTMLElement>('[data-amtab]').forEach((b) => {
    b.addEventListener('click', (e) => {
      const tab = b.dataset.amtab as Tab;
      closeAppMenu();
      // One call, not `enterApp(tab); show(tab)`: enterApp shows the tab it is
      // given now, so the second call was a second full render of the same tab —
      // for Calendar, a second upstream fetch.
      pageTransition(e.currentTarget as Element, () => enterApp(tab));
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
  menu.querySelector('#app-menu-search')?.addEventListener('click', () => openSearch());
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
// Ctrl K / ⌘K from anywhere in the app; "/" too, unless the reader is typing.
window.addEventListener('keydown', (e) => {
  if ($('#app')!.classList.contains('hidden') || isPaletteOpen() || document.querySelector('.dialog-host')) return;
  const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  const ctrlK = (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey;
  const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (!ctrlK && !slash) return;
  e.preventDefault();
  openSearch();
});
$('#nav-search')?.addEventListener('click', () => openSearch());
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeAppMenu();
  closeNavGroups();
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
  if (!tab) return;
  if ($('#app')!.classList.contains('hidden')) return;
  if (tab === currentTab) {
    syncHash(tab);
    takeAliasJump();
    return;
  }
  show(tab);
});
window.addEventListener('app:show-tab', (e) => {
  const tab = (e as CustomEvent<Tab>).detail;
  enterApp();
  currentTab = tab;
  TABS.forEach((name) => $(`#tab-${name}`)!.classList.toggle('hidden', name !== tab));
});

$('#logo-home')?.addEventListener('click', (e) => goToLanding(e.currentTarget as Element));
$('#logo-home')?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') goToLanding($('#logo-home')!); });

function reRenderCurrentPage(): void {
  applyStaticI18n();
  if (!$('#app')!.classList.contains('hidden')) {
    renderTab(currentTab);
  } else if (!$('#landing')!.classList.contains('hidden')) {
    renderLanding($('#landing')!, requestPrivateAccess, openStory, openLearn);
  }
}

onLangChange(() => {
  if (appMenuEl) { appMenuEl.remove(); appMenuEl = null; }
  reRenderCurrentPage();
  paintCrumb();
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

/**
 * Pull again whenever the app comes back to the foreground.
 *
 * The boot pull used to be the only one. A phone or a laptop tab left open for a day
 * kept the data it had at boot, and the first edit made there wrote that whole blob
 * (`accounts`, `wealth`) stamped "now" — last-write-wins then threw away everything the
 * other device had saved in between. That is the "I lose data when I use two devices"
 * report. The server kept the lost versions in `kv_history`, which is what Settings →
 * Restore reads, but not losing them is better.
 *
 * At most once a minute: a pull downloads every row. Only after the boot pull has
 * hydrated the device; before that the boot merge is still in charge.
 */
const REPULL_MS = 60_000;
let lastForegroundPull = Date.now();
function pullOnReturn(): void {
  if (!isSyncEnabled() || !isHydrated() || document.visibilityState !== 'visible') return;
  if (Date.now() - lastForegroundPull < REPULL_MS) return;
  lastForegroundPull = Date.now();
  void pullAndMerge(ctx.synced)
    .then((n) => {
      if (n <= 0) return;
      invalidateAccounts();
      if (entered) renderTab(currentTab);
    })
    .catch(() => {});
}
document.addEventListener('visibilitychange', pullOnReturn);
window.addEventListener('focus', pullOnReturn);

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
  renderLanding(landing, requestPrivateAccess, openStory, openLearn);
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
