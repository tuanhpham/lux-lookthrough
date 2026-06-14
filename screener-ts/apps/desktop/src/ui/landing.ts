import { t } from './i18n.js';

/** Full-screen hero landing, shown before the app. Calls `onEnter` on CTA. */
export function renderLanding(host: HTMLElement, onEnter: () => void): void {
  host.innerHTML = `
    <div class="landing">
      <div class="landing-inner">
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
}
