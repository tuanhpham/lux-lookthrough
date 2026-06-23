import { t, getLang, setLang } from './i18n.js';
import { applyTheme } from './theme.js';

/** Full-screen hero landing, shown before the app. Calls `onEnter` on CTA. */
export function renderLanding(host: HTMLElement, onEnter: () => void): void {
  const isLight = document.documentElement.classList.contains('light');
  const logoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M21 7v5h-5"/></svg>`;
  host.innerHTML = `
    <div class="landing">
      <div class="landing-glow"></div>
      <div class="landing-inner">
        <div class="row" style="margin-bottom:36px">
          <div style="display:flex;align-items:center;gap:11px">
            <div class="logo logo-svg">${logoSvg}</div>
            <div class="brand-name" style="font-size:18px">${t('brand.name')}</div>
          </div>
          <div class="row" style="margin-left:auto;gap:8px">
            <div class="lang-toggle" role="group" aria-label="Language">
              <button data-ll="en" class="${getLang() === 'en' ? 'active' : ''}">EN</button>
              <button data-ll="vi" class="${getLang() === 'vi' ? 'active' : ''}">VI</button>
            </div>
            <button id="landing-theme" class="theme-toggle" title="Toggle theme">${isLight ? '☀️' : '🌙'}</button>
          </div>
        </div>
        <div class="landing-badge">${t('landing.badge')}</div>
        <h1 class="landing-h1">${t('landing.h1a')}<br /><span class="accent">${t('landing.h1b')}</span></h1>
        <p class="landing-sub">${t('landing.sub')}</p>
        <div class="row" style="gap:16px;margin:24px 0 40px">
          <button id="enter-app" class="btn" style="font-size:15px;padding:12px 22px">${t('landing.cta')}</button>
          <span class="muted">${t('landing.nosignup')}</span>
        </div>
        <div class="grid grid-cards">
          ${[
            ['landing.f1.t', 'landing.f1.d'],
            ['landing.f2.t', 'landing.f2.d'],
            ['landing.f3.t', 'landing.f3.d'],
            ['landing.f4.t', 'landing.f4.d'],
          ]
            .map(
              ([tk, dk]) =>
                `<div class="card"><strong>${t(tk!)}</strong><p class="muted" style="margin:6px 0 0;line-height:1.5">${t(dk!)}</p></div>`,
            )
            .join('')}
        </div>
        <p class="muted" style="text-align:center;margin-top:40px;font-size:12px">${t('foot.disclaimer')}</p>
      </div>
    </div>`;
  host.querySelector('#enter-app')!.addEventListener('click', onEnter);
  host.querySelectorAll<HTMLElement>('[data-ll]').forEach((b) =>
    b.addEventListener('click', () => {
      setLang(b.dataset.ll as 'en' | 'vi');
      renderLanding(host, onEnter); // re-render landing in the new language
    }),
  );
  host.querySelector('#landing-theme')!.addEventListener('click', () => {
    const light = document.documentElement.classList.contains('light');
    applyTheme(light ? 'dark' : 'light');
    renderLanding(host, onEnter);
  });
}
