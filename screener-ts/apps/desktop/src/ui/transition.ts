/**
 * Cinematic page transition — "curtain lift" from the trigger point.
 *
 * 1. Overlay instantly covers the full screen.
 * 2. Callback fires immediately — new page renders underneath.
 * 3. A growing transparent circle expands from the trigger origin,
 *    "lifting" the curtain to reveal the new page outward from that point.
 */

const UNVEIL_MS = 1400; // how long the hole takes to expand across the screen

let rippleEl: HTMLDivElement | null = null;
let rafId = 0;

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

  // Cancel any in-progress animation
  if (rafId) cancelAnimationFrame(rafId);

  // Origin: centre of trigger as viewport percentages
  let ox = 50, oy = 50;
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    ox = ((r.left + r.width  / 2) / window.innerWidth)  * 100;
    oy = ((r.top  + r.height / 2) / window.innerHeight) * 100;
  }

  type S = CSSStyleDeclaration & { webkitMaskImage: string };

  const setMask = (val: string) => {
    el.style.maskImage = val;
    (el.style as S).webkitMaskImage = val;
  };

  // Show full overlay instantly — solid, no mask
  el.style.transition = 'none';
  el.style.opacity    = '1';
  setMask('none');
  void el.offsetWidth; // flush paint

  // Navigate immediately while screen is covered
  callback();

  // Give the browser two frames to render the new page, then start unveiling
  rafId = requestAnimationFrame(() => {
    rafId = requestAnimationFrame(() => {
      let start = 0;
      // ease-out quart: fast burst from origin, coast gently to edges
      const ease = (t: number) => 1 - (1 - t) ** 4;

      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min((now - start) / UNVEIL_MS, 1);
        const r = ease(t) * 175; // 175% radius reaches all four corners
        // transparent hole grows outward; solid ring surrounds it
        setMask(`radial-gradient(circle at ${ox}% ${oy}%, transparent ${r - 0.5}%, black ${r + 0.5}%)`);

        if (t < 1) {
          rafId = requestAnimationFrame(step);
        } else {
          el.style.opacity = '0';
          setMask('none');
          rafId = 0;
        }
      };

      rafId = requestAnimationFrame(step);
    });
  });
}
