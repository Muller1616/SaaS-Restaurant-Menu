import {
  NavLink,
  useLocation,
  useNavigate,
  useResolvedPath,
  type NavLinkProps,
} from "react-router-dom";
import { runViewTransition } from "./run-view-transition";

/**
 * NavLink that crossfades only the `.app-page` region via View Transitions.
 * Modified clicks (new tab, etc.) keep native browser behavior.
 */
export function AppNavLink({ to, onClick, ...rest }: NavLinkProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const resolved = useResolvedPath(to);

  return (
    <NavLink
      to={to}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const same =
          location.pathname === resolved.pathname &&
          location.search === resolved.search;
        if (same) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        runViewTransition(() => {
          navigate(to);
        });
      }}
    />
  );
}
