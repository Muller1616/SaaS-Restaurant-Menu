import type {
  ActivityUserType,
  Prisma,
  SubscriptionEventKind,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";

export async function recordSubscriptionEvent(input: {
  subscriptionId: string;
  branchId: string;
  tenantId: string;
  kind: SubscriptionEventKind;
  summary: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorType?: ActivityUserType | null;
  actorId?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  return prisma.subscriptionEvent.create({
    data: {
      subscriptionId: input.subscriptionId,
      branchId: input.branchId,
      tenantId: input.tenantId,
      kind: input.kind,
      summary: input.summary,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      meta: input.meta ?? undefined,
    },
  });
}

function serializeEvent(event: {
  id: string;
  kind: SubscriptionEventKind;
  fromStatus: string | null;
  toStatus: string | null;
  summary: string;
  actorType: ActivityUserType | null;
  actorId: string | null;
  meta: unknown;
  createdAt: Date;
}) {
  return {
    id: event.id,
    kind: event.kind,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    summary: event.summary,
    actorType: event.actorType,
    actorId: event.actorId,
    meta: event.meta,
    createdAt: event.createdAt,
  };
}

/** FR-9.4 — subscription timeline for a branch. */
export async function listBranchSubscriptionHistory(input: {
  branchId: string;
  tenantId?: string;
}) {
  const branch = await prisma.branch.findFirst({
    where: {
      id: input.branchId,
      deletedAt: null,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
    include: {
      tenant: {
        select: { id: true, businessName: true, email: true },
      },
      subscription: {
        include: { plan: { select: { name: true, slug: true } } },
      },
    },
  });

  if (!branch) throw new AppError(404, "Branch not found");
  if (!branch.subscription) {
    return {
      branch: {
        id: branch.id,
        name: branch.name,
        tenant: branch.tenant,
      },
      subscription: null,
      events: [] as ReturnType<typeof serializeEvent>[],
    };
  }

  const events = await prisma.subscriptionEvent.findMany({
    where: { branchId: branch.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      tenant: branch.tenant,
    },
    subscription: {
      id: branch.subscription.id,
      status: branch.subscription.status,
      startDate: branch.subscription.startDate,
      expiryDate: branch.subscription.expiryDate,
      plan: branch.subscription.plan,
    },
    events: events.map(serializeEvent),
  };
}

export async function listSubscriptionHistoryById(subscriptionId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { branchId: true },
  });
  if (!subscription) throw new AppError(404, "Subscription not found");
  return listBranchSubscriptionHistory({ branchId: subscription.branchId });
}
