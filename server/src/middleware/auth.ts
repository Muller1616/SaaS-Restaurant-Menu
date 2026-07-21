import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error.js";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";

export type AuthedRequest = Request & {
  user?: AccessTokenPayload;
};

export function requireAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Authentication required"));
  }

  try {
    const token = header.slice("Bearer ".length).trim();
    req.user = verifyAccessToken(token);
    return next();
  } catch {
    return next(new AppError(401, "Invalid or expired token"));
  }
}

export function requireAdmin(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user || req.user.role !== "ADMIN") {
    return next(new AppError(403, "Admin access required"));
  }
  return next();
}

/** Platform owner actions: plans, delete tenant, ops jobs. */
export function requireSuperAdmin(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user || req.user.role !== "ADMIN") {
    return next(new AppError(403, "Admin access required"));
  }
  if (req.user.adminRole !== "SUPER_ADMIN") {
    return next(
      new AppError(403, "Super admin access required", {
        code: "SUPER_ADMIN_REQUIRED",
      }),
    );
  }
  return next();
}

export function requireTenant(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user || req.user.role !== "TENANT") {
    return next(new AppError(403, "Tenant access required"));
  }
  return next();
}
