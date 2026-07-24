import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";
import { AppError } from "./error.js";

export type AuthedRequest = Request & {
  user?: AccessTokenPayload;
};

export async function requireAuth(
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
    const payload = verifyAccessToken(token);

    if (payload.role === "ADMIN") {
      const admin = await prisma.adminUser.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true, role: true },
      });
      if (!admin || admin.tokenVersion !== payload.tokenVersion) {
        return next(
          new AppError(401, "Session has ended. Please sign in again.", {
            code: "TOKEN_REVOKED",
          }),
        );
      }
      // Prefer live DB role over stale JWT claim (demotion/promotion).
      payload.adminRole = admin.role;
    } else if (payload.role === "TENANT") {
      const tenant = await prisma.tenant.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });
      if (!tenant || tenant.tokenVersion !== payload.tokenVersion) {
        return next(
          new AppError(401, "Session has ended. Please sign in again.", {
            code: "TOKEN_REVOKED",
          }),
        );
      }
    } else {
      return next(new AppError(401, "Invalid or expired token"));
    }

    req.user = payload;
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
