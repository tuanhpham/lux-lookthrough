import { $ } from '../ui/dom.js';
import { getLang } from '../ui/i18n.js';
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
 */
export function renderAbout(): void {
  const root = $('#tab-about')!;

  root.innerHTML = `
    <div class="about-page">
      <section class="about-story sl-wrap">
        <div class="sl-snap about-snap">
          <div class="sl-story">${buildStoryChapters(storyCopy(getLang()))}</div>
        </div>
        <div class="sl-veil about-veil"></div>
      </section>
    </div>`;

  wireCinematic({
    snap: root.querySelector<HTMLElement>('.about-snap')!,
    veil: root.querySelector<HTMLElement>('.about-veil')!,
  });
}
