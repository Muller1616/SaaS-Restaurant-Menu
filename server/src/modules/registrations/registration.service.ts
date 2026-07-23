import { prisma } from "../../lib/prisma.js";
import { logActivity } from "../../lib/activity-log.js";
import { uniqueTenantSlug } from "../../lib/slug.js";
import { AppError } from "../../middleware/error.js";
import { registrationReceivedEmail } from "../../services/email.js";
import { notifyTenant } from "../../services/notify.js";
import {
  cacheAside,
  CacheKeys,
  CacheTtl,
  invalidateAdminDashboardCache,
} from "../../lib/cache/index.js";
import type { RegistrationInput } from "./registration.schemas.js";

function serializePlan<T extends { priceMonthly: { toString(): string } }>(
  plan: T,
) {
  return {
    ...plan,
    priceMonthly: plan.priceMonthly.toString(),
  };
}

export async function listActivePlans() {
  return cacheAside(CacheKeys.plansActive(), CacheTtl.plans, async () => {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    });
    return plans.map(serializePlan);
  });
}

export async function createRegistration(
  input: RegistrationInput,
  paymentScreenshotPath?: string | null,
) {
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.tenant.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const plan = await prisma.plan.findUnique({
    where: { slug: input.planSlug },
  });
  if (!plan || !plan.isActive) {
    throw new AppError(400, "Selected plan is not available");
  }

  const isPaid = Number(plan.priceMonthly) > 0;
  if (isPaid && !paymentScreenshotPath) {
    throw new AppError(400, "Payment screenshot is required for paid plans");
  }
  if (isPaid && !input.referenceNumber?.trim()) {
    throw new AppError(400, "Payment reference number is required for paid plans");
  }
  if (isPaid && !input.paymentMethod) {
    throw new AppError(400, "Payment method is required for paid plans");
  }

  const slug = await uniqueTenantSlug(input.businessName);
  const screenshotUrl = paymentScreenshotPath
    ? `/uploads/payments/${paymentScreenshotPath}`
    : null;

  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        phone: input.phone.trim(),
        businessName: input.businessName.trim(),
        businessLocation: input.businessLocation.trim(),
        businessDescription: input.businessDescription?.trim() || null,
        slug,
        status: "PENDING_APPROVAL",
        selectedPlanId: plan.id,
        registrationPaymentUrl: screenshotUrl,
      },
      include: {
        selectedPlan: true,
      },
    });

    if (isPaid && screenshotUrl && input.paymentMethod && input.referenceNumber) {
      await tx.payment.create({
        data: {
          tenantId: created.id,
          amount: plan.priceMonthly,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber.trim(),
          screenshotUrl,
          durationMonths: 1,
          status: "PENDING",
        },
      });
    }

    return created;
  });

  const emailContent = registrationReceivedEmail({
    fullName: tenant.fullName,
    businessName: tenant.businessName,
    planName: tenant.selectedPlan.name,
  });

  await notifyTenant({
    tenantId: tenant.id,
    type: "SYSTEM",
    title: "Registration received",
    message: `Your ${tenant.selectedPlan.name} plan application is pending approval.`,
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
    action: "CREATE",
    entityType: "tenant",
    entityId: tenant.id,
    details: {
      businessName: tenant.businessName,
      plan: tenant.selectedPlan.slug,
      status: "PENDING_APPROVAL",
    },
  });

  await invalidateAdminDashboardCache();
  return {
    id: tenant.id,
    fullName: tenant.fullName,
    email: tenant.email,
    businessName: tenant.businessName,
    slug: tenant.slug,
    status: tenant.status,
    plan: {
      name: tenant.selectedPlan.name,
      slug: tenant.selectedPlan.slug,
      priceMonthly: tenant.selectedPlan.priceMonthly.toString(),
    },
    message:
      "Thanks — we received your application. We’ll email you once it’s been reviewed.",
  };
}

export async function listPendingRegistrations() {
  const tenants = await prisma.tenant.findMany({
    where: { status: "PENDING_APPROVAL" },
    include: {
      selectedPlan: true,
      payments: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tenants.map((tenant) => ({
    id: tenant.id,
    fullName: tenant.fullName,
    email: tenant.email,
    phone: tenant.phone,
    businessName: tenant.businessName,
    businessLocation: tenant.businessLocation,
    businessDescription: tenant.businessDescription,
    registrationPaymentUrl: tenant.registrationPaymentUrl,
    createdAt: tenant.createdAt,
    plan: serializePlan(tenant.selectedPlan),
    latestPayment: tenant.payments[0]
      ? {
          id: tenant.payments[0].id,
          amount: tenant.payments[0].amount.toString(),
          paymentMethod: tenant.payments[0].paymentMethod,
          referenceNumber: tenant.payments[0].referenceNumber,
          screenshotUrl: tenant.payments[0].screenshotUrl,
          status: tenant.payments[0].status,
          createdAt: tenant.payments[0].createdAt,
        }
      : null,
  }));
}

export async function getRegistrationById(id: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      selectedPlan: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!tenant) {
    throw new AppError(404, "Registration not found");
  }

  return {
    id: tenant.id,
    fullName: tenant.fullName,
    email: tenant.email,
    phone: tenant.phone,
    businessName: tenant.businessName,
    businessLocation: tenant.businessLocation,
    businessDescription: tenant.businessDescription,
    status: tenant.status,
    registrationPaymentUrl: tenant.registrationPaymentUrl,
    rejectedReason: tenant.rejectedReason,
    createdAt: tenant.createdAt,
    plan: serializePlan(tenant.selectedPlan),
    payments: tenant.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toString(),
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber,
      screenshotUrl: payment.screenshotUrl,
      status: payment.status,
      createdAt: payment.createdAt,
    })),
  };
}
