import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { env } from "../../config/env.js";
import { logActivity } from "../../lib/activity-log.js";
import { signAccessToken } from "../../lib/jwt.js";
import { toPublicMediaUrl } from "../../lib/media-url.js";
import { generateSecurePassword } from "../../lib/password.js";
import { passwordPolicyErrorMessage } from "../../lib/password-policy.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { accountApprovedEmail, adminPasswordOtpEmail, sendEmail } from "../../services/email.js";
import { notifyTenant } from "../../services/notify.js";
import { TRIAL_DAYS } from "../subscriptions/subscription.logic.js";
import type {
  ActivateTenantInput,
  AdminLoginInput,
  AdminResetPasswordInput,
  AdminVerifyOtpInput,
  ChangePasswordInput,
  TenantLoginInput,
} from "./auth.schemas.js";

function requireStrongPassword(password: string) {
  const message = passwordPolicyErrorMessage(password);
  if (message) {
    throw new AppError(400, message);
  }
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

const ADMIN_OTP_TTL_MS = 3 * 60 * 1000;
const ADMIN_OTP_TTL_MINUTES = 3;
const ADMIN_RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const ADMIN_OTP_MAX_ATTEMPTS = 5;

function generateAdminOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

const GENERIC_ADMIN_OTP_MESSAGE =
  "If that email is registered, a one-time code has been sent.";

/**
 * Enumeration-safe: always advances the client to OTP entry with a 3-minute window.
 * OTP is only emailed when an admin account exists.
 */
export async function requestAdminPasswordOtp(email: string) {
  const normalized = email.toLowerCase().trim();
  const admin = await prisma.adminUser.findUnique({
    where: { email: normalized },
  });

  const expiresInSeconds = Math.floor(ADMIN_OTP_TTL_MS / 1000);

  if (!admin) {
    return {
      message: GENERIC_ADMIN_OTP_MESSAGE,
      expiresInSeconds,
    };
  }

  const rawOtp = generateAdminOtp();
  const otpHash = hashToken(rawOtp);
  const expiresAt = new Date(Date.now() + ADMIN_OTP_TTL_MS);

  await prisma.$transaction([
    prisma.adminPasswordOtp.updateMany({
      where: {
        adminId: admin.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    }),
    prisma.adminPasswordOtp.create({
      data: {
        adminId: admin.id,
        otpHash,
        expiresAt,
      },
    }),
  ]);

  const content = adminPasswordOtpEmail({
    fullName: admin.name,
    otp: rawOtp,
    expiresInMinutes: ADMIN_OTP_TTL_MINUTES,
  });

  const mailed = await sendEmail({
    to: admin.email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  await logActivity({
    userType: "ADMIN",
    userId: admin.id,
    action: "UPDATE",
    entityType: "admin_password_otp",
    entityId: admin.id,
    summary: mailed.ok
      ? "Admin password reset OTP emailed"
      : "Admin password reset OTP created but email failed",
    details: {
      emailDelivered: mailed.ok,
      expiresAt: expiresAt.toISOString(),
    },
  });

  if (!mailed.ok) {
    throw new AppError(
      502,
      "We could not send the reset code. Please try again shortly or contact support.",
    );
  }

  return {
    message: GENERIC_ADMIN_OTP_MESSAGE,
    expiresInSeconds,
  };
}

export async function verifyAdminPasswordOtp(input: AdminVerifyOtpInput) {
  const email = input.email.toLowerCase().trim();
  const otp = input.otp.trim();
  const admin = await prisma.adminUser.findUnique({ where: { email } });

  if (!admin) {
    throw new AppError(400, "Invalid or expired code. Request a new one.");
  }

  const record = await prisma.adminPasswordOtp.findFirst({
    where: {
      adminId: admin.id,
      usedAt: null,
      verifiedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, "Invalid or expired code. Request a new one.");
  }

  if (record.attemptCount >= ADMIN_OTP_MAX_ATTEMPTS) {
    await prisma.adminPasswordOtp.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    throw new AppError(
      429,
      "Too many incorrect attempts. Please request a new code.",
    );
  }

  const otpHash = hashToken(otp);
  if (otpHash !== record.otpHash) {
    await prisma.adminPasswordOtp.update({
      where: { id: record.id },
      data: { attemptCount: { increment: 1 } },
    });
    throw new AppError(400, "Invalid or expired code. Request a new one.");
  }

  const rawResetToken = randomBytes(32).toString("hex");
  const resetTokenHash = hashToken(rawResetToken);
  const resetExpiresAt = new Date(Date.now() + ADMIN_RESET_TOKEN_TTL_MS);

  await prisma.adminPasswordOtp.update({
    where: { id: record.id },
    data: {
      verifiedAt: new Date(),
      resetTokenHash,
      resetExpiresAt,
    },
  });

  await logActivity({
    userType: "ADMIN",
    userId: admin.id,
    action: "UPDATE",
    entityType: "admin_password_otp",
    entityId: record.id,
    summary: "Admin password reset OTP verified",
  });

  return {
    resetToken: rawResetToken,
    expiresInSeconds: Math.floor(ADMIN_RESET_TOKEN_TTL_MS / 1000),
    message: "Code verified. Choose a new password.",
  };
}

export async function resetAdminPasswordWithToken(input: AdminResetPasswordInput) {
  const resetTokenHash = hashToken(input.resetToken);
  const record = await prisma.adminPasswordOtp.findFirst({
    where: {
      resetTokenHash,
      usedAt: null,
      verifiedAt: { not: null },
      resetExpiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    throw new AppError(
      400,
      "This reset session is invalid or has expired. Please start again.",
    );
  }

  requireStrongPassword(input.newPassword);
  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: record.adminId },
      data: { passwordHash },
    }),
    prisma.adminPasswordOtp.update({
      where: { id: record.id },
      data: {
        usedAt: new Date(),
        resetTokenHash: null,
        resetExpiresAt: null,
      },
    }),
    prisma.adminPasswordOtp.updateMany({
      where: {
        adminId: record.adminId,
        usedAt: null,
        id: { not: record.id },
      },
      data: { usedAt: new Date() },
    }),
  ]);

  await logActivity({
    userType: "ADMIN",
    userId: record.adminId,
    action: "UPDATE",
    entityType: "admin_user",
    entityId: record.adminId,
    summary: "Admin password reset via OTP",
  });

  return {
    message: "Password updated. You can sign in with your new password.",
  };
}

function serializeBranch(branch: {
  id: string;
  name: string;
  location: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  phone: string | null;
  managerName?: string | null;
  slug: string;
  qrCodeUrl: string | null;
  isActive?: boolean;
  isDefault: boolean;
  subscription: {
    id: string;
    status: string;
    startDate: Date;
    expiryDate: Date | null;
    plan: {
      id: string;
      name: string;
      slug: string;
      priceMonthly: { toString(): string };
      maxBranches: number;
      maxItems: number | null;
    };
  } | null;
}) {
  return {
    id: branch.id,
    name: branch.name,
    location: branch.location,
    city: branch.city ?? null,
    region: branch.region ?? null,
    country: branch.country ?? null,
    phone: branch.phone,
    managerName: branch.managerName ?? null,
    slug: branch.slug,
    qrCodeUrl: toPublicMediaUrl(branch.qrCodeUrl),
    isActive: branch.isActive ?? true,
    isDefault: branch.isDefault,
    subscription: branch.subscription
      ? {
          id: branch.subscription.id,
          status: branch.subscription.status,
          startDate: branch.subscription.startDate,
          expiryDate: branch.subscription.expiryDate,
          plan: {
            id: branch.subscription.plan.id,
            name: branch.subscription.plan.name,
            slug: branch.subscription.plan.slug,
            priceMonthly: branch.subscription.plan.priceMonthly.toString(),
            maxBranches: branch.subscription.plan.maxBranches,
            maxItems: branch.subscription.plan.maxItems,
          },
        }
      : null,
  };
}

async function getTenantWithBranches(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      selectedPlan: true,
      branches: {
        where: { deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: {
          subscription: {
            include: { plan: true },
          },
        },
      },
    },
  });
}

