import { useQueryClient } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { SessionTimeoutModal } from "./SessionTimeoutModal";
import { useIdleSessionTimeout } from "./useIdleSessionTimeout";

type Props = {
  enabled: boolean;
  /** Login route, e.g. `/admin/login` or `/tenant/login`. */
  loginPath: string;
  /** Sync channel unique to this auth role. */
  channelName: string;
  /** Clears client auth + calls server logout. */
  onLogout: () => void;
  /** Override total idle window (ms). Defaults to shared SESSION_IDLE_MS. */
  idleMs?: number;
  /** Override warning window (ms). Defaults to shared SESSION_WARNING_MS. */
  warningMs?: number;
  children: ReactNode;
};

/**
 * Wraps authenticated route trees with idle detection + timeout warning UI.
 */
export function IdleSessionGuard({
  enabled,
  loginPath,
  channelName,
  onLogout,
  idleMs,
  warningMs,
  children,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const expireSession = useCallback(() => {
    onLogout();
    queryClient.clear();
    navigate(`${loginPath}?reason=idle`, { replace: true });
  }, [loginPath, navigate, onLogout, queryClient]);

  const { isWarning, secondsLeft, stayLoggedIn, logoutNow } =
    useIdleSessionTimeout({
      enabled,
      channelName,
      idleMs,
      warningMs,
      onTimeout: expireSession,
    });

  return (
    <>
      {children}
      {isWarning && (
        <SessionTimeoutModal
          secondsLeft={secondsLeft}
          onStay={stayLoggedIn}
          onLogout={logoutNow}
        />
      )}
    </>
  );
}
