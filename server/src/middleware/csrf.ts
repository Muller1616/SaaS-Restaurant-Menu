import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "./error.js";

export const CSRF_COOKIE = "kitchenos_csrf";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function issueToken() {
  return randomBytes(32).toString("hex");
}

/** Issues a double-submit CSRF token (cookie + JSON body). */
export function csrfTokenHandler(req: Request, res: Response) {
  const token = issueToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "strict",
    secure: env.nodeEnv === "production",
    path: "/",
  });
  res.json({ success: true, data: { csrfToken: token } });
}

/**
 * SRS §6.2 CSRF protection for mutating API calls.
 * Double-submit: cookie must match X-CSRF-Token header.
 * Also rejects cross-site Origin/Referer when present.
 */
export function csrfProtect(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  // CSRF bootstrap is GET-only; mutating calls still require the token.
  const origin = req.get("origin");
  const referer = req.get("referer");
  if (origin && origin !== env.clientUrl) {
    next(new AppError(403, "Invalid request origin"));
    return;
  }
  if (referer && !referer.startsWith(env.clientUrl)) {
    next(new AppError(403, "Invalid request referer"));
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get(CSRF_HEADER) || undefined;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    next(new AppError(403, "CSRF token missing or invalid"));
    return;
  }

  next();
}
