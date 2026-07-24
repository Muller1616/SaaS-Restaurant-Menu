import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type ApiSuccess } from "../../lib/api";
import {
  clearTenantSession,
  getCurrentBranchId,
  getStoredTenant,
  getTenantToken,
  isTenantTokenExpired,
  setCurrentBranchId,
  setTenantSession,
  updateStoredTenant,
  type TenantSession,
} from "../../lib/tenant-session";

type LoginResult = {
  token: string;
  tenant: TenantSession;
};

export type TenantAuthStatus = "loading" | "authenticated" | "anonymous";

type TenantAuthContextValue = {
  tenant: TenantSession | null;
  token: string | null;
  currentBranchId: string | null;
  status: TenantAuthStatus;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<TenantSession>;
  logout: () => void;
  refreshTenant: () => Promise<void>;
  setBranch: (branchId: string) => void;
  markPasswordChanged: () => void;
};

const TenantAuthContext = createContext<TenantAuthContextValue | null>(null);

export function TenantAuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantSession | null>(() =>
    getStoredTenant(),
  );
  const [token, setToken] = useState<string | null>(() => getTenantToken());
  const [currentBranchId, setBranchState] = useState<string | null>(() =>
    getCurrentBranchId(),
  );
  const [status, setStatus] = useState<TenantAuthStatus>(() => {
    const existing = getTenantToken();
    if (!existing || isTenantTokenExpired(existing) || !getStoredTenant()) {
      return existing ? "loading" : "anonymous";
    }
    return "loading";
  });

  const applyAnonymous = useCallback(() => {
    clearTenantSession();
    setToken(null);
    setTenant(null);
    setBranchState(null);
    setStatus("anonymous");
  }, []);

  const applySession = useCallback(
    (nextToken: string, nextTenant: TenantSession, rememberMe = true) => {
      setTenantSession(nextToken, nextTenant, rememberMe);
      setToken(nextToken);
      setTenant(nextTenant);
      setBranchState(getCurrentBranchId());
      setStatus("authenticated");
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const existingToken = getTenantToken();
      const existingTenant = getStoredTenant();

      if (
        !existingToken ||
        isTenantTokenExpired(existingToken) ||
        !existingTenant
      ) {
        if (!cancelled) applyAnonymous();
        return;
      }

      try {
        const { data } = await api.get<ApiSuccess<TenantSession>>(
          "/auth/tenant/me",
        );
        if (cancelled) return;
        applySession(
          existingToken,
          data.data,
          Boolean(localStorage.getItem("kitchenos_tenant_token")),
        );
      } catch {
        if (!cancelled) applyAnonymous();
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applyAnonymous, applySession]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "kitchenos_tenant_token") return;
      if (!event.newValue) applyAnonymous();
    }
    function onForcedLogout() {
      applyAnonymous();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("kitchenos-tenant-logout", onForcedLogout);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kitchenos-tenant-logout", onForcedLogout);
    };
  }, [applyAnonymous]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const { data } = await api.post<ApiSuccess<LoginResult>>(
        "/auth/tenant/login",
        {
          email,
          password,
          rememberMe,
        },
      );

      applySession(data.data.token, data.data.tenant, rememberMe);
      return data.data.tenant;
    },
    [applySession],
  );

  const logout = useCallback(() => {
    void api.post("/auth/tenant/logout").catch(() => undefined);
    applyAnonymous();
  }, [applyAnonymous]);

  const refreshTenant = useCallback(async () => {
    const { data } = await api.get<ApiSuccess<TenantSession>>("/auth/tenant/me");
    updateStoredTenant(data.data);
    setTenant(data.data);
    setStatus("authenticated");
    const branchId = getCurrentBranchId();
    if (
      branchId &&
      !data.data.branches.some((branch) => branch.id === branchId)
    ) {
      const next =
        data.data.defaultBranchId ?? data.data.branches[0]?.id ?? null;
      if (next) {
        setCurrentBranchId(next);
        setBranchState(next);
      }
    }
  }, []);

  const setBranch = useCallback((branchId: string) => {
    setCurrentBranchId(branchId);
    setBranchState(branchId);
  }, []);

  const markPasswordChanged = useCallback(() => {
    setTenant((prev) => {
      if (!prev) return prev;
      const next = { ...prev, mustChangePassword: false };
      updateStoredTenant(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      tenant,
      token,
      currentBranchId,
      status,
      isAuthenticated: status === "authenticated" && Boolean(token && tenant),
      login,
      logout,
      refreshTenant,
      setBranch,
      markPasswordChanged,
    }),
    [
      tenant,
      token,
      currentBranchId,
      status,
      login,
      logout,
      refreshTenant,
      setBranch,
      markPasswordChanged,
    ],
  );

  return (
    <TenantAuthContext.Provider value={value}>
      {children}
    </TenantAuthContext.Provider>
  );
}

export function useTenantAuth() {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) {
    throw new Error("useTenantAuth must be used within TenantAuthProvider");
  }
  return ctx;
}
