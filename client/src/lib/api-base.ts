/**
 * API origin for production (Vercel → Render).
 * Example: https://kitchenos-api.onrender.com
 * Leave empty in local dev so Vite proxy (`/api`, `/uploads`) is used.
 */
export function getApiOrigin(): string {
  const raw = String(import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
  return raw;
}

/** Axios / fetch base for KitchenOS API v1. */
export function getApiBaseUrl(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api/v1` : "/api/v1";
}

/**
 * Resolve media paths like `/uploads/menu/...` for production.
 * Relative paths work with the Vite proxy locally.
 */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
    return path;
  }
  const origin = getApiOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