function toTenantSession(tenant: NonNullable<Awaited<ReturnType<typeof getTenantWithBranches>>>) {
  const branches = tenant.branches.map(serializeBranch);
  const defaultBranch =
    branches.find((branch) => branch.isDefault) ?? branches[0] ?? null;

  return {
    id: tenant.id,
    fullName: tenant.fullName,
    email: tenant.email,
    phone: tenant.phone,
    businessName: tenant.businessName,
    businessLocation: tenant.businessLocation,
    slug: tenant.slug,
    status: tenant.status,
    mustChangePassword: tenant.mustChangePassword,
    emailNotificationsEnabled: tenant.emailNotificationsEnabled,
    selectedPlan: {
      id: tenant.selectedPlan.id,
      name: tenant.selectedPlan.name,
      slug: tenant.selectedPlan.slug,
      priceMonthly: tenant.selectedPlan.priceMonthly.toString(),
      maxBranches: tenant.selectedPlan.maxBranches,
      maxItems: tenant.selectedPlan.maxItems,
      features: (tenant.selectedPlan.features ?? {}) as {
        customQr?: boolean;
        analytics?: string;
        support?: string;
      },
    },
    branches,
    defaultBranchId: defaultBranch?.id ?? null,
  };
}

export async function loginAdmin(input: AdminLoginInput) {
  const admin = await prisma.adminUser.findUnique({
    where: { email: input.email.toLowerCase().trim() },
  });

  if (!admin) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await bcrypt.compare(input.password, admin.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = signAccessToken(
    {
      sub: admin.id,
      role: "ADMIN",
      adminRole: admin.role,
      email: admin.email,
      name: admin.name,
    },
    input.rememberMe,
  );

  await logActivity({
    userType: "ADMIN",
    userId: admin.id,
    action: "LOGIN",
    entityType: "admin_user",
    entityId: admin.id,
  });

  return {
    token,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  };
}

export async function getAdminProfile(adminId: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  if (!admin) {
    throw new AppError(404, "Admin not found");
  }

  return admin;
}

export async function logoutAdmin(adminId: string) {
  await logActivity({
    userType: "ADMIN",
    userId: adminId,
    action: "LOGOUT",
    entityType: "admin_user",
    entityId: adminId,
  });
  return { loggedOut: true };
}

export async function logoutTenant(tenantId: string) {
  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "LOGOUT",
    entityType: "tenant",
    entityId: tenantId,
  });
  return { loggedOut: true };
}

