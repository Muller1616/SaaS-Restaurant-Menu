import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./error.js";
import type { AuthedRequest } from "./auth.js";

/**
 * Blocks tenant API access until the temporary password from approval is changed.
 * Change-password lives under /api/v1/auth (not /tenant), so it remains reachable.
 */
export async function requirePasswordChanged(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (req.user?.role !== "TENANT") {
      next();
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.sub },
      select: { mustChangePassword: true, status: true },
    });

    if (!tenant) {
      throw new AppError(401, "Unauthorized");
    }

    if (tenant.mustChangePassword) {
      throw new AppError(
        403,
        "Please change your temporary password before continuing.",
        { code: "MUST_CHANGE_PASSWORD" },
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
