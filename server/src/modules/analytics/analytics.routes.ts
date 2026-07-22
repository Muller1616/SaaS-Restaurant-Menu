import { Router } from "express";
import {
  requireAuth,
  requireTenant,
} from "../../middleware/auth.js";
import {
  requireBranchContext,
  type BranchAuthedRequest,
} from "../../middleware/branch-context.js";
import { requirePasswordChanged } from "../../middleware/require-password-changed.js";
import { getBranchAnalytics } from "./analytics.service.js";

export const analyticsRouter = Router();

analyticsRouter.use(
  requireAuth,
  requireTenant,
  requirePasswordChanged,
  requireBranchContext,
);

analyticsRouter.get("/", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await getBranchAnalytics({
      tenantId: req.user!.sub,
      branchId: req.branchId!,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