export async function loginTenant(input: TenantLoginInput) {
  const tenant = await prisma.tenant.findUnique({
    where: { email: input.email.toLowerCase().trim() },
    include: {
      selectedPlan: true,
      branches: {
        where: { deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: {
          subscription: { include: { plan: true } },
        },
      },
    },
  });

  if (!tenant || !tenant.passwordHash) {
    throw new AppError(401, "Invalid email or password");
  }

  // Always verify credentials before disclosing account status (enumeration hardening).
  const valid = await bcrypt.compare(input.password, tenant.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  if (tenant.status === "PENDING_APPROVAL") {
    throw new AppError(403, "Your application is still under review. We’ll email you once it’s approved.");
  }
  if (tenant.status === "REJECTED") {
    throw new AppError(
      403,
      tenant.rejectedReason
        ? `Registration rejected: ${tenant.rejectedReason}`
        : "Your registration was rejected",
    );
  }
  if (tenant.status === "SUSPENDED") {
    throw new AppError(
      403,
      tenant.suspendedReason
        ? `Account suspended: ${tenant.suspendedReason}`
        : "Your account has been suspended",
      { code: "SUSPENDED", reason: tenant.suspendedReason },
    );
  }
  if (tenant.status !== "ACTIVE") {
    throw new AppError(403, "This account isn’t available for sign-in right now.");
  }

  if (!tenant.activatedAt) {
    throw new AppError(
      403,
      "Activate your account using the link we emailed you before signing in.",
      { code: "MUST_ACTIVATE" },
    );
  }

  const token = signAccessToken(
    {
      sub: tenant.id,
      role: "TENANT",
      email: tenant.email,
      name: tenant.fullName,
    },
    input.rememberMe,
  );

  await logActivity({
    userType: "TENANT",
    userId: tenant.id,
    action: "LOGIN",
    entityType: "tenant",
    entityId: tenant.id,
  });

  const session = toTenantSession(tenant);

  return {
    token,
    tenant: session,
  };
}

export async function getTenantProfile(tenantId: string) {
  const tenant = await getTenantWithBranches(tenantId);
  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }
  if (tenant.status === "SUSPENDED") {
    throw new AppError(
      403,
      tenant.suspendedReason
        ? `Account suspended: ${tenant.suspendedReason}`
        : "Your account has been suspended",
      { code: "SUSPENDED", reason: tenant.suspendedReason },
    );
  }
  return toTenantSession(tenant);
}

export async function changeTenantPassword(
  tenantId: string,
  input: ChangePasswordInput,
) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.passwordHash) {
    throw new AppError(404, "Tenant not found");
  }

  const valid = await bcrypt.compare(input.currentPassword, tenant.passwordHash);
  if (!valid) {
    throw new AppError(400, "Current password is incorrect");
  }

  requireStrongPassword(input.newPassword);
  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      passwordHash,
      mustChangePassword: false,
      activatedAt: tenant.activatedAt ?? new Date(),
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "tenant",
    entityId: tenantId,
    details: { field: "password" },
  });

  return { success: true };
}

