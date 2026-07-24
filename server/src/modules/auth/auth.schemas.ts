import { z } from "zod";
import { strongPasswordSchema } from "../../lib/password-policy.js";

export const adminLoginSchema = z.object({
  email: z.email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const tenantLoginSchema = z.object({
  email: z.email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export type TenantLoginInput = z.infer<typeof tenantLoginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: strongPasswordSchema(),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Valid email is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: strongPasswordSchema(),
});

export const adminVerifyOtpSchema = z.object({
  email: z.email("Valid email is required"),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

export const adminResetPasswordSchema = z
  .object({
    resetToken: z.string().min(1, "Reset session is required"),
    newPassword: strongPasswordSchema(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AdminVerifyOtpInput = z.infer<typeof adminVerifyOtpSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

export const previewActivationSchema = z.object({
  slug: z.string().min(1),
  token: z.string().min(1),
});

export type PreviewActivationInput = z.infer<typeof previewActivationSchema>;

export const activateTenantSchema = z
  .object({
    slug: z.string().min(1),
    token: z.string().min(1),
    temporaryPassword: z.string().min(1, "Temporary password is required"),
    newPassword: strongPasswordSchema(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((values) => values.temporaryPassword !== values.newPassword, {
    message: "New password must be different from the temporary password",
    path: ["newPassword"],
  });

export type ActivateTenantInput = z.infer<typeof activateTenantSchema>;

export const resendActivationEmailSchema = z.object({
  email: z.email("Valid email is required"),
});

export type ResendActivationEmailInput = z.infer<
  typeof resendActivationEmailSchema
>;
