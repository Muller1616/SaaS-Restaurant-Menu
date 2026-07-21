import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import {
  disableBrowserScrollRestoration,
  scrollAppToTop,
} from "../../lib/scroll-to-top";
import { runViewTransition } from "./run-view-transition";

type NavigationHistoryApi = {
  canGoBack: boolean;
  goBack: (
    fallbackTo: string,
    options?: {
      skipPrevious?: (previousKey: string) => boolean;
    },
  ) => void;
  requestScrollToTop: () => void;
};

const NavigationHistoryContext = createContext<NavigationHistoryApi | null>(
  null,
);

function locationKey(pathname: string, search: string) {
  return `${pathname}${search}`;
}

type StackApi = {
  stackRef: MutableRefObject<string[]>;
  setCanGoBack: (value: boolean) => void;
};

const StackApiContext = createContext<StackApi | null>(null);

/**
 * Owns back-stack + scroll policy without re-rendering the whole app tree
 * on every route change. Route effects live in a sibling that returns null.
 */
export function NavigationHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const stackRef = useRef<string[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);

  const stackApi = useMemo<StackApi>(
    () => ({ stackRef, setCanGoBack }),
    [],
  );

  const requestScrollToTop = useCallback(() => {
    scrollAppToTop();
  }, []);

  const goBack = useCallback(
    (
      fallbackTo: string,
      options?: {
        skipPrevious?: (previousKey: string) => boolean;
      },
    ) => {
      const perform = () => {
        if (stackRef.current.length > 1) {
          const previous = stackRef.current[stackRef.current.length - 2] ?? "";
          if (options?.skipPrevious?.(previous)) {
            navigate(fallbackTo, { replace: true });
            return;
          }
          navigate(-1);
          return;
        }
        navigate(fallbackTo, { replace: true });
      };
      runViewTransition(perform);
    },
    [navigate],
  );

  const api = useMemo<NavigationHistoryApi>(
    () => ({
      canGoBack,
      goBack,
      requestScrollToTop,
    }),
    [canGoBack, goBack, requestScrollToTop],
  );

  return (
    <StackApiContext.Provider value={stackApi}>
      <NavigationHistoryContext.Provider value={api}>
        <RouteNavigationEffects />
        {children}
      </NavigationHistoryContext.Provider>
    </StackApiContext.Provider>
  );
}

/**
 * Subscribes to location. Re-renders alone (returns null) so auth providers
 * and route shells are not forced to update on every navigation.
 */
function RouteNavigationEffects() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const stackApi = useContext(StackApiContext);
  const lastScrollKeyRef = useRef<string | null>(null);
  const restorationReady = useRef(false);

  useLayoutEffect(() => {
    if (!restorationReady.current) {
      disableBrowserScrollRestoration();
      restorationReady.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (!stackApi) return;

    const key = locationKey(location.pathname, location.search);
    const stack = stackApi.stackRef.current;
    const last = stack[stack.length - 1];

    if (last !== key) {
      let next: string[];
      if (navigationType === "REPLACE") {
        next = stack.length === 0 ? [key] : [...stack.slice(0, -1), key];
      } else {
        const existing = stack.lastIndexOf(key);
        if (existing !== -1) {
          next = stack.slice(0, existing + 1);
        } else {
          const pushed = [...stack, key];
          next = pushed.length > 40 ? pushed.slice(pushed.length - 40) : pushed;
        }
      }
      stackApi.stackRef.current = next;
      const nextCanGoBack = next.length > 1;
      stackApi.setCanGoBack(nextCanGoBack);
    }

    // Single pre-paint scroll reset. No rAF/timeout loops (those cause vibration).
    if (lastScrollKeyRef.current !== key) {
      lastScrollKeyRef.current = key;
      scrollAppToTop();
    }
  }, [location.pathname, location.search, navigationType, stackApi]);

  return null;
}

export function useNavigationHistory() {
  return useContext(NavigationHistoryContext);
}
