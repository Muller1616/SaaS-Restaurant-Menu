import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { logActivity } from "../../lib/activity-log.js";
import { signAccessToken } from "../../lib/jwt.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import { sendEmail } from "../../services/email.js";
import type {
  AdminLoginInput,
  ChangePasswordInput,
  TenantLoginInput,
} from "./auth.schemas.js";

function serializeBranch(branch: {
  id: string;
  name: string;
  location: string;
  phone: string | null;
  slug: string;
  qrCodeUrl: string | null;
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
    phone: branch.phone,
    slug: branch.slug,
    qrCodeUrl: branch.qrCodeUrl,
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

  const valid = await bcrypt.compare(input.password, tenant.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
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

  const passwordHash = await bcrypt.hash(input.newPassword, 10);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      passwordHash,
      mustChangePassword: false,
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

export async function requestTenantPasswordReset(email: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // Always return success to avoid email enumeration
  if (!tenant || tenant.status !== "ACTIVE" || !tenant.passwordHash) {
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
  await sendEmail({
    to: tenant.email,
    subject: "Reset your KitchenOS password",
    text: `Hi ${tenant.fullName},

Reset your KitchenOS password using this link (valid for 1 hour):
${resetUrl}

If you did not request this, you can ignore this email.

KitchenOS Team`,
  });

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
