import axios from "axios";
import { getApiBaseUrl } from "./api-base";
import {
  isTenantPortalPathname,
  looksLikePublicQrId,
} from "./tenant-paths";

export const CSRF_HEADER = "X-CSRF-Token";

const apiBase = getApiBaseUrl();

export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  const { data } = await axios.get<{
    success: true;
    data: { csrfToken: string };
  }>(`${apiBase}/auth/csrf`, { withCredentials: true });
  csrfToken = data.data.csrfToken;
  return csrfToken;
}

/** Ensure a double-submit CSRF cookie + header value is ready. */
export async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetchCsrfToken().finally(() => {
      csrfPromise = null;
    });
  }
  return csrfPromise;
}

const MUTATING = new Set(["post", "put", "patch", "delete"]);

function isTenantFrontendPath(path: string) {
  if (path.startsWith("/admin")) return false;
  if (
    path === "/tenant/login" ||
    path.startsWith("/tenant/forgot-password") ||
    path.startsWith("/tenant/reset-password") ||
    path.startsWith("/tenant/activate")
  ) {
    return false;
  }
  // Public QR menu — no tenant JWT required
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "r" && parts.length === 2 && looksLikePublicQrId(parts[1])) {
    return false;
  }
  if (parts[0] === "r" && parts[2] === "activate") return false;
  if (isTenantPortalPathname(path)) return true;
  return path.startsWith("/tenant");
}

api.interceptors.request.use(async (config) => {
  const path = window.location.pathname;
  const adminToken = localStorage.getItem("kitchenos_admin_token");
  const tenantToken = localStorage.getItem("kitchenos_tenant_token");
  const branchId = localStorage.getItem("kitchenos_current_branch_id");

  const url = String(config.url ?? "");
  const prefersAdmin =
    path.startsWith("/admin") ||
    url.includes("/admin") ||
    url.includes("/auth/admin");
  const prefersTenant =
    isTenantFrontendPath(path) ||
    path.startsWith("/tenant") ||
    url.includes("/tenant") ||
    url.includes("/auth/tenant");

  const token = prefersAdmin
    ? adminToken
    : prefersTenant
      ? tenantToken
      : tenantToken || adminToken;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (prefersTenant && branchId) {
    config.headers["X-Branch-Id"] = branchId;
  }

  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  const method = (config.method ?? "get").toLowerCase();
  if (MUTATING.has(method) && !url.includes("/auth/csrf")) {
    const csrf = await ensureCsrfToken();
    config.headers[CSRF_HEADER] = csrf;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403) {
      const message = String(error.response?.data?.message ?? "");
      const cfg = error.config as
        | (typeof error.config & { _csrfRetry?: boolean })
        | undefined;
      if (
        message.toLowerCase().includes("csrf") &&
        cfg &&
        !cfg._csrfRetry
      ) {
        cfg._csrfRetry = true;
        csrfToken = null;
        try {
          const csrf = await ensureCsrfToken();
          cfg.headers = cfg.headers ?? {};
          cfg.headers[CSRF_HEADER] = csrf;
          return api.request(cfg);
        } catch {
          // fall through
        }
      }
    }

    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path.startsWith("/admin") && path !== "/admin/login") {
        localStorage.removeItem("kitchenos_admin_token");
        localStorage.removeItem("kitchenos_admin_user");
        window.dispatchEvent(new Event("kitchenos-admin-logout"));
        window.location.assign("/admin/login?reason=session");
      }
      if (isTenantFrontendPath(path)) {
        localStorage.removeItem("kitchenos_tenant_token");
        localStorage.removeItem("kitchenos_tenant_user");
        localStorage.removeItem("kitchenos_current_branch_id");
        window.dispatchEvent(new Event("kitchenos-tenant-logout"));
        window.location.assign("/tenant/login?reason=session");
      }
    }

    if (error.response?.status === 403) {
      const code = (error.response.data as { details?: { code?: string } } | undefined)
        ?.details?.code;
      const path = window.location.pathname;
      if (
        isTenantFrontendPath(path) &&
        (code === "TENANT_SUSPENDED" || code === "TENANT_INACTIVE")
      ) {
        localStorage.removeItem("kitchenos_tenant_token");
        localStorage.removeItem("kitchenos_tenant_user");
        localStorage.removeItem("kitchenos_current_branch_id");
        window.dispatchEvent(new Event("kitchenos-tenant-logout"));
        window.location.assign("/tenant/login?reason=session");
      }
    }
    return Promise.reject(error);
  },
);

export type ApiSuccess<T> = {
  success: true;
  data: T;
};
