import type { ActivityAction, ActivityUserType, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function logActivity(input: {
  userType: ActivityUserType;
  userId: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  return prisma.activityLog.create({
    data: {
      userType: input.userType,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      details: input.details,
    },
  });
}
