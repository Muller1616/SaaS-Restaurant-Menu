export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN";
};

const TOKEN_KEY = "kitchenos_admin_token";
const USER_KEY = "kitchenos_admin_user";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredAdmin(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, admin: AdminUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(admin));
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
