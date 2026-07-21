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

type NavigationHistoryApi = {
  canGoBack: boolean;
  goBack: (fallbackTo: string) => void;
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

  const goBack = useCallback(
    (fallbackTo: string) => {
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
    }),
    [goBack, stackSize],
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
