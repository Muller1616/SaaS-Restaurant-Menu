import { Router } from "express";
import {
  requireAuth,
  requireTenant,
} from "../../middleware/auth.js";
import {
  requireBranchContext,
  type BranchAuthedRequest,
} from "../../middleware/branch-context.js";
import { AppError } from "../../middleware/error.js";
import { optimizeRequestImage } from "../../middleware/optimize-upload.js";
import { paymentUpload } from "../../middleware/upload.js";
import { listBranchSubscriptionHistory } from "../subscriptions/subscription-history.js";
import {
  cancelBranchSubscription,
  getBranchSubscription,
  listTenantPayments,
  renewSchema,
  submitRenewalPayment,
} from "../subscriptions/subscription.service.js";

export const subscriptionRouter = Router();

subscriptionRouter.use(requireAuth, requireTenant, requireBranchContext);

subscriptionRouter.get("/", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await getBranchSubscription(req.user!.sub, req.branchId!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

subscriptionRouter.get("/history", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await listBranchSubscriptionHistory({
      branchId: req.branchId!,
      tenantId: req.user!.sub,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

subscriptionRouter.post("/cancel", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await cancelBranchSubscription({
      tenantId: req.user!.sub,
      branchId: req.branchId!,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

subscriptionRouter.post(
  "/renew",
  (req, res, next) => {
    paymentUpload.single("screenshot")(req, res, (err) => {
      if (err) {
        if (err instanceof AppError) return next(err);
        if (
          err instanceof Error &&
          "code" in err &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          return next(new AppError(400, "Screenshot must be 2MB or less"));
        }
        return next(
          new AppError(400, err instanceof Error ? err.message : "Upload failed"),
        );
      }
      void optimizeRequestImage(req, "payment")
        .then(() => next())
        .catch(() =>
          next(new AppError(400, "Could not process payment screenshot")),
        );
    });
  },
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const parsed = renewSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      if (!req.file?.filename) {
        throw new AppError(400, "Payment screenshot is required");
      }

      const payment = await submitRenewalPayment({
        tenantId: req.user!.sub,
        branchId: req.branchId!,
        durationMonths: parsed.data.durationMonths,
        paymentMethod: parsed.data.paymentMethod,
        referenceNumber: parsed.data.referenceNumber,
        notes: parsed.data.notes,
        screenshotFilename: req.file.filename,
      });

      res.status(201).json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  },
);

export const tenantPaymentsRouter = Router();

tenantPaymentsRouter.use(requireAuth, requireTenant);

tenantPaymentsRouter.get("/", async (req: BranchAuthedRequest, res, next) => {
  try {
    const branchId = req.header("x-branch-id") || undefined;
    const data = await listTenantPayments(req.user!.sub, branchId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