export async function previewTenantActivation(slug: string, token: string) {
  const record = await findValidActivation(slug, token);
  if (!record) {
    return {
      valid: false as const,
      reason: "invalid" as const,
      message:
        "This activation link is invalid, already used, or has expired. Request a new activation email to continue.",
    };
  }

  return {
    valid: true as const,
    businessName: record.tenant.businessName,
    email: record.tenant.email,
    expiresAt: record.expiresAt.toISOString(),
  };
}

async function findValidActivation(slug: string, token: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.activationToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
      tenant: {
        slug,
        status: "ACTIVE",
        activatedAt: null,
      },
    },
    include: {
      tenant: {
        select: {
          id: true,
          email: true,
          fullName: true,
          businessName: true,
          slug: true,
          passwordHash: true,
          status: true,
          activatedAt: true,
          selectedPlan: { select: { name: true } },
          branches: {
            where: { deletedAt: null, isDefault: true },
            take: 1,
            select: { name: true },
          },
        },
      },
    },
  });
  return record;
}

export async function activateTenantAccount(input: ActivateTenantInput) {
  const record = await findValidActivation(input.slug, input.token);
  if (!record || !record.tenant.passwordHash) {
    throw new AppError(
      400,
      "This activation link is invalid, already used, or has expired. Request a new activation email to continue.",
      { code: "ACTIVATION_INVALID" },
    );
  }

  const tempOk = await bcrypt.compare(
    input.temporaryPassword,
    record.tenant.passwordHash,
  );
  if (!tempOk) {
    throw new AppError(400, "Temporary password is incorrect");
  }

  if (input.temporaryPassword === input.newPassword) {
    throw new AppError(
      400,
      "Choose a new password that is different from the temporary password",
    );
  }

  requireStrongPassword(input.newPassword);
  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  const activatedAt = new Date();

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: record.tenant.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        activatedAt,
      },
    }),
    prisma.activationToken.update({
      where: { id: record.id },
      data: { usedAt: activatedAt },
    }),
    prisma.activationToken.updateMany({
      where: {
        tenantId: record.tenant.id,
        usedAt: null,
        id: { not: record.id },
      },
      data: { usedAt: activatedAt },
    }),
  ]);

  await logActivity({
    userType: "TENANT",
    userId: record.tenant.id,
    action: "ACTIVATE",
    entityType: "tenant",
    entityId: record.tenant.id,
    details: {
      field: "activation",
      activatedAt: activatedAt.toISOString(),
    },
  });

  return {
    message: "Account activated. You can sign in with your new password.",
    loginUrl: `${env.clientUrl}/tenant/login`,
  };
}

