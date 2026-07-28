import { env } from "../config/env.js";

/**
 * Turn a stored media path into a browser-usable URL.
 * Cloudinary (and other absolute) URLs pass through unchanged.
 * Legacy `/uploads/...` paths are prefixed with PUBLIC_API_URL when set.
 */
export function toPublicMediaUrl(
  mediaPath: string | null | undefined,
  requestOrigin?: string,
): string | null {
  if (!mediaPath) return null;
  if (
    mediaPath.startsWith("http://") ||
    mediaPath.startsWith("https://") ||
    mediaPath.startsWith("data:")
  ) {
    return mediaPath;
  }

  const normalized = mediaPath.startsWith("/") ? mediaPath : `/${mediaPath}`;
  const origin = (env.publicApiUrl || requestOrigin || "").replace(/\/$/, "");
  if (!origin) return normalized;
  return `${origin}${normalized}`;
}
