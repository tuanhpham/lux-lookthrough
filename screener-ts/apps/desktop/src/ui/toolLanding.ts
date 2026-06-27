import { t, getLang, setLang } from './i18n.js';
import { applyTheme } from './theme.js';
import { pageTransition } from './transition.js';

export function renderToolLanding(host: HTMLElement, onEnter: (trigger?: Element) => void, onBack?: (trigger?: Element) => void): void {
  const lang = getLang();
  const isLight = document.documentElement.classList.contains('light');

  host.innerHTML = `
    <div class="tl-wrap">
      <div class="tl-topbar">
        <div class="app-brand${onBack ? ' app-brand-btn' : ''}" id="tl-back" role="button" tabindex="0" title="Back to story">
          <span class="app-brand-name">${t('brand.name')}</span>
        </div>
        <button id="tl-menu-btn" class="app-menu-btn" aria-label="Menu">
          <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="22" height="22">
            <line x1="3" y1="6" x2="19" y2="6"/>
            <line x1="3" y1="11" x2="19" y2="11"/>
            <line x1="3" y1="16" x2="19" y2="16"/>
          </svg>
        </button>
      </div>

      <!-- Welcome Page cinematic menu -->
      <div id="tl-menu">
        <header class="sl-menu-header">
          <span class="sl-menu-brand">The Professional</span>
          <button id="tl-menu-close" aria-label="Close menu">✕</button>
        </header>
        <div class="sl-menu-items">
          <button class="sl-menu-item" id="tl-menu-blog">${lang === 'vi' ? 'Blog' : 'Blog'}</button>
          <button class="sl-menu-item" id="tl-menu-platform">${lang === 'vi' ? 'Nền tảng' : 'Platform'}</button>
          <div class="sl-menu-controls">
            <button class="sl-menu-ctrl${lang === 'en' ? ' active' : ''}" data-tll="en">EN</button>
            <button class="sl-menu-ctrl${lang === 'vi' ? ' active' : ''}" data-tll="vi">VI</button>
          </div>
          <button class="sl-menu-ctrl" id="tl-menu-theme">${isLight ? '☀️' : '🌙'}</button>
        </div>
      </div>

      <div class="tl-inner">

        <div class="tl-hero">
          <div class="tl-hero-text">
            <div class="tl-badge">${t('landing.badge')}</div>
            <h1 class="tl-h1">${t('landing.h1a')}<br/><span class="accent">${t('landing.h1b')}</span></h1>
            <p class="tl-sub">${t('landing.sub')}</p>
            <div class="tl-cta-row">
              <button id="tl-enter" class="btn tl-cta-btn">${t('landing.cta')}</button>
              <span class="muted tl-nosignup">${t('landing.nosignup')}</span>
            </div>
            <div class="tl-stats">
              <div class="tl-stat"><span class="tl-stat-v accent">3</span><span class="tl-stat-l">${lang === 'vi' ? 'Chiến lược quét' : 'Scan strategies'}</span></div>
              <div class="tl-stat-div"></div>
              <div class="tl-stat"><span class="tl-stat-v accent">0–100</span><span class="tl-stat-l">${lang === 'vi' ? 'Điểm chất lượng' : 'Quality score'}</span></div>
              <div class="tl-stat-div"></div>
              <div class="tl-stat"><span class="tl-stat-v accent">US + VN</span><span class="tl-stat-l">${lang === 'vi' ? 'Thị trường' : 'Markets'}</span></div>
              <div class="tl-stat-div"></div>
              <div class="tl-stat"><span class="tl-stat-v accent">${lang === 'vi' ? 'Miễn phí' : 'Free'}</span><span class="tl-stat-l">${lang === 'vi' ? 'Không cần đăng ký' : 'No sign-up'}</span></div>
            </div>
          </div>
          <div class="tl-chart-wrap" aria-hidden="true">${chartWidget()}</div>
        </div>

        <div class="tl-section-label">${t('landing.strat.title')}</div>
        <div class="tl-strategies">
          ${stratCard(t('landing.strat.qm.t'), t('landing.strat.qm.d'), iconQm())}
          ${stratCard(t('landing.strat.mom.t'), t('landing.strat.mom.d'), iconMom())}
          ${stratCard(t('landing.strat.surge.t'), t('landing.strat.surge.d'), iconSurge())}
        </div>

        <div class="tl-feature-grid">
          ${featCard(t('landing.f1.t'), t('landing.f1.d'), fSearch())}
          ${featCard(t('landing.f2.t'), t('landing.f2.d'), fChart())}
          ${featCard(t('landing.f3.t'), t('landing.f3.d'), fRegime())}
          ${featCard(t('landing.f4.t'), t('landing.f4.d'), fSectors())}
          ${featCard(t('landing.f5.t'), t('landing.f5.d'), fBacktest())}
          ${featCard(t('landing.f6.t'), t('landing.f6.d'), fPlanner())}
        </div>

        <p class="muted tl-foot">${t('foot.disclaimer')}</p>
      </div>
    </div>`;

  host.querySelector('#tl-enter')!.addEventListener('click', (e) => onEnter(e.currentTarget as Element));
  if (onBack) {
    const back = host.querySelector('#tl-back');
    back?.addEventListener('click', (e) => onBack(e.currentTarget as Element));
    back?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') onBack(back); });
  }

  // ── Welcome Page menu ────────────────────────────────────────────────────
  const tlMenu = host.querySelector<HTMLElement>('#tl-menu')!;
  const openTlMenu  = () => { tlMenu.classList.add('tl-menu--open'); document.body.style.overflow = 'hidden'; };
  const closeTlMenu = () => { tlMenu.classList.remove('tl-menu--open'); document.body.style.overflow = ''; };

  host.querySelector('#tl-menu-btn')!.addEventListener('click', openTlMenu);
  host.querySelector('#tl-menu-close')!.addEventListener('click', closeTlMenu);

  // Blog → back to landing story
  host.querySelector('#tl-menu-blog')!.addEventListener('click', (e) => {
    closeTlMenu();
    if (onBack) onBack(e.currentTarget as Element);
  });

  // Platform → enter the app
  host.querySelector('#tl-menu-platform')!.addEventListener('click', (e) => {
    closeTlMenu();
    onEnter(e.currentTarget as Element);
  });

  // Lang toggle
  host.querySelectorAll<HTMLElement>('[data-tll]').forEach((b) =>
    b.addEventListener('click', () => {
      pageTransition(b, () => {
        closeTlMenu();
        setLang(b.dataset.tll as 'en' | 'vi');
        renderToolLanding(host, onEnter, onBack);
      });
    }),
  );

  // Theme toggle
  host.querySelector('#tl-menu-theme')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as Element;
    const light = document.documentElement.classList.contains('light');
    pageTransition(btn, () => {
      closeTlMenu();
      applyTheme(light ? 'dark' : 'light');
      renderToolLanding(host, onEnter, onBack);
    });
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function stratCard(title: string, desc: string, icon: string): string {
  return `<div class="tl-strat-card">
    <div class="tl-strat-icon">${icon}</div>
    <strong>${title}</strong>
    <p class="muted">${desc}</p>
  </div>`;
}
function featCard(title: string, desc: string, icon: string): string {
  return `<div class="tl-feat-card card">
    <div class="tl-feat-icon">${icon}</div>
    <strong>${title}</strong>
    <p class="muted">${desc}</p>
  </div>`;
}

// ── Animated chart widget ─────────────────────────────────────────────────────

function chartWidget(): string {
  const candles: { o: number; h: number; l: number; c: number }[] = [
    { o: 52, h: 58, l: 50, c: 55 }, { o: 55, h: 60, l: 53, c: 57 },
    { o: 57, h: 63, l: 55, c: 61 }, { o: 61, h: 66, l: 58, c: 64 },
    { o: 64, h: 68, l: 60, c: 62 }, { o: 62, h: 65, l: 56, c: 58 },
    { o: 58, h: 62, l: 54, c: 60 }, { o: 60, h: 65, l: 57, c: 63 },
    { o: 63, h: 67, l: 59, c: 65 }, { o: 65, h: 68, l: 61, c: 63 },
    { o: 63, h: 66, l: 59, c: 61 }, { o: 61, h: 64, l: 58, c: 62 },
    { o: 62, h: 65, l: 60, c: 64 }, { o: 64, h: 67, l: 62, c: 63 },
    { o: 63, h: 65, l: 61, c: 62 }, { o: 62, h: 64, l: 61, c: 63 },
    { o: 63, h: 65, l: 62, c: 64 }, { o: 64, h: 65, l: 63, c: 63 },
    { o: 63, h: 64, l: 62, c: 63 }, { o: 63, h: 66, l: 62, c: 65 },
    { o: 65, h: 67, l: 63, c: 66 }, { o: 66, h: 70, l: 65, c: 69 },
    { o: 69, h: 73, l: 67, c: 72 }, { o: 72, h: 76, l: 70, c: 74 },
    { o: 74, h: 78, l: 72, c: 77 }, { o: 77, h: 81, l: 75, c: 79 },
    { o: 79, h: 83, l: 77, c: 82 }, { o: 82, h: 87, l: 80, c: 85 },
  ];
  const W = 340, H = 200, padL = 8, padR = 8, padT = 16, padB = 28;
  const allPx = candles.flatMap((c) => [c.h, c.l]);
  const minP = Math.min(...allPx) - 2, maxP = Math.max(...allPx) + 4;
  const span = maxP - minP;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = candles.length, slotW = plotW / n, candleW = Math.max(slotW * 0.55, 3);
  const py = (v: number) => padT + plotH - ((v - minP) / span) * plotH;
  const cx = (i: number) => padL + (i + 0.5) * slotW;

  const ema20: number[] = []; let ev20 = candles[0]!.c; const k20 = 2 / 21;
  const ema50: number[] = []; let ev50 = candles[0]!.c; const k50 = 2 / 51;
  for (const cd of candles) {
    ev20 = cd.c * k20 + ev20 * (1 - k20); ema20.push(ev20);
    ev50 = cd.c * k50 + ev50 * (1 - k50); ema50.push(ev50);
  }
  const poly = (arr: number[]) => arr.map((v, i) => `${cx(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

  const pivotY = py(64), entryY = py(65.5), stopY = py(61.5), targetY = py(74);
  const candleSvg = candles.map((cd, i) => {
    const bull = cd.c >= cd.o;
    const col = bull ? '#18d89a' : '#ff5266';
    const bodyTop = py(Math.max(cd.o, cd.c)), bodyBot = py(Math.min(cd.o, cd.c));
    const bodyH = Math.max(bodyBot - bodyTop, 1);
    return `<g class="lc-candle" style="animation-delay:${(i * 0.04).toFixed(2)}s">
      <line x1="${cx(i).toFixed(1)}" y1="${py(cd.h).toFixed(1)}" x2="${cx(i).toFixed(1)}" y2="${py(cd.l).toFixed(1)}" stroke="${col}" stroke-width="1.2"/>
      <rect x="${(cx(i) - candleW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" rx="1" fill="${col}" opacity=".9"/>
    </g>`;
  }).join('');

  return `<div class="lc-widget">
    <div class="lc-ticker-row">
      <span class="lc-ticker">DEMO</span>
      <span class="lc-price accent">$85.20</span>
      <span class="lc-change accent">+38.5%</span>
      <span class="lc-badge">VCP ✓</span>
      <span class="lc-score">Q 87</span>
    </div>
    <svg class="lc-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <line x1="${padL}" y1="${py(60)}" x2="${W-padR}" y2="${py(60)}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/>
      <line x1="${padL}" y1="${py(70)}" x2="${W-padR}" y2="${py(70)}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/>
      <line x1="${padL}" y1="${py(80)}" x2="${W-padR}" y2="${py(80)}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/>
      <polyline class="lc-ema50" points="${poly(ema50)}" fill="none" stroke="#5b8cff" stroke-width="1.4" stroke-linejoin="round"/>
      <polyline class="lc-ema20" points="${poly(ema20)}" fill="none" stroke="#18d89a" stroke-width="1.2" stroke-linejoin="round" opacity=".7"/>
      ${candleSvg}
      <line class="lc-pivot" x1="${padL}" y1="${pivotY.toFixed(1)}" x2="${W-padR}" y2="${pivotY.toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4 3"/>
      <text x="${W-padR-2}" y="${(pivotY-3).toFixed(0)}" text-anchor="end" font-size="8" fill="var(--warn)" font-family="monospace">PIVOT</text>
      <line class="lc-entry" x1="${cx(20).toFixed(1)}" y1="${entryY.toFixed(1)}" x2="${W-padR}" y2="${entryY.toFixed(1)}" stroke="#18d89a" stroke-width=".8" stroke-dasharray="3 2" opacity=".7"/>
      <text x="${W-padR-2}" y="${(entryY-3).toFixed(0)}" text-anchor="end" font-size="7.5" fill="#18d89a" font-family="monospace">ENTRY</text>
      <line class="lc-stop" x1="${cx(20).toFixed(1)}" y1="${stopY.toFixed(1)}" x2="${W-padR}" y2="${stopY.toFixed(1)}" stroke="#ff5266" stroke-width=".8" stroke-dasharray="3 2" opacity=".7"/>
      <text x="${W-padR-2}" y="${(stopY-3).toFixed(0)}" text-anchor="end" font-size="7.5" fill="#ff5266" font-family="monospace">STOP</text>
      <line class="lc-target" x1="${cx(20).toFixed(1)}" y1="${targetY.toFixed(1)}" x2="${W-padR}" y2="${targetY.toFixed(1)}" stroke="#18d89a" stroke-width=".8" stroke-dasharray="3 2" opacity=".5"/>
      <text x="${W-padR-2}" y="${(targetY-3).toFixed(0)}" text-anchor="end" font-size="7.5" fill="#18d89a" font-family="monospace">TARGET</text>
      <circle class="lc-dot" cx="${cx(n-1).toFixed(1)}" cy="${py(candles[n-1]!.c).toFixed(1)}" r="4" fill="#18d89a"/>
      <text x="${cx(0)}" y="${H-6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W1</text>
      <text x="${cx(7)}" y="${H-6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W2</text>
      <text x="${cx(14)}" y="${H-6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W3</text>
      <text x="${cx(21)}" y="${H-6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W4</text>
      <text x="${cx(27)}" y="${H-6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W5</text>
    </svg>
    <div class="lc-legend">
      <span class="lc-ema-dot" style="background:#18d89a"></span><span>EMA20</span>
      <span class="lc-ema-dot" style="background:#5b8cff"></span><span>EMA50</span>
      <span class="lc-ema-dot" style="background:var(--warn)"></span><span>Pivot</span>
    </div>
  </div>`;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function iconQm()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function iconMom()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/><line x1="12" y1="9" x2="12" y2="20"/><line x1="4" y1="4" x2="20" y2="4"/></svg>`; }
function iconSurge() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`; }
function fSearch()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`; }
function fChart()    { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="4" height="12"/><rect x="10" y="4" width="4" height="14"/><rect x="18" y="2" width="4" height="16"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`; }
function fRegime()   { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20"/><path d="M12 2v10l4 4"/></svg>`; }
function fSectors()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`; }
function fBacktest() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>`; }
function fPlanner()  { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`; }
