import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearAdminSession,
  getAdminToken,
  getStoredAdmin,
  setAdminSession,
  type AdminUser,
} from "../../lib/admin-session";
import { api, type ApiSuccess } from "../../lib/api";

type LoginResult = {
  token: string;
  admin: AdminUser;
};

type AdminAuthContextValue = {
  admin: AdminUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(() => getStoredAdmin());
  const [token, setToken] = useState<string | null>(() => getAdminToken());

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const { data } = await api.post<ApiSuccess<LoginResult>>("/auth/admin/login", {
        email,
        password,
        rememberMe,
      });

      setAdminSession(data.data.token, data.data.admin);
      setToken(data.data.token);
      setAdmin(data.data.admin);
    },
    [],
  );

  const logout = useCallback(() => {
    void api.post("/auth/admin/logout").catch(() => undefined);
    clearAdminSession();
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      token,
      isAuthenticated: Boolean(token && admin),
      login,
      logout,
    }),
    [admin, token, login, logout],
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
