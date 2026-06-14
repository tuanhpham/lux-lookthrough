import './styles.css';
import { AppContext, loadConfig } from './context.js';
import { $, $$ } from './ui/dom.js';
import { initModal } from './ui/stockModal.js';
import { renderPicks, renderScreener, renderSectors } from './tabs/screenerTabs.js';
import { renderWatchlist, renderLearn } from './tabs/miscTabs.js';
import { renderPortfolio } from './tabs/portfolioTab.js';
import { renderBlog } from './tabs/blogTab.js';
import { renderLanding } from './ui/landing.js';
import { t, setLang, getLang, onLangChange } from './ui/i18n.js';
import { initTheme, onThemeChange } from './ui/theme.js';

const ctx = new AppContext(loadConfig());
initTheme();
initModal();

const TABS = ['picks', 'screener', 'watchlist', 'sectors', 'portfolio', 'blog', 'learn'] as const;
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
    case 'blog':
      renderBlog();
      break;
    case 'learn':
      renderLearn();
      break;
  }
}

function show(tab: Tab): void {
  currentTab = tab;
  $$('[data-tab]').forEach((b) =>
    b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab),
  );
  TABS.forEach((name) => $(`#tab-${name}`)!.classList.toggle('hidden', name !== tab));
  renderTab(tab);
}

function enterApp(): void {
  $('#landing')!.classList.add('hidden');
  $('#app')!.classList.remove('hidden');
  applyStaticI18n();
  if (entered) return; // already initialised — just reveal
  entered = true;
  // Auto-run Top Picks as soon as the app is entered (matches the backend).
  show('picks');
}

function goToLanding(): void {
  $('#app')!.classList.add('hidden');
  $('#landing')!.classList.remove('hidden');
  renderLanding($('#landing')!, enterApp);
}

// Nav wiring.
$$('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => show((b as HTMLElement).dataset.tab as Tab)),
);
$('#logo-home')?.addEventListener('click', goToLanding);

// Language toggle: persist, re-translate static chrome, and re-render the open tab
// so dynamic content (and the analysis summary's EN/VI) follows the switch.
$$('[data-lang-btn]').forEach((b) =>
  b.addEventListener('click', () => setLang((b as HTMLElement).dataset.langBtn as 'en' | 'vi')),
);
onLangChange(() => {
  applyStaticI18n();
  if (entered) renderTab(currentTab);
});

// Re-render the open tab on theme switch so charts pick up the new CSS colors.
onThemeChange(() => {
  if (entered) renderTab(currentTab);
});

// Landing first; the CTA reveals the app and auto-runs picks.
renderLanding($('#landing')!, enterApp);
applyStaticI18n();
