import { t, getLang, setLang } from './i18n.js';
import { applyTheme } from './theme.js';

/** Full-screen hero landing, shown before the app. Calls `onEnter` on CTA. */
export function renderLanding(host: HTMLElement, onEnter: () => void): void {
  const isLight = document.documentElement.classList.contains('light');
  const logoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M21 7v5h-5"/></svg>`;

  host.innerHTML = `
    <div class="landing">
      <div class="landing-glow"></div>

      <!-- ── Top bar ──────────────────────────────────── -->
      <div class="landing-topbar">
        <div class="landing-brand">
          <div class="logo logo-svg">${logoSvg}</div>
          <span class="brand-name">${t('brand.name')}</span>
        </div>
        <div class="landing-topbar-right">
          <div class="lang-toggle" role="group" aria-label="Language">
            <button data-ll="en" class="${getLang() === 'en' ? 'active' : ''}">EN</button>
            <button data-ll="vi" class="${getLang() === 'vi' ? 'active' : ''}">VI</button>
          </div>
          <button id="landing-theme" class="theme-toggle" title="Toggle theme">${isLight ? '☀️' : '🌙'}</button>
        </div>
      </div>

      <!-- ── Hero: text + animated chart ────────────────── -->
      <div class="landing-inner">
        <div class="landing-hero">
          <div class="landing-hero-text">
            <div class="landing-badge">${t('landing.badge')}</div>
            <h1 class="landing-h1">${t('landing.h1a')}<br /><span class="accent">${t('landing.h1b')}</span></h1>
            <p class="landing-sub">${t('landing.sub')}</p>
            <div class="landing-cta-row">
              <button id="enter-app" class="btn landing-cta-btn">${t('landing.cta')}</button>
              <span class="muted landing-nosignup">${t('landing.nosignup')}</span>
            </div>
            <!-- stat strip -->
            <div class="landing-stats">
              <div class="landing-stat"><span class="landing-stat-v accent">3</span><span class="landing-stat-l">${getLang() === 'vi' ? 'Chiến lược quét' : 'Scan strategies'}</span></div>
              <div class="landing-stat-div"></div>
              <div class="landing-stat"><span class="landing-stat-v accent">0–100</span><span class="landing-stat-l">${getLang() === 'vi' ? 'Điểm chất lượng' : 'Quality score'}</span></div>
              <div class="landing-stat-div"></div>
              <div class="landing-stat"><span class="landing-stat-v accent">US + VN</span><span class="landing-stat-l">${getLang() === 'vi' ? 'Thị trường' : 'Markets'}</span></div>
              <div class="landing-stat-div"></div>
              <div class="landing-stat"><span class="landing-stat-v accent">${getLang() === 'vi' ? 'Miễn phí' : 'Free'}</span><span class="landing-stat-l">${getLang() === 'vi' ? 'Không cần đăng ký' : 'No sign-up'}</span></div>
            </div>
          </div>

          <!-- Animated chart widget -->
          <div class="landing-chart-wrap" aria-hidden="true">
            ${chartWidget()}
          </div>
        </div>

        <!-- ── Strategy strip ──────────────────────────── -->
        <div class="landing-section-label">${t('landing.strat.title')}</div>
        <div class="landing-strategies">
          ${stratCard('landing.strat.qm.t', 'landing.strat.qm.d', stratIconQm())}
          ${stratCard('landing.strat.mom.t', 'landing.strat.mom.d', stratIconMom())}
          ${stratCard('landing.strat.surge.t', 'landing.strat.surge.d', stratIconSurge())}
        </div>

        <!-- ── Feature grid ────────────────────────────── -->
        <div class="landing-feature-grid">
          ${featureCard('landing.f1.t', 'landing.f1.d', featureIconSearch())}
          ${featureCard('landing.f2.t', 'landing.f2.d', featureIconChart())}
          ${featureCard('landing.f3.t', 'landing.f3.d', featureIconRegime())}
          ${featureCard('landing.f4.t', 'landing.f4.d', featureIconSectors())}
          ${featureCard('landing.f5.t', 'landing.f5.d', featureIconBacktest())}
          ${featureCard('landing.f6.t', 'landing.f6.d', featureIconPlanner())}
        </div>

        <p class="muted landing-foot">${t('foot.disclaimer')}</p>
      </div>
    </div>`;

  host.querySelector('#enter-app')!.addEventListener('click', onEnter);
  host.querySelectorAll<HTMLElement>('[data-ll]').forEach((b) =>
    b.addEventListener('click', () => {
      setLang(b.dataset.ll as 'en' | 'vi');
      renderLanding(host, onEnter);
    }),
  );
  host.querySelector('#landing-theme')!.addEventListener('click', () => {
    const light = document.documentElement.classList.contains('light');
    applyTheme(light ? 'dark' : 'light');
    renderLanding(host, onEnter);
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function stratCard(titleKey: string, descKey: string, icon: string): string {
  return `<div class="landing-strat-card">
    <div class="landing-strat-icon">${icon}</div>
    <strong>${t(titleKey)}</strong>
    <p class="muted">${t(descKey)}</p>
  </div>`;
}

function featureCard(titleKey: string, descKey: string, icon: string): string {
  return `<div class="landing-feat-card card">
    <div class="landing-feat-icon">${icon}</div>
    <strong>${t(titleKey)}</strong>
    <p class="muted">${t(descKey)}</p>
  </div>`;
}

// ── Animated chart widget (pure SVG + CSS animations, no JS runtime) ──────────
function chartWidget(): string {
  // Simulated VCP base: 28 candles, contracting volatility, then breakout
  const candles: { o: number; h: number; l: number; c: number }[] = [
    { o: 52, h: 58, l: 50, c: 55 },
    { o: 55, h: 60, l: 53, c: 57 },
    { o: 57, h: 63, l: 55, c: 61 },
    { o: 61, h: 66, l: 58, c: 64 },
    { o: 64, h: 68, l: 60, c: 62 },
    { o: 62, h: 65, l: 56, c: 58 },
    { o: 58, h: 62, l: 54, c: 60 },
    { o: 60, h: 65, l: 57, c: 63 },
    { o: 63, h: 67, l: 59, c: 65 },
    { o: 65, h: 68, l: 61, c: 63 },
    { o: 63, h: 66, l: 59, c: 61 },
    { o: 61, h: 64, l: 58, c: 62 },
    { o: 62, h: 65, l: 60, c: 64 },
    { o: 64, h: 67, l: 62, c: 63 },   // base tightening
    { o: 63, h: 65, l: 61, c: 62 },
    { o: 62, h: 64, l: 61, c: 63 },
    { o: 63, h: 65, l: 62, c: 64 },
    { o: 64, h: 65, l: 63, c: 63 },   // tightest — pivot forms
    { o: 63, h: 64, l: 62, c: 63 },
    { o: 63, h: 66, l: 62, c: 65 },
    { o: 65, h: 67, l: 63, c: 66 },   // breakout starts
    { o: 66, h: 70, l: 65, c: 69 },
    { o: 69, h: 73, l: 67, c: 72 },
    { o: 72, h: 76, l: 70, c: 74 },
    { o: 74, h: 78, l: 72, c: 77 },
    { o: 77, h: 81, l: 75, c: 79 },
    { o: 79, h: 83, l: 77, c: 82 },
    { o: 82, h: 87, l: 80, c: 85 },
  ];

  const W = 340;
  const H = 200;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const allPx = candles.flatMap((c) => [c.h, c.l]);
  const minP = Math.min(...allPx) - 2;
  const maxP = Math.max(...allPx) + 4;
  const span = maxP - minP;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = candles.length;
  const slotW = plotW / n;
  const candleW = Math.max(slotW * 0.55, 3);

  const py = (v: number) => padT + plotH - ((v - minP) / span) * plotH;
  const cx = (i: number) => padL + (i + 0.5) * slotW;

  // EMA20 — simple approximation
  const ema20: number[] = [];
  let emaVal = candles[0]!.c;
  const k20 = 2 / 21;
  for (const cd of candles) { emaVal = cd.c * k20 + emaVal * (1 - k20); ema20.push(emaVal); }

  // EMA50 — approximated over shorter series
  const ema50: number[] = [];
  let emaVal50 = candles[0]!.c;
  const k50 = 2 / 51;
  for (const cd of candles) { emaVal50 = cd.c * k50 + emaVal50 * (1 - k50); ema50.push(emaVal50); }

  const polyline = (arr: number[]) =>
    arr.map((v, i) => `${cx(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

  // Pivot line (bar 17, the tightest close)
  const pivotPrice = 64;
  const pivotY = py(pivotPrice);
  // Entry, stop, target markers
  const entryY = py(65.5);
  const stopY  = py(61.5);
  const targetY = py(74);

  const candleSvg = candles.map((cd, i) => {
    const bull = cd.c >= cd.o;
    const color = bull ? '#18d89a' : '#ff5266';
    const bodyTop = py(Math.max(cd.o, cd.c));
    const bodyBot = py(Math.min(cd.o, cd.c));
    const bodyH = Math.max(bodyBot - bodyTop, 1);
    const delay = (i * 0.04).toFixed(2);
    return `<g class="lc-candle" style="animation-delay:${delay}s">
      <line x1="${cx(i).toFixed(1)}" y1="${py(cd.h).toFixed(1)}" x2="${cx(i).toFixed(1)}" y2="${py(cd.l).toFixed(1)}" stroke="${color}" stroke-width="1.2"/>
      <rect x="${(cx(i) - candleW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${candleW.toFixed(1)}" height="${bodyH.toFixed(1)}" rx="1" fill="${color}" opacity=".9"/>
    </g>`;
  }).join('');

  return `
  <div class="lc-widget">
    <div class="lc-ticker-row">
      <span class="lc-ticker">DEMO</span>
      <span class="lc-price accent">$85.20</span>
      <span class="lc-change accent">+38.5%</span>
      <span class="lc-badge">VCP ✓</span>
      <span class="lc-score">Q 87</span>
    </div>
    <svg class="lc-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <!-- grid lines -->
      <line x1="${padL}" y1="${py(60)}" x2="${W - padR}" y2="${py(60)}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/>
      <line x1="${padL}" y1="${py(70)}" x2="${W - padR}" y2="${py(70)}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/>
      <line x1="${padL}" y1="${py(80)}" x2="${W - padR}" y2="${py(80)}" stroke="var(--border)" stroke-width=".6" stroke-dasharray="3 3"/>
      <!-- EMA50 -->
      <polyline class="lc-ema50" points="${polyline(ema50)}" fill="none" stroke="#5b8cff" stroke-width="1.4" stroke-linejoin="round"/>
      <!-- EMA20 -->
      <polyline class="lc-ema20" points="${polyline(ema20)}" fill="none" stroke="#18d89a" stroke-width="1.2" stroke-linejoin="round" opacity=".7"/>
      <!-- Candles -->
      ${candleSvg}
      <!-- Pivot dashed line -->
      <line class="lc-pivot" x1="${padL}" y1="${pivotY.toFixed(1)}" x2="${W - padR}" y2="${pivotY.toFixed(1)}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="4 3"/>
      <text x="${(W - padR - 2).toFixed(0)}" y="${(pivotY - 3).toFixed(0)}" text-anchor="end" font-size="8" fill="var(--warn)" font-family="monospace">PIVOT</text>
      <!-- Entry / Stop / Target annotations -->
      <line class="lc-entry" x1="${cx(20).toFixed(1)}" y1="${entryY.toFixed(1)}" x2="${W - padR}" y2="${entryY.toFixed(1)}" stroke="#18d89a" stroke-width=".8" stroke-dasharray="3 2" opacity=".7"/>
      <text x="${(W - padR - 2)}" y="${(entryY - 3).toFixed(0)}" text-anchor="end" font-size="7.5" fill="#18d89a" font-family="monospace">ENTRY</text>
      <line class="lc-stop" x1="${cx(20).toFixed(1)}" y1="${stopY.toFixed(1)}" x2="${W - padR}" y2="${stopY.toFixed(1)}" stroke="#ff5266" stroke-width=".8" stroke-dasharray="3 2" opacity=".7"/>
      <text x="${(W - padR - 2)}" y="${(stopY - 3).toFixed(0)}" text-anchor="end" font-size="7.5" fill="#ff5266" font-family="monospace">STOP</text>
      <line class="lc-target" x1="${cx(20).toFixed(1)}" y1="${targetY.toFixed(1)}" x2="${W - padR}" y2="${targetY.toFixed(1)}" stroke="#18d89a" stroke-width=".8" stroke-dasharray="3 2" opacity=".5"/>
      <text x="${(W - padR - 2)}" y="${(targetY - 3).toFixed(0)}" text-anchor="end" font-size="7.5" fill="#18d89a" font-family="monospace">TARGET</text>
      <!-- Live price dot pulsing -->
      <circle class="lc-dot" cx="${cx(n - 1).toFixed(1)}" cy="${py(candles[n - 1]!.c).toFixed(1)}" r="4" fill="#18d89a"/>
      <!-- X-axis labels -->
      <text x="${cx(0)}" y="${H - 6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W1</text>
      <text x="${cx(7)}" y="${H - 6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W2</text>
      <text x="${cx(14)}" y="${H - 6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W3</text>
      <text x="${cx(21)}" y="${H - 6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W4</text>
      <text x="${cx(27)}" y="${H - 6}" text-anchor="middle" font-size="7.5" fill="var(--faint)" font-family="monospace">W5</text>
    </svg>
    <div class="lc-legend">
      <span class="lc-ema-dot" style="background:#18d89a"></span><span>EMA20</span>
      <span class="lc-ema-dot" style="background:#5b8cff"></span><span>EMA50</span>
      <span class="lc-ema-dot" style="background:var(--warn)"></span><span>Pivot</span>
    </div>
  </div>`;
}

// ── Strategy icons ─────────────────────────────────────────────────────────────
function stratIconQm(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>`;
}
function stratIconMom(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15"/><line x1="12" y1="9" x2="12" y2="20"/><line x1="4" y1="4" x2="20" y2="4"/>
  </svg>`;
}
function stratIconSurge(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>`;
}

// ── Feature icons ──────────────────────────────────────────────────────────────
function featureIconSearch(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
}
function featureIconChart(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="4" height="12"/><rect x="10" y="4" width="4" height="14"/><rect x="18" y="2" width="4" height="16"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`;
}
function featureIconRegime(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20"/><path d="M12 2v10l4 4"/></svg>`;
}
function featureIconSectors(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;
}
function featureIconBacktest(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>`;
}
function featureIconPlanner(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
}
