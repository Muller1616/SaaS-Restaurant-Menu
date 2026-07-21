import {
  createContext,
  useCallback,
  useContext,
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
  setCurrentBranchId,
  setTenantSession,
  updateStoredTenant,
  type TenantSession,
} from "../../lib/tenant-session";

type LoginResult = {
  token: string;
  tenant: TenantSession;
};

type TenantAuthContextValue = {
  tenant: TenantSession | null;
  token: string | null;
  currentBranchId: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<TenantSession>;
  logout: () => void;
  refreshTenant: () => Promise<void>;
  setBranch: (branchId: string) => void;
  markPasswordChanged: () => void;
};

const TenantAuthContext = createContext<TenantAuthContextValue | null>(null);

export function TenantAuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<TenantSession | null>(() => getStoredTenant());
  const [token, setToken] = useState<string | null>(() => getTenantToken());
  const [currentBranchId, setBranchState] = useState<string | null>(() =>
    getCurrentBranchId(),
  );

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const { data } = await api.post<ApiSuccess<LoginResult>>("/auth/tenant/login", {
        email,
        password,
        rememberMe,
      });

      setTenantSession(data.data.token, data.data.tenant);
      setToken(data.data.token);
      setTenant(data.data.tenant);
      setBranchState(getCurrentBranchId());
      return data.data.tenant;
    },
    [],
  );

  const logout = useCallback(() => {
    void api.post("/auth/tenant/logout").catch(() => undefined);
    clearTenantSession();
    setToken(null);
    setTenant(null);
    setBranchState(null);
  }, []);

  const refreshTenant = useCallback(async () => {
    const { data } = await api.get<ApiSuccess<TenantSession>>("/auth/tenant/me");
    updateStoredTenant(data.data);
    setTenant(data.data);
    const branchId = getCurrentBranchId();
    if (
      branchId &&
      !data.data.branches.some((branch) => branch.id === branchId)
    ) {
      const next = data.data.defaultBranchId ?? data.data.branches[0]?.id ?? null;
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
      isAuthenticated: Boolean(token && tenant),
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
      login,
      logout,
      refreshTenant,
      setBranch,
      markPasswordChanged,
    ],
  );

  return (
    <TenantAuthContext.Provider value={value}>{children}</TenantAuthContext.Provider>
  );
}

export function useTenantAuth() {
  const ctx = useContext(TenantAuthContext);
  if (!ctx) {
    throw new Error("useTenantAuth must be used within TenantAuthProvider");
  }
  return ctx;
}
