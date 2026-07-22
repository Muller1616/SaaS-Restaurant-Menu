import type { Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";

/** Resolve a stored /uploads/payments/... URL to an absolute path under uploadDir. */
export function resolvePaymentProofPath(screenshotUrl: string) {
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

export function sendPaymentProofFile(res: Response, screenshotUrl: string) {
  const absolute = resolvePaymentProofPath(screenshotUrl);
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
