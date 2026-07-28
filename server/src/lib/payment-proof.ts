import type { Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";
import { fetchRemoteImageBuffer, isCloudinaryUrl } from "./cloudinary-media.js";

/** Resolve a legacy `/uploads/payments/...` path under uploadDir. */
function resolveLegacyPaymentProofPath(screenshotUrl: string) {
  const marker = "/uploads/payments/";
  const idx = screenshotUrl.indexOf(marker);
  if (idx === -1) {
    throw new AppError(400, "Invalid payment proof path");
  }
  const relative = screenshotUrl.slice(idx + "/uploads/".length);
  const absolute = path.resolve(env.uploadDir, relative);
  const paymentsRoot = path.resolve(env.uploadDir, "payments");
  if (!absolute.startsWith(paymentsRoot + path.sep) && absolute !== paymentsRoot) {
    throw new AppError(400, "Invalid payment proof path");
  }
  if (!fs.existsSync(absolute)) {
    throw new AppError(404, "Payment proof not found");
  }
  return absolute;
}

/**
 * Stream a payment proof to the client after auth.
 * Cloudinary URLs are fetched server-side so proofs stay behind the API.
 * Legacy local paths remain supported during migration.
 */
export async function sendPaymentProofFile(
  res: Response,
  screenshotUrl: string,
) {
  if (isCloudinaryUrl(screenshotUrl) || /^https?:\/\//i.test(screenshotUrl)) {
    const buffer = await fetchRemoteImageBuffer(screenshotUrl);
    if (!buffer) {
      throw new AppError(404, "Payment proof not found");
    }
    const lower = screenshotUrl.toLowerCase();
    const type = lower.includes(".png")
      ? "image/png"
      : lower.includes(".webp")
        ? "image/webp"
        : lower.includes(".gif")
          ? "image/gif"
          : "image/jpeg";
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(buffer);
    return;
  }

  const absolute = resolveLegacyPaymentProofPath(screenshotUrl);
  const ext = path.extname(absolute).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "private, max-age=300");
  fs.createReadStream(absolute).pipe(res);
}
