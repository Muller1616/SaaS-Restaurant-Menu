import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "../../middleware/error.js";
import { optimizeRequestImage } from "../../middleware/optimize-upload.js";
import { paymentUpload } from "../../middleware/upload.js";
import { recordPublicMenuView } from "../analytics/analytics.service.js";
import { registrationSchema } from "../registrations/registration.schemas.js";
import {
  createRegistration,
  listActivePlans,
} from "../registrations/registration.service.js";
import { getPublicMenu } from "../menus/menu.service.js";

export const publicRouter = Router();

const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many view events. Try again shortly.",
  },
});

publicRouter.get("/plans", async (_req, res, next) => {
  try {
    const plans = await listActivePlans();
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/public/menu/:tenantSlug", async (req, res, next) => {
  try {
    const data = await getPublicMenu(String(req.params.tenantSlug));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

publicRouter.get(
  "/public/menu/:tenantSlug/:branchSlug",
  async (req, res, next) => {
    try {
      const data = await getPublicMenu(
        String(req.params.tenantSlug),
        String(req.params.branchSlug),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

publicRouter.post(
  "/public/menu/:tenantSlug/views",
  viewLimiter,
  async (req, res, next) => {
    try {
      const data = await recordPublicMenuView({
        tenantSlug: String(req.params.tenantSlug),
        userAgent: req.get("user-agent"),
        referer: req.get("referer"),
      });
      res.status(202).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

publicRouter.post(
  "/public/menu/:tenantSlug/:branchSlug/views",
  viewLimiter,
  async (req, res, next) => {
    try {
      const data = await recordPublicMenuView({
        tenantSlug: String(req.params.tenantSlug),
        branchSlug: String(req.params.branchSlug),
        userAgent: req.get("user-agent"),
        referer: req.get("referer"),
      });
      res.status(202).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

publicRouter.post(
  "/registrations",
  (req, res, next) => {
    paymentUpload.single("paymentScreenshot")(req, res, (err) => {
      if (err) {
        if (err instanceof AppError) return next(err);
        if (
          err instanceof Error &&
          "code" in err &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          return next(
            new AppError(400, "Payment screenshot must be 2MB or less"),
          );
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
  async (req, res, next) => {
    try {
      const parsed = registrationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }

      const result = await createRegistration(
        parsed.data,
        req.file?.filename ?? null,
      );

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
