import { flushSync } from "react-dom";

/**
 * Run a React state/router update inside the View Transitions API when available.
 * Falls back to an instant update (no opacity remount hacks).
 */
export function runViewTransition(update: () => void) {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (
    reducedMotion ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function"
  ) {
    update();
    return;
  }

  document.startViewTransition(() => {
    flushSync(update);
  });
}
