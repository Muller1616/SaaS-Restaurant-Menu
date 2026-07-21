import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  requireAdmin,
  requireAuth,
  requireTenant,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { csrfTokenHandler } from "../../middleware/csrf.js";
import { AppError } from "../../middleware/error.js";
import {
  adminLoginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  tenantLoginSchema,
} from "./auth.schemas.js";
import {
  changeTenantPassword,
  getAdminProfile,
  getTenantProfile,
  loginAdmin,
  loginTenant,
  logoutAdmin,
  logoutTenant,
  requestTenantPasswordReset,
  resetTenantPassword,
} from "./auth.service.js";

export const authRouter = Router();

authRouter.get("/csrf", csrfTokenHandler);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Try again in 15 minutes.",
  },
});

authRouter.post("/admin/login", loginLimiter, async (req, res, next) => {
  try {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }

    const result = await loginAdmin(parsed.data);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.get(
  "/admin/me",
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res, next) => {
    try {
      const admin = await getAdminProfile(req.user!.sub);
      res.json({ success: true, data: admin });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/admin/logout",
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res, next) => {
    try {
      await logoutAdmin(req.user!.sub);
      res.json({ success: true, data: { loggedOut: true } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post("/tenant/login", loginLimiter, async (req, res, next) => {
  try {
    const parsed = tenantLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }

    const result = await loginTenant(parsed.data);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.get(
  "/tenant/me",
  requireAuth,
  requireTenant,
  async (req: AuthedRequest, res, next) => {
    try {
      const tenant = await getTenantProfile(req.user!.sub);
      res.json({ success: true, data: tenant });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/tenant/logout",
  requireAuth,
  requireTenant,
  async (req: AuthedRequest, res, next) => {
    try {
      await logoutTenant(req.user!.sub);
      res.json({ success: true, data: { loggedOut: true } });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/tenant/change-password",
  requireAuth,
  requireTenant,
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const result = await changeTenantPassword(req.user!.sub, parsed.data);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post("/tenant/forgot-password", loginLimiter, async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    const result = await requestTenantPasswordReset(parsed.data.email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/tenant/reset-password", loginLimiter, async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    const result = await resetTenantPassword(
      parsed.data.token,
      parsed.data.newPassword,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