/**
 * Public recovery: rotate temp password + send a fresh activation link.
 * Always returns a generic message to avoid email enumeration.
 */
export async function requestTenantActivationEmail(email: string) {
  const generic = {
    message:
      "If that email needs activation, we sent a new link with temporary credentials.",
  };

  const tenant = await prisma.tenant.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      selectedPlan: true,
      branches: {
        where: { deletedAt: null, isDefault: true },
        take: 1,
      },
    },
  });

  if (
    !tenant ||
    tenant.status !== "ACTIVE" ||
    tenant.activatedAt ||
    !tenant.passwordHash
  ) {
    return generic;
  }

  const plainPassword = generateSecurePassword(12);
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.activationTokenHours * 60 * 60 * 1000,
  );

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        activatedAt: null,
      },
    }),
    prisma.activationToken.updateMany({
      where: { tenantId: tenant.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.activationToken.create({
      data: {
        tenantId: tenant.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const activationUrl = `${env.clientUrl}/r/${encodeURIComponent(tenant.slug)}/activate/${encodeURIComponent(rawToken)}`;
  const loginUrl = `${env.clientUrl}/tenant/login`;
  const branchName = tenant.branches[0]?.name ?? tenant.businessName;
  const emailContent = accountApprovedEmail({
    fullName: tenant.fullName,
    businessName: tenant.businessName,
    email: tenant.email,
    password: plainPassword,
    planName: tenant.selectedPlan.name,
    branchName,
    loginUrl,
    activationUrl,
    activationHours: env.activationTokenHours,
    trialDays: TRIAL_DAYS,
  });

  await notifyTenant({
    tenantId: tenant.id,
    type: "SYSTEM",
    title: "New activation link",
    message:
      "A new account activation link was issued. Open the email to set your password.",
    forceEmail: true,
    email: {
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenant.id,
    action: "UPDATE",
    entityType: "tenant",
    entityId: tenant.id,
    details: { field: "activation_resend_public" },
  });

  return generic;
}

export async function requestTenantPasswordReset(email: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // Always return success to avoid email enumeration
  if (
    !tenant ||
    tenant.status !== "ACTIVE" ||
    !tenant.passwordHash ||
    !tenant.activatedAt
  ) {
    return { message: "If that email exists, a reset link has been sent." };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      tenantId: tenant.id,
      tokenHash,
      expiresAt,
    },
  });

  const resetUrl = `${env.clientUrl}/tenant/reset-password?token=${rawToken}`;
  const mailed = await sendEmail({
    to: tenant.email,
    subject: "Reset your KitchenOS password",
    text: `Hi ${tenant.fullName},

Reset your KitchenOS password using this link (valid for 1 hour):
${resetUrl}

If you did not request this, you can ignore this email.

KitchenOS Team`,
  });

  if (!mailed.ok) {
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    throw new AppError(
      502,
      "We could not send the reset email. Please try again shortly or contact support.",
    );
  }

  return {
    message: "If that email exists, a reset link has been sent.",
  };
}

export async function resetTenantPassword(token: string, newPassword: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!record) {
    throw new AppError(400, "This password reset link is invalid or has expired. Please request a new one.");
  }

  requireStrongPassword(newPassword);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: record.tenantId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { message: "Password updated. You can sign in now." };
}
