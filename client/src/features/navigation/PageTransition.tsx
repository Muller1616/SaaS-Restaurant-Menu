import { Outlet } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Stable page content frame for route outlets.
 * Does NOT remount on navigation (no key) — remount + opacity fades caused flicker.
 * Uses the View Transitions API name so only this region animates when enabled.
 */
export function PageTransition({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["app-page", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/** Layout route helper: stable page frame + nested `<Outlet />`. */
export function RouteTransitionOutlet() {
  return (
    <PageTransition>
      <Outlet />
    </PageTransition>
  );
}
