import type { SubscriptionAlertKind } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import {
  computeSubscriptionView,
  syncSubscriptionStatus,
} from "../modules/subscriptions/subscription.logic.js";
import {
  subscriptionExpiredEmail,
  subscriptionNearExpiryEmail,
} from "../services/email.js";
import { notifyTenant } from "../services/notify.js";

/** Map remaining days into SRS checkpoints (7 / 3 / 1) without missing hourly runs. */
function kindForDays(days: number): SubscriptionAlertKind | null {
  if (days <= 7 && days > 3) return "NEAR_EXPIRY_7";
  if (days <= 3 && days > 1) return "NEAR_EXPIRY_3";
  if (days <= 1 && days >= 0) return "NEAR_EXPIRY_1";
  return null;
}

async function alreadySent(input: {
  subscriptionId: string;
  kind: SubscriptionAlertKind;
  expiryDate: Date;
}) {
  const existing = await prisma.subscriptionAlert.findUnique({
    where: {
      subscriptionId_kind_expiryDate: {
        subscriptionId: input.subscriptionId,
        kind: input.kind,
        expiryDate: input.expiryDate,
      },
    },
  });
  return Boolean(existing);
}

async function markSent(input: {
  subscriptionId: string;
  kind: SubscriptionAlertKind;
  expiryDate: Date;
}) {
  await prisma.subscriptionAlert.create({
    data: {
      subscriptionId: input.subscriptionId,
      kind: input.kind,
      expiryDate: input.expiryDate,
    },
  });
}

/**
 * FR-8.1 / §7.4: near-expiry (7, 3, 1 days) + expired emails.
 * Deduped per subscription + expiry period via SubscriptionAlert.
 */
export async function runSubscriptionAlertJob(now = new Date()) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      expiryDate: { not: null },
      status: { notIn: ["SUSPENDED", "CANCELLED"] },
      branch: { deletedAt: null, isActive: true },
    },
    include: {
      plan: true,
      branch: {
        include: {
          tenant: {
            select: {
              id: true,
              fullName: true,
              email: true,
              businessName: true,
              status: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  let nearExpirySent = 0;
  let expiredSent = 0;
  let skipped = 0;
  let errors = 0;

  for (const subscription of subscriptions) {
    try {
      if (subscription.branch.tenant.status !== "ACTIVE") {
        skipped += 1;
        continue;
      }

      await syncSubscriptionStatus(subscription.id);
      const fresh = await prisma.subscription.findUnique({
        where: { id: subscription.id },
      });
      if (!fresh?.expiryDate) {
        skipped += 1;
        continue;
      }

      const view = computeSubscriptionView({
        status: fresh.status,
        expiryDate: fresh.expiryDate,
        now,
      });

      const renewUrl = `${env.clientUrl}/r/${encodeURIComponent(subscription.branch.tenant.slug)}/subscription`;
      const tenant = subscription.branch.tenant;
      const branchName = subscription.branch.name;

      if (
        (view.status === "NEARLY_EXPIRED" || view.status === "ACTIVE") &&
        view.daysRemaining != null &&
        view.daysRemaining <= 7
      ) {
        const days = view.daysRemaining;
        const kind = kindForDays(days);
        if (!kind) {
          skipped += 1;
          continue;
        }

        if (
          await alreadySent({
            subscriptionId: subscription.id,
            kind,
            expiryDate: fresh.expiryDate,
          })
        ) {
          skipped += 1;
          continue;
        }

        const email = subscriptionNearExpiryEmail({
          fullName: tenant.fullName,
          businessName: tenant.businessName,
          branchName,
          planName: subscription.plan.name,
          daysRemaining: Math.max(days, 0),
          expiryDate: fresh.expiryDate,
          renewUrl,
        });

        await notifyTenant({
          tenantId: tenant.id,
          type: "SUBSCRIPTION",
          title: view.isTrial
            ? `Trial ends in ${Math.max(days, 0)} day${Math.max(days, 0) === 1 ? "" : "s"}`
            : `Subscription expires in ${Math.max(days, 0)} day${Math.max(days, 0) === 1 ? "" : "s"}`,
          message: view.isTrial
            ? `${branchName}: your free trial ends in ${Math.max(days, 0)} day(s).`
            : `${branchName}: ${subscription.plan.name} plan expires on ${fresh.expiryDate.toDateString()}. Renew to avoid interruption.`,
          forceEmail: true,
          email: {
            subject: email.subject,
            text: email.text,
          },
        });

        await markSent({
          subscriptionId: subscription.id,
          kind,
          expiryDate: fresh.expiryDate,
        });
        nearExpirySent += 1;
        continue;
      }

      if (view.storedStatus === "EXPIRED") {
        if (
          await alreadySent({
            subscriptionId: subscription.id,
            kind: "EXPIRED",
            expiryDate: fresh.expiryDate,
          })
        ) {
          skipped += 1;
          continue;
        }

        const email = subscriptionExpiredEmail({
          fullName: tenant.fullName,
          businessName: tenant.businessName,
          branchName,
          planName: subscription.plan.name,
          renewUrl,
        });

        await notifyTenant({
          tenantId: tenant.id,
          type: "SUBSCRIPTION",
          title: "Subscription expired",
          message: `${branchName}: your public menu is temporarily unavailable. Renew to restore access.`,
          email: {
            subject: email.subject,
            text: email.text,
          },
        });

        await markSent({
          subscriptionId: subscription.id,
          kind: "EXPIRED",
          expiryDate: fresh.expiryDate,
        });
        expiredSent += 1;
        continue;
      }

      skipped += 1;
    } catch (error) {
      errors += 1;
      logger.warn("Subscription alert failed", {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    scanned: subscriptions.length,
    nearExpirySent,
    expiredSent,
    skipped,
    errors,
    ranAt: now.toISOString(),
  };
}
