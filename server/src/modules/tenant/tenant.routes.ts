import { Router } from "express";
import {
  requireAuth,
  requireTenant,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { getTenantProfile } from "../auth/auth.service.js";

export const tenantRouter = Router();

tenantRouter.use(requireAuth, requireTenant);

tenantRouter.get("/dashboard", async (req: AuthedRequest, res, next) => {
  try {
    const tenant = await getTenantProfile(req.user!.sub);
    const branchHeader = req.header("x-branch-id");
    const currentBranch =
      tenant.branches.find((branch) => branch.id === branchHeader) ??
      tenant.branches.find((branch) => branch.id === tenant.defaultBranchId) ??
      tenant.branches[0] ??
      null;

    res.json({
      success: true,
      data: {
        businessName: tenant.businessName,
        fullName: tenant.fullName,
        mustChangePassword: tenant.mustChangePassword,
        plan: tenant.selectedPlan,
        branchCount: tenant.branches.length,
        currentBranch,
        stats: {
          branches: tenant.branches.length,
          menuItems: null,
          subscriptionStatus: currentBranch?.subscription?.status ?? null,
          planName: currentBranch?.subscription?.plan.name ?? tenant.selectedPlan.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});
