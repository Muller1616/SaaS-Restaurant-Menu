import path from "node:path";
import { env } from "../config/env.js";

/**
 * Turn a stored media path (`/uploads/...`) into a browser-usable URL.
 * In production, prefer an absolute API origin so Vercel can load Render files.
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

/** Resolve `/uploads/...` relative path under the upload root safely. */
export function resolveUploadPath(mediaPath: string) {
  const marker = "/uploads/";
  const idx = mediaPath.indexOf(marker);
  const relative =
    idx >= 0 ? mediaPath.slice(idx + marker.length) : mediaPath.replace(/^\//, "");
  const absolute = path.resolve(env.uploadDir, relative);
  const root = path.resolve(env.uploadDir);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw new Error("Invalid upload path");
  }
  return absolute;
}
