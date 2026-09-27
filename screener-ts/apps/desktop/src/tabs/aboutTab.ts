import { $ } from '../ui/dom.js';
import { getLang, t } from '../ui/i18n.js';
import { buildStoryChapters, storyCopy, wireCinematic } from '../ui/story.js';

/**
 * About = the story. Nothing else.
 *
 * It used to be a CV page — avatar, pull quote, three pillars, a footer of meta —
 * with the story wedged in the middle. The story is the only part anyone came for,
 * and a chapter needs the whole screen to work, so everything that was competing
 * with it for space is gone. The facts it used to list (who, built with what, the
 * disclaimer) live on the landing page, which is where a first-time visitor is.
 *
 * One full screen per chapter, contained: the tab is exactly one viewport tall, so
 * there is no page scroll behind the chapters to fight with.
 *
 * `onDiscover` is what the round button at the end does. Back when the story WAS
 * the front page, that button was the way into the platform; the story is a tab
 * now, so the caller says where it leads. Omit it and there is no button — better
 * than a dead one.
 */
export function renderAbout(onDiscover?: (trigger?: Element) => void): void {
  const root = $('#tab-about')!;

  root.innerHTML = `
    <div class="about-page">
      <section class="about-story sl-wrap">
        <div class="sl-snap about-snap">
          <div class="sl-story">${buildStoryChapters(storyCopy(getLang()))}</div>
        </div>
        <div class="sl-veil about-veil"></div>
        ${onDiscover ? `
        <div class="sl-exit about-exit">
          <button class="sl-exit-btn" id="about-exit-btn"><span>${t('story.discover')}</span></button>
        </div>` : ''}
      </section>
    </div>`;

  // Absolute inside `.about-story`, not fixed over the window — same reason as the
  // veil: the app's top bar is not part of the story and must not be dimmed with it.
  const exit = root.querySelector<HTMLElement>('.about-exit') ?? undefined;
  root.querySelector('#about-exit-btn')?.addEventListener('click', (e) => {
    onDiscover?.(e.currentTarget as Element);
  });

  wireCinematic({
    snap: root.querySelector<HTMLElement>('.about-snap')!,
    veil: root.querySelector<HTMLElement>('.about-veil')!,
    exit,
  });
}
