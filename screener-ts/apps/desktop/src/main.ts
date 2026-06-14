import './styles.css';
import { AppContext, loadConfig } from './context.js';
import { $, $$ } from './ui/dom.js';
import { initModal } from './ui/stockModal.js';
import { renderPicks, renderScreener, renderSectors } from './tabs/screenerTabs.js';
import { renderWatchlist, renderLearn } from './tabs/miscTabs.js';
import { renderPortfolio } from './tabs/portfolioTab.js';
import { renderBlog } from './tabs/blogTab.js';

const ctx = new AppContext(loadConfig());
initModal();

const TABS = ['picks', 'screener', 'watchlist', 'sectors', 'portfolio', 'blog', 'learn'] as const;
type Tab = (typeof TABS)[number];

const rendered = new Set<Tab>();

function show(tab: Tab): void {
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab));
  TABS.forEach((t) => $(`#tab-${t}`)!.classList.toggle('hidden', t !== tab));

  // Render lazily on first view (cheap tabs re-render each time for freshness).
  switch (tab) {
    case 'picks':
      if (!rendered.has('picks')) renderPicks(ctx);
      break;
    case 'screener':
      if (!rendered.has('screener')) renderScreener(ctx);
      break;
    case 'sectors':
      if (!rendered.has('sectors')) renderSectors(ctx);
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
      if (!rendered.has('learn')) renderLearn();
      break;
  }
  rendered.add(tab);
}

$$('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => show((b as HTMLElement).dataset.tab as Tab)),
);

show('picks');
