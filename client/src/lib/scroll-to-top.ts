/** Marker for nested scroll containers (e.g. admin main panel). */
export const SCROLL_ROOT_ATTR = "data-scroll-root";

/**
 * Instantly reset window + app scroll roots to the top.
 * Uses instant positioning (no smooth animation) to avoid flicker after back nav.
 */
export function scrollAppToTop() {
  const html = document.documentElement;
  const body = document.body;
  const prevHtml = html.style.scrollBehavior;
  const prevBody = body.style.scrollBehavior;

  html.style.scrollBehavior = "auto";
  body.style.scrollBehavior = "auto";

  window.scrollTo(0, 0);
  html.scrollTop = 0;
  body.scrollTop = 0;

  document.querySelectorAll<HTMLElement>(`[${SCROLL_ROOT_ATTR}]`).forEach((el) => {
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = "auto";
    el.scrollTop = 0;
    el.scrollLeft = 0;
    el.style.scrollBehavior = prev;
  });

  html.style.scrollBehavior = prevHtml;
  body.style.scrollBehavior = prevBody;
}
