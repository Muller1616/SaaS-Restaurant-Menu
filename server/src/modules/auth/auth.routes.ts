import { Router } from "express";
import {
  requireAdmin,
  requireAuth,
  requireTenant,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { csrfTokenHandler } from "../../middleware/csrf.js";
import { AppError } from "../../middleware/error.js";
import { createAuthLimiter } from "../../lib/rate-limit.js";
import {
  adminLoginSchema,
  activateTenantSchema,
  adminResetPasswordSchema,
  adminVerifyOtpSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  previewActivationSchema,
  resendActivationEmailSchema,
  resetPasswordSchema,
  tenantLoginSchema,
} from "./auth.schemas.js";
import {
  activateTenantAccount,
  changeTenantPassword,
  getAdminProfile,
  getTenantProfile,
  loginAdmin,
  loginTenant,
  logoutAdmin,
  logoutTenant,
  previewTenantActivation,
  requestAdminPasswordOtp,
  requestTenantActivationEmail,
  requestTenantPasswordReset,
  resetAdminPasswordWithToken,
  resetTenantPassword,
  verifyAdminPasswordOtp,
} from "./auth.service.js";

export const authRouter = Router();

authRouter.get("/csrf", csrfTokenHandler);
// Allow POST as well so mistaken clients still bootstrap a token.
authRouter.post("/csrf", csrfTokenHandler);

const adminLoginLimiter = createAuthLimiter(
  "Too many admin login attempts. Try again in 15 minutes.",
  20,
);
const tenantLoginLimiter = createAuthLimiter(
  "Too many login attempts. Try again in 15 minutes.",
  20,
);
const passwordResetLimiter = createAuthLimiter(
  "Too many password reset attempts. Try again in 15 minutes.",
  10,
);

authRouter.post("/admin/login", adminLoginLimiter, async (req, res, next) => {
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

const adminOtpLimiter = createAuthLimiter(
  "Too many password reset attempts. Try again in 15 minutes.",
  8,
);
const adminOtpVerifyLimiter = createAuthLimiter(
  "Too many verification attempts. Try again in 15 minutes.",
  20,
);

authRouter.post(
  "/admin/forgot-password",
  adminOtpLimiter,
  async (req, res, next) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const data = await requestAdminPasswordOtp(parsed.data.email);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/admin/verify-otp",
  adminOtpVerifyLimiter,
  async (req, res, next) => {
    try {
      const parsed = adminVerifyOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const data = await verifyAdminPasswordOtp(parsed.data);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/admin/reset-password",
  adminOtpLimiter,
  async (req, res, next) => {
    try {
      const parsed = adminResetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const data = await resetAdminPasswordWithToken(parsed.data);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post("/tenant/login", tenantLoginLimiter, async (req, res, next) => {
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

authRouter.post("/tenant/forgot-password", passwordResetLimiter, async (req, res, next) => {
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

authRouter.post("/tenant/reset-password", passwordResetLimiter, async (req, res, next) => {
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

const activationLimiter = createAuthLimiter(
  "Too many activation attempts. Try again in 15 minutes.",
  20,
);

/**
 * Preview activation — token in body only (never query string / access logs).
 * Legacy GET with ?token= is rejected so secrets are not logged by proxies.
 */
authRouter.post(
  "/tenant/activate/preview",
  activationLimiter,
  async (req, res, next) => {
    try {
      const parsed = previewActivationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Invalid activation link", parsed.error.flatten());
      }
      const result = await previewTenantActivation(
        parsed.data.slug,
        parsed.data.token,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.get("/tenant/activate", activationLimiter, (_req, res) => {
  res.status(405).json({
    success: false,
    message:
      "Use POST /auth/tenant/activate/preview with slug and token in the JSON body.",
  });
});

authRouter.post("/tenant/activate", activationLimiter, async (req, res, next) => {
  try {
    const parsed = activateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    const result = await activateTenantAccount(parsed.data);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/tenant/resend-activation",
  passwordResetLimiter,
  async (req, res, next) => {
    try {
      const parsed = resendActivationEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const result = await requestTenantActivationEmail(parsed.data.email);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);