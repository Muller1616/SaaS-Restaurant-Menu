import { Router } from "express";
import {
  requireAuth,
  requireTenant,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";
import { optimizeRequestImage } from "../../middleware/optimize-upload.js";
import { logoUpload } from "../../middleware/upload.js";
import {
  countUnreadNotifications,
  getTenantSettings,
  listTenantNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeTenantLogo,
  updateSettingsSchema,
  updateTenantLogo,
  updateTenantSettings,
} from "../admin/admin-ops.service.js";

export const tenantSettingsRouter = Router();

tenantSettingsRouter.use(requireAuth, requireTenant);

tenantSettingsRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = await getTenantSettings(req.user!.sub);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

tenantSettingsRouter.patch("/", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    const data = await updateTenantSettings(req.user!.sub, parsed.data);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

tenantSettingsRouter.post(
  "/logo",
  (req, res, next) => {
    logoUpload.single("logo")(req, res, (err) => {
      if (err) {
        if (err instanceof AppError) return next(err);
        if (
          err instanceof Error &&
          "code" in err &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          return next(new AppError(400, "Logo must be 2MB or less"));
        }
        return next(
          new AppError(400, err instanceof Error ? err.message : "Upload failed"),
        );
      }
      void optimizeRequestImage(req, "logo")
        .then(() => next())
        .catch(() => next(new AppError(400, "Could not process logo image")));
    });
  },
  async (req: AuthedRequest, res, next) => {
    try {
      if (!req.file?.filename) {
        throw new AppError(400, "Choose a logo image from your device");
      }
      const data = await updateTenantLogo(req.user!.sub, req.file.filename);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

tenantSettingsRouter.delete("/logo", async (req: AuthedRequest, res, next) => {
  try {
    const data = await removeTenantLogo(req.user!.sub);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

tenantSettingsRouter.get("/notifications", async (req: AuthedRequest, res, next) => {
  try {
    const data = await listTenantNotifications(req.user!.sub);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

tenantSettingsRouter.get(
  "/notifications/unread-count",
  async (req: AuthedRequest, res, next) => {
    try {
      const data = await countUnreadNotifications(req.user!.sub);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

tenantSettingsRouter.post(
  "/notifications/read-all",
  async (req: AuthedRequest, res, next) => {
    try {
      const data = await markAllNotificationsRead(req.user!.sub);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

tenantSettingsRouter.post(
  "/notifications/:id/read",
  async (req: AuthedRequest, res, next) => {
    try {
      const data = await markNotificationRead(
        req.user!.sub,
        String(req.params.id),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
