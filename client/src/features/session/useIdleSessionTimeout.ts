import { useCallback, useEffect, useRef, useState } from "react";
import {
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_IDLE_MS,
  SESSION_WARNING_MS,
} from "../../lib/session-timeout-config";
import { createSessionSync } from "./session-sync";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "touchmove",
  "scroll",
  "wheel",
] as const;

type Options = {
  enabled: boolean;
  channelName: string;
  idleMs?: number;
  warningMs?: number;
  /** Called when the idle timeout fully elapses (local or remote). */
  onTimeout: () => void;
};

/**
 * Detects user inactivity and drives a pre-logout warning countdown.
 * Cross-tab activity / logout / stay-logged-in are synchronized.
 */
export function useIdleSessionTimeout({
  enabled,
  channelName,
  idleMs = SESSION_IDLE_MS,
  warningMs = SESSION_WARNING_MS,
  onTimeout,
}: Options) {
  const warnAfterMs = Math.max(0, idleMs - warningMs);

  const [isWarning, setIsWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    Math.ceil(warningMs / 1000),
  );

  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const warnTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef(0);
  const warningActiveRef = useRef(false);
  const timedOutRef = useRef(false);
  const syncRef = useRef<ReturnType<typeof createSessionSync> | null>(null);

  const clearTimers = useCallback(() => {
    if (warnTimerRef.current != null) {
      window.clearTimeout(warnTimerRef.current);
      warnTimerRef.current = null;
    }
    if (logoutTimerRef.current != null) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const finishTimeout = useCallback(() => {
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    warningActiveRef.current = false;
    clearTimers();
    setIsWarning(false);
    syncRef.current?.broadcastLogout();
    onTimeoutRef.current();
  }, [clearTimers]);

  const startWarning = useCallback(() => {
    if (warningActiveRef.current || timedOutRef.current) return;
    warningActiveRef.current = true;
    setIsWarning(true);
    setSecondsLeft(Math.ceil(warningMs / 1000));

    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current);
    }
    countdownTimerRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        return next > 0 ? next : 0;
      });
    }, 1_000);

    if (logoutTimerRef.current != null) {
      window.clearTimeout(logoutTimerRef.current);
    }
    logoutTimerRef.current = window.setTimeout(() => {
      finishTimeout();
    }, warningMs);
  }, [finishTimeout, warningMs]);

  const armTimers = useCallback(() => {
    clearTimers();
    warningActiveRef.current = false;
    setIsWarning(false);
    setSecondsLeft(Math.ceil(warningMs / 1000));

    warnTimerRef.current = window.setTimeout(() => {
      startWarning();
    }, warnAfterMs);
  }, [clearTimers, startWarning, warnAfterMs, warningMs]);

  const resetIdle = useCallback(
    (broadcast: boolean) => {
      if (!enabled || timedOutRef.current) return;
      const now = Date.now();
      if (now - lastActivityRef.current < SESSION_ACTIVITY_THROTTLE_MS) {
        // Still reset timers on activity during warning even if throttled broadcast
        if (!warningActiveRef.current) return;
      }
      lastActivityRef.current = now;
      armTimers();
      if (broadcast) syncRef.current?.broadcastActivity();
    },
    [armTimers, enabled],
  );

  const stayLoggedIn = useCallback(() => {
    if (!enabled || timedOutRef.current) return;
    lastActivityRef.current = Date.now();
    armTimers();
    syncRef.current?.broadcastExtend();
  }, [armTimers, enabled]);

  const logoutNow = useCallback(() => {
    finishTimeout();
  }, [finishTimeout]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      warningActiveRef.current = false;
      timedOutRef.current = false;
      setIsWarning(false);
      syncRef.current?.destroy();
      syncRef.current = null;
      return;
    }

    timedOutRef.current = false;
    armTimers();

    const sync = createSessionSync(channelName, {
      onRemoteActivity: () => resetIdle(false),
      onRemoteExtend: () => {
        lastActivityRef.current = Date.now();
        armTimers();
      },
      onRemoteLogout: () => {
        if (timedOutRef.current) return;
        timedOutRef.current = true;
        warningActiveRef.current = false;
        clearTimers();
        setIsWarning(false);
        onTimeoutRef.current();
      },
    });
    syncRef.current = sync;

    const onActivity = () => resetIdle(true);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, {
        capture: true,
        passive: true,
      });
    }

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity, true);
      }
      clearTimers();
      sync.destroy();
      syncRef.current = null;
    };
  }, [armTimers, channelName, clearTimers, enabled, resetIdle]);

  return {
    isWarning,
    secondsLeft,
    stayLoggedIn,
    logoutNow,
  };
}
