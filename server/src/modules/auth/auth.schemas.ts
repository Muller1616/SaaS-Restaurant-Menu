import { z } from "zod";

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
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Valid email is required"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters"),
});
