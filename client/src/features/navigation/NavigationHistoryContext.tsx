import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { scrollAppToTop } from "../../lib/scroll-to-top";

type NavigationHistoryApi = {
  canGoBack: boolean;
  goBack: (fallbackTo: string) => void;
  /** Mark the next route change to open at scroll top (used by BackButton). */
  requestScrollToTop: () => void;
};

const NavigationHistoryContext = createContext<NavigationHistoryApi | null>(
  null,
);

function locationKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

/**
 * Tracks in-app route history so BackButton can prefer the previous page
 * without relying on browser-specific history heuristics.
 */
export function NavigationHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const stackRef = useRef<string[]>([]);
  const pendingScrollTopRef = useRef(false);
  const [stackSize, setStackSize] = useState(0);

  useLayoutEffect(() => {
    const key = locationKey(location.pathname, location.search);
    const stack = stackRef.current;
    const last = stack[stack.length - 1];
    if (last === key) return;

    let next: string[];
    if (navigationType === "REPLACE") {
      next = stack.length === 0 ? [key] : [...stack.slice(0, -1), key];
    } else {
      const existing = stack.lastIndexOf(key);
      if (existing !== -1) {
        // POP / revisit — trim forward history
        next = stack.slice(0, existing + 1);
      } else {
        const pushed = [...stack, key];
        next = pushed.length > 40 ? pushed.slice(pushed.length - 40) : pushed;
      }
    }

    stackRef.current = next;
    setStackSize(next.length);
  }, [location.pathname, location.search, navigationType]);

  // After Back Arrow navigation, pin the destination at the top before paint
  // and again shortly after to beat browser scroll restoration on POP.
  useLayoutEffect(() => {
    if (!pendingScrollTopRef.current) return;

    scrollAppToTop();

    const frame = window.requestAnimationFrame(() => {
      scrollAppToTop();
      pendingScrollTopRef.current = false;
    });
    const timeout = window.setTimeout(() => {
      scrollAppToTop();
    }, 0);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [location.pathname, location.search]);

  const requestScrollToTop = useCallback(() => {
    pendingScrollTopRef.current = true;
  }, []);

  const goBack = useCallback(
    (fallbackTo: string) => {
      pendingScrollTopRef.current = true;
      if (stackRef.current.length > 1) {
        navigate(-1);
        return;
      }
      // Replace so returning here cannot create a back/forward loop
      navigate(fallbackTo, { replace: true });
    },
    [navigate],
  );

  const api = useMemo<NavigationHistoryApi>(
    () => ({
      canGoBack: stackSize > 1,
      goBack,
      requestScrollToTop,
    }),
    [goBack, requestScrollToTop, stackSize],
  );

  return (
    <NavigationHistoryContext.Provider value={api}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  return useContext(NavigationHistoryContext);
}
