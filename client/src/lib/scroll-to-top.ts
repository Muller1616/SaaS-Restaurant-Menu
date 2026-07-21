/** Marker for nested scroll containers (e.g. admin main panel). */
export const SCROLL_ROOT_ATTR = "data-scroll-root";

/**
 * Disable the browser's automatic scroll restoration so the app
 * controls scroll position on every navigation (including Back).
 */
export function disableBrowserScrollRestoration() {
  if (typeof window === "undefined") return;
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
}

/**
 * Instantly reset window + app scroll roots to the top.
 * Call once from useLayoutEffect (before paint) — never animate.
 */
export function scrollAppToTop() {
  const html = document.documentElement;
  const body = document.body;

  html.style.scrollBehavior = "auto";
  body.style.scrollBehavior = "auto";

  if (window.scrollX !== 0 || window.scrollY !== 0) {
    window.scrollTo(0, 0);
  }
  if (html.scrollTop !== 0) html.scrollTop = 0;
  if (body.scrollTop !== 0) body.scrollTop = 0;

  document.querySelectorAll<HTMLElement>(`[${SCROLL_ROOT_ATTR}]`).forEach((el) => {
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  });
}
