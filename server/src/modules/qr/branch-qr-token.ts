import type { ActivityUserType, Prisma } from "@prisma/client";
import { uniquePublicQrId } from "../../lib/slug.js";
import { prisma } from "../../lib/prisma.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type QrTokenActor = {
  type: ActivityUserType;
  id: string;
};

/**
 * Persist a new ACTIVE QR token history row for a branch.
 * Call after allocating `publicQrId` on Branch (approval / create).
 */
export async function recordIssuedQrToken(
  db: DbClient,
  input: {
    token: string;
    branchId: string;
    tenantId: string;
    actor?: QrTokenActor | null;
  },
) {
  return db.branchQrToken.create({
    data: {
      token: input.token,
      branchId: input.branchId,
      tenantId: input.tenantId,
      status: "ACTIVE",
      createdByType: input.actor?.type ?? null,
      createdById: input.actor?.id ?? null,
    },
  });
}

/**
 * Rotate the branch opaque QR token:
 * - Revoke previous ACTIVE history rows
 * - Issue a brand-new cryptographically secure token
 * - Update Branch.publicQrId + qrRegeneratedAt
 */
export async function rotateBranchPublicQrToken(input: {
  branchId: string;
  tenantId: string;
  previousToken: string;
  actor?: QrTokenActor | null;
}) {
  const nextToken = await uniquePublicQrId();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.branchQrToken.updateMany({
      where: {
        branchId: input.branchId,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
      },
    });

    await tx.branchQrToken.create({
      data: {
        token: nextToken,
        branchId: input.branchId,
        tenantId: input.tenantId,
        status: "ACTIVE",
        createdByType: input.actor?.type ?? null,
        createdById: input.actor?.id ?? null,
      },
    });

    await tx.branch.update({
      where: { id: input.branchId },
      data: {
        publicQrId: nextToken,
        qrRegeneratedAt: now,
      },
    });
  });

  return { previousToken: input.previousToken, nextToken, rotatedAt: now };
}

/** Revoke all active QR tokens for a soft-deleted / deactivated branch. */
export async function revokeBranchQrTokens(branchId: string) {
  const now = new Date();
  await prisma.branchQrToken.updateMany({
    where: { branchId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: now },
  });
}

/** True when a token is known but revoked (helps distinguish from never-issued). */
export async function isRevokedQrToken(token: string) {
  const row = await prisma.branchQrToken.findUnique({
    where: { token },
    select: { status: true },
  });
  return row?.status === "REVOKED";
}
