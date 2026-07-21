import { useNavigate } from "react-router-dom";
import { useNavigationHistory } from "../features/navigation/NavigationHistoryContext";
import { scrollAppToTop } from "../lib/scroll-to-top";

type BackButtonProps = {
  /** Route used when there is no in-app history to go back to. */
  fallbackTo: string;
  /** Accessible name for the control (also used when `title` is omitted). */
  label?: string;
  /** Optional visible label next to the arrow. */
  title?: string;
  /** Custom handler; skips history / fallback navigation when provided. */
  onBack?: () => void;
  /**
   * When the previous history entry matches, navigate to `fallbackTo` instead.
   * Useful on login pages to avoid returning to protected routes after logout.
   */
  skipHistoryWhenPreviousMatches?: (previousKey: string) => boolean;
  className?: string;
};

/**
 * Consistent back control for nested / workflow pages only
 * (e.g. register, forgot/reset password, future detail views).
 * Do not place on dashboards or primary sidebar destinations.
 *
 * Prefers in-app router history, otherwise `fallbackTo`.
 * Always opens the destination at the top of the page.
 */
export function BackButton({
  fallbackTo,
  label = "Go back",
  title,
  onBack,
  skipHistoryWhenPreviousMatches,
  className = "",
}: BackButtonProps) {
  const navigate = useNavigate();
  const history = useNavigationHistory();

  function handleClick() {
    if (onBack) {
      history?.requestScrollToTop();
      onBack();
      window.requestAnimationFrame(() => scrollAppToTop());
      return;
    }
    if (history) {
      history.goBack(fallbackTo, {
        skipPrevious: skipHistoryWhenPreviousMatches,
      });
      return;
    }
    scrollAppToTop();
    navigate(fallbackTo);
    window.requestAnimationFrame(() => scrollAppToTop());
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className={[
        "group inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/15 px-3 text-sm text-white/80 transition",
        "hover:border-[var(--gold)] hover:text-[var(--gold-soft)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]",
        "active:scale-[0.98]",
        className,
      ].join(" ")}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 transition group-hover:-translate-x-0.5"
      >
        <path
          d="M15 6L9 12L15 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {title ? <span className="pr-1 font-medium">{title}</span> : null}
    </button>
  );
}

/** Previous entries that should not be restored from tenant auth screens. */
export function isProtectedTenantHistoryKey(previousKey: string) {
  if (!previousKey.startsWith("/tenant")) return false;
  return !(
    previousKey.startsWith("/tenant/login") ||
    previousKey.startsWith("/tenant/forgot-password") ||
    previousKey.startsWith("/tenant/reset-password")
  );
}
