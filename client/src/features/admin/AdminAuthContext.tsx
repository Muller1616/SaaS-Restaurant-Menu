import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAdminSession,
  getAdminToken,
  getStoredAdmin,
  isAdminTokenExpired,
  setAdminSession,
  type AdminUser,
} from "../../lib/admin-session";
import { api, type ApiSuccess } from "../../lib/api";

type LoginResult = {
  token: string;
  admin: AdminUser;
};

export type AdminAuthStatus = "loading" | "authenticated" | "anonymous";

type AdminAuthContextValue = {
  admin: AdminUser | null;
  token: string | null;
  /** False until bootstrap finishes — never treat as logged-in during loading. */
  status: AdminAuthStatus;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(() => getStoredAdmin());
  const [token, setToken] = useState<string | null>(() => getAdminToken());
  const [status, setStatus] = useState<AdminAuthStatus>(() => {
    const existing = getAdminToken();
    if (!existing || isAdminTokenExpired(existing) || !getStoredAdmin()) {
      return existing ? "loading" : "anonymous";
    }
    return "loading";
  });

  const applyAnonymous = useCallback(() => {
    clearAdminSession();
    setToken(null);
    setAdmin(null);
    setStatus("anonymous");
  }, []);

  const applySession = useCallback(
    (nextToken: string, nextAdmin: AdminUser, rememberMe = true) => {
      setAdminSession(nextToken, nextAdmin, rememberMe);
      setToken(nextToken);
      setAdmin(nextAdmin);
      setStatus("authenticated");
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const existingToken = getAdminToken();
      const existingAdmin = getStoredAdmin();

      if (!existingToken || isAdminTokenExpired(existingToken) || !existingAdmin) {
        if (!cancelled) applyAnonymous();
        return;
      }

      try {
        const { data } = await api.get<
          ApiSuccess<{
            id: string;
            name: string;
            email: string;
            role: "SUPER_ADMIN" | "ADMIN";
          }>
        >("/auth/admin/me");

        if (cancelled) return;
        applySession(existingToken, {
          id: data.data.id,
          name: data.data.name,
          email: data.data.email,
          role: data.data.role,
        }, Boolean(localStorage.getItem("kitchenos_admin_token")));
      } catch {
        if (!cancelled) applyAnonymous();
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [applyAnonymous, applySession]);

  // Cross-tab / interceptor logout
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== "kitchenos_admin_token") return;
      if (!event.newValue) applyAnonymous();
    }
    function onForcedLogout() {
      applyAnonymous();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("kitchenos-admin-logout", onForcedLogout);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("kitchenos-admin-logout", onForcedLogout);
    };
  }, [applyAnonymous]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const { data } = await api.post<ApiSuccess<LoginResult>>("/auth/admin/login", {
        email,
        password,
        rememberMe,
      });
      applySession(data.data.token, data.data.admin, rememberMe);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    void api.post("/auth/admin/logout").catch(() => undefined);
    applyAnonymous();
  }, [applyAnonymous]);

  const value = useMemo(
    () => ({
      admin,
      token,
      status,
      isAuthenticated: status === "authenticated" && Boolean(token && admin),
      login,
      logout,
    }),
    [admin, token, status, login, logout],
  );

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
}
