/**
 * Cinematic page transition.
 *
 * Phase 1 (0 → 900ms)  — circle slowly expands from the trigger origin,
 *                         easing in gently like a shutter opening.
 * Phase 2 (700ms)       — callback fires while screen is fully covered.
 * Phase 3 (900 → 1800ms)— overlay fades out smoothly, revealing the new page.
 * Phase 4 (1850ms)      — cleanup, pointer-events restored.
 */

const EXPAND_MS  = 1400;  // circle expand duration
const HOLD_MS    = 900;   // when to fire callback (inside expand)
const FADE_MS    = 0;     // overlay fade-out — instant cut to new page
const FADE_START = 1450;  // when to start fade (just after expand completes)
const CLEANUP_MS = FADE_START + FADE_MS + 50;

let rippleEl: HTMLDivElement | null = null;

function getEl(): HTMLDivElement {
  if (!rippleEl) {
    rippleEl = document.createElement('div');
    rippleEl.id = 'nav-ripple';
    document.body.appendChild(rippleEl);
  }
  return rippleEl;
}

export function pageTransition(trigger: Element | null, callback: () => void): void {
  const el = getEl();

  // Origin: centre of the trigger, as viewport percentages
  let ox = 50, oy = 50;
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    ox = ((r.left + r.width  / 2) / window.innerWidth)  * 100;
    oy = ((r.top  + r.height / 2) / window.innerHeight) * 100;
  }

  // Reset without transition
  el.style.transition = 'none';
  el.style.opacity    = '1';
  el.style.clipPath   = `circle(0% at ${ox}% ${oy}%)`;
  void el.offsetWidth; // flush

  // Phase 1 — slow cinematic expand
  el.style.transition = `clip-path ${EXPAND_MS}ms cubic-bezier(.25, .1, .25, 1)`;
  el.style.clipPath   = `circle(170% at ${ox}% ${oy}%)`;

  // Fire callback while covered
  const cbTimer = setTimeout(callback, HOLD_MS);

  // Phase 2 — slow fade out
  const fadeTimer = setTimeout(() => {
    el.style.transition = `opacity ${FADE_MS}ms cubic-bezier(.4, 0, .2, 1)`;
    el.style.opacity    = '0';
  }, FADE_START);

  // Cleanup
  const cleanTimer = setTimeout(() => {
    el.style.transition = 'none';
    el.style.opacity    = '1';
    el.style.clipPath   = `circle(0% at ${ox}% ${oy}%)`;
  }, CLEANUP_MS);

  // Safety: cancel pending timers if called again before completion
  (el as HTMLDivElement & { _pt?: number[] })._pt?.forEach(clearTimeout);
  (el as HTMLDivElement & { _pt?: number[] })._pt = [cbTimer, fadeTimer, cleanTimer];
}
