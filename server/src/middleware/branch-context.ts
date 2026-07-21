import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  computeSubscriptionView,
  syncSubscriptionStatus,
} from "../modules/subscriptions/subscription.logic.js";
import type { AuthedRequest } from "./auth.js";
import { AppError } from "./error.js";

export type BranchAuthedRequest = AuthedRequest & {
  branchId?: string;
  branch?: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    phone: string | null;
    location: string;
    qrCodeUrl: string | null;
    subscription: {
      status: string;
      plan: {
        id: string;
        name: string;
        slug: string;
        maxItems: number | null;
        maxBranches: number;
        priceMonthly: { toString(): string };
      };
    } | null;
  };
  canEditMenu?: boolean;
};

export async function requireBranchContext(
  req: BranchAuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const branchId = String(req.header("x-branch-id") || "").trim();
    if (!branchId) {
      throw new AppError(400, "X-Branch-Id header is required");
    }

    const branch = await prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId: req.user!.sub,
        deletedAt: null,
      },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!branch) {
      throw new AppError(404, "Branch not found for this tenant");
    }

    if (branch.subscription) {
      await syncSubscriptionStatus(branch.subscription.id);
    }

    const freshSub = branch.subscription
      ? await prisma.subscription.findUnique({
          where: { id: branch.subscription.id },
          include: { plan: true },
        })
      : null;

    const view = freshSub
      ? computeSubscriptionView({
          status: freshSub.status,
          expiryDate: freshSub.expiryDate,
        })
      : null;

    req.branchId = branch.id;
    req.branch = {
      id: branch.id,
      tenantId: branch.tenantId,
      name: branch.name,
      slug: branch.slug,
      phone: branch.phone,
      location: branch.location,
      qrCodeUrl: branch.qrCodeUrl,
      subscription: freshSub,
    };
    req.canEditMenu = Boolean(view?.canEdit);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireEditableMenu(
  req: BranchAuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  if (!req.canEditMenu) {
    return next(
      new AppError(
        403,
        "Menu editing is available only while the branch subscription is ACTIVE. Renew to continue editing.",
        { code: "SUBSCRIPTION_READONLY" },
      ),
    );
  }
  return next();
}
