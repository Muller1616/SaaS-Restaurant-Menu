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
import { getPublicMenuByQrId } from "../menus/menu.service.js";

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

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again later.",
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

/** Canonical customer menu — opaque QR public id only. */
publicRouter.get("/public/qr/:publicQrId", async (req, res, next) => {
  try {
    const data = await getPublicMenuByQrId(String(req.params.publicQrId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

publicRouter.post(
  "/public/qr/:publicQrId/views",
  viewLimiter,
  async (req, res, next) => {
    try {
      const data = await recordPublicMenuView({
        publicQrId: String(req.params.publicQrId),
        userAgent: req.get("user-agent"),
        referer: req.get("referer"),
      });
      res.status(202).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Legacy slug-based public menu routes — retired.
 * Customer menus resolve only via opaque QR tokens: GET /public/qr/:publicQrId
 * and frontend path /r/{32-hex-token}.
 */
function legacySlugMenuGone(_req: unknown, _res: unknown, next: (err?: unknown) => void) {
  next(
    new AppError(
      410,
      "Slug-based public menus are no longer available. Scan the restaurant QR code or open /r/{publicQrId}.",
    ),
  );
}

publicRouter.get("/public/menu/:tenantSlug", legacySlugMenuGone);
publicRouter.get("/public/menu/:tenantSlug/:branchSlug", legacySlugMenuGone);
publicRouter.post(
  "/public/menu/:tenantSlug/views",
  viewLimiter,
  legacySlugMenuGone,
);
publicRouter.post(
  "/public/menu/:tenantSlug/:branchSlug/views",
  viewLimiter,
  legacySlugMenuGone,
);

publicRouter.post(
  "/registrations",
  registrationLimiter,
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
        return next(new AppError(400, "Upload failed"));
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
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
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
