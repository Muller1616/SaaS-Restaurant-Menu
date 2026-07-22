import type { ActivityAction, ActivityUserType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const SENSITIVE_KEY =
  /^(password|passwordhash|temporarypassword|newpassword|currentpassword|token|tokencsrf|csrftoken|secret|authorization|apikey|rawtoken|plainpassword)$/i;

const ACTION_PHRASE: Record<ActivityAction, string> = {
  LOGIN: "signed in",
  LOGOUT: "signed out",
  CREATE: "created",
  UPDATE: "updated",
  DELETE: "deleted",
  APPROVE: "approved",
  REJECT: "rejected",
  SUSPEND: "suspended",
  ACTIVATE: "reactivated",
  EXTEND: "extended",
  CANCEL: "cancelled",
};

const ENTITY_PHRASE: Record<string, string> = {
  admin_user: "admin account",
  tenant: "restaurant",
  tenant_logo: "restaurant logo",
  tenant_settings: "restaurant settings",
  branch: "branch",
  branch_qr: "branch QR code",
  branch_qr_style: "custom QR style",
  category: "menu category",
  menu_item: "menu item",
  payment: "payment",
  subscription: "subscription",
  subscription_retention: "subscription retention purge",
  plan: "plan",
  announcement: "announcement",
};

function entityPhrase(entityType: string) {
  return ENTITY_PHRASE[entityType] ?? entityType.replaceAll("_", " ");
}

/** Remove secrets from JSON payloads before persisting audit details. */
export function sanitizeActivityDetails(
  details?: Prisma.InputJsonValue | null,
): Prisma.InputJsonValue | undefined {
  if (details == null) return undefined;
  return scrubValue(details) as Prisma.InputJsonValue;
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key.replaceAll("_", ""))) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = scrubValue(nested);
    }
    return out;
  }
  return value;
}

async function resolveActorLabel(
  userType: ActivityUserType,
  userId: string,
): Promise<string> {
  if (userType === "ADMIN") {
    const admin = await prisma.adminUser.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (admin) return `${admin.name} <${admin.email}>`;
  }
  if (userType === "TENANT") {
    const tenant = await prisma.tenant.findUnique({
      where: { id: userId },
      select: { fullName: true, businessName: true, email: true },
    });
    if (tenant) {
      return `${tenant.fullName} · ${tenant.businessName} <${tenant.email}>`;
    }
  }
  return userType === "ADMIN" ? "Admin" : "Restaurant";
}

async function resolveEntityLabel(
  entityType: string,
  entityId?: string | null,
  details?: Prisma.InputJsonValue | null,
): Promise<string | null> {
  const detailObj =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : null;

  const fromDetails = (...keys: string[]) => {
    for (const key of keys) {
      const value = detailObj?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  if (!entityId) {
    return (
      fromDetails("title", "name", "businessName", "referenceNumber") ?? null
    );
  }

  switch (entityType) {
    case "admin_user": {
      const admin = await prisma.adminUser.findUnique({
        where: { id: entityId },
        select: { name: true, email: true },
      });
      return admin ? `${admin.name} <${admin.email}>` : entityId;
    }
    case "tenant":
    case "tenant_logo":
    case "tenant_settings": {
      const tenant = await prisma.tenant.findUnique({
        where: { id: entityId },
        select: { businessName: true, email: true },
      });
      return tenant ? `${tenant.businessName} <${tenant.email}>` : entityId;
    }
    case "branch":
    case "branch_qr":
    case "branch_qr_style": {
      const branch = await prisma.branch.findUnique({
        where: { id: entityId },
        select: { name: true, tenant: { select: { businessName: true } } },
      });
      return branch
        ? `${branch.name} · ${branch.tenant.businessName}`
        : fromDetails("name") ?? entityId;
    }
    case "category": {
      const category = await prisma.category.findUnique({
        where: { id: entityId },
        select: { name: true },
      });
      return category?.name ?? fromDetails("name") ?? entityId;
    }
    case "menu_item": {
      const item = await prisma.menuItem.findUnique({
        where: { id: entityId },
        select: { name: true },
      });
      return item?.name ?? fromDetails("name") ?? entityId;
    }
    case "payment": {
      const payment = await prisma.payment.findUnique({
        where: { id: entityId },
        select: {
          referenceNumber: true,
          amount: true,
          tenant: { select: { businessName: true } },
        },
      });
      if (!payment) return fromDetails("referenceNumber") ?? entityId;
      return `${payment.tenant.businessName} · ref ${payment.referenceNumber} · ${payment.amount.toString()} ETB`;
    }
    case "subscription":
    case "subscription_retention": {
      const sub = await prisma.subscription.findUnique({
        where: { id: entityId },
        select: {
          status: true,
          plan: { select: { name: true } },
          branch: {
            select: {
              name: true,
              tenant: { select: { businessName: true } },
            },
          },
        },
      });
      if (!sub) return entityId;
      return `${sub.branch.tenant.businessName} · ${sub.branch.name} · ${sub.plan.name} (${sub.status})`;
    }
    case "plan": {
      const plan = await prisma.plan.findUnique({
        where: { id: entityId },
        select: { name: true, slug: true },
      });
      return plan ? `${plan.name} (${plan.slug})` : entityId;
    }
    case "announcement":
      return fromDetails("title");
    default:
      return fromDetails("name", "title", "businessName") ?? null;
  }
}

function buildSummary(input: {
  actorLabel: string;
  action: ActivityAction;
  entityType: string;
  entityLabel: string | null;
}) {
  const verb = ACTION_PHRASE[input.action] ?? input.action.toLowerCase();
  const entity = entityPhrase(input.entityType);
  if (input.action === "LOGIN" || input.action === "LOGOUT") {
    return `${input.actorLabel} ${verb}`;
  }
  if (input.entityLabel) {
    return `${input.actorLabel} ${verb} ${entity}: ${input.entityLabel}`;
  }
  return `${input.actorLabel} ${verb} ${entity}`;
}

/**
 * Persist an audit row with human-readable labels for Studio / admin UI.
 * Primary keys stay as CUIDs for relations; labels make rows inspectable.
 * Secrets in `details` are redacted.
 */
export async function logActivity(input: {
  userType: ActivityUserType;
  userId: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
  /** Optional override when the caller already has a clear sentence. */
  summary?: string;
  actorLabel?: string;
  entityLabel?: string | null;
}) {
  const safeDetails = sanitizeActivityDetails(input.details);
  const actorLabel =
    input.actorLabel?.trim() ||
    (await resolveActorLabel(input.userType, input.userId));
  const entityLabel =
    input.entityLabel === undefined
      ? await resolveEntityLabel(input.entityType, input.entityId, safeDetails)
      : input.entityLabel;
  const summary =
    input.summary?.trim() ||
    buildSummary({
      actorLabel,
      action: input.action,
      entityType: input.entityType,
      entityLabel,
    });

  return prisma.activityLog.create({
    data: {
      userType: input.userType,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary,
      actorLabel,
      entityLabel,
      details: safeDetails,
    },
  });
}
