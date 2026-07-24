export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN";
};

const TOKEN_KEY = "kitchenos_admin_token";
const USER_KEY = "kitchenos_admin_user";

function readStorage(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function writeSession(
  token: string,
  admin: AdminUser,
  rememberMe: boolean,
) {
  const primary = rememberMe ? localStorage : sessionStorage;
  const secondary = rememberMe ? sessionStorage : localStorage;
  secondary.removeItem(TOKEN_KEY);
  secondary.removeItem(USER_KEY);
  primary.setItem(TOKEN_KEY, token);
  primary.setItem(USER_KEY, JSON.stringify(admin));
}

export function getAdminToken() {
  return readStorage(TOKEN_KEY);
}

export function getStoredAdmin(): AdminUser | null {
  const raw = readStorage(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function setAdminSession(
  token: string,
  admin: AdminUser,
  rememberMe = true,
) {
  writeSession(token, admin, rememberMe);
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/** True when a JWT is missing, malformed, or past `exp`. */
export function isAdminTokenExpired(token: string | null | undefined) {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return true;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number; role?: string };
    if (payload.role && payload.role !== "ADMIN") return true;
    if (typeof payload.exp !== "number") return true;
    return payload.exp * 1000 <= Date.now() - 5_000;
  } catch {
    return true;
  }
}

/** Safe post-login path inside the admin portal. */
export function safeAdminReturnPath(pathname: string | null | undefined) {
  if (!pathname) return "/admin/dashboard";
  if (!pathname.startsWith("/admin")) return "/admin/dashboard";
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login?")) {
    return "/admin/dashboard";
  }
  if (pathname === "/admin") return "/admin/dashboard";
  return pathname;
}
