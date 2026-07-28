import { z } from "zod";
import { logActivity } from "../../lib/activity-log.js";
import {
  destroyCloudinaryUrl,
  fetchRemoteImageBuffer,
  isCloudinaryUrl,
} from "../../lib/cloudinary-media.js";
import {
  invalidateCachesForBranch,
  invalidatePublicMenuCache,
} from "../../lib/cache/index.js";
import { toPublicMediaUrl } from "../../lib/media-url.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error.js";
import {
  buildPublicQrUrl,
  DEFAULT_QR_BG,
  DEFAULT_QR_FG,
  generateBranchQr,
  normalizeHexColor,
} from "../../services/qr.js";
import { uniquePublicQrId } from "../../lib/slug.js";
import { rotateBranchPublicQrToken } from "./branch-qr-token.js";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value like #0E1412");

export const updateQrStyleSchema = z.object({
  fgColor: hexColor.optional(),
  bgColor: hexColor.optional(),
  useLogo: z.boolean().optional(),
});

function planHasCustomQr(features: unknown) {
  return Boolean(
    features &&
      typeof features === "object" &&
      (features as { customQr?: boolean }).customQr,
  );
}

async function getBranchForTenant(tenantId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
    include: {
      tenant: {
        select: {
          slug: true,
          businessName: true,
          logoUrl: true,
        },
      },
      subscription: {
        select: {
          status: true,
          plan: { select: { features: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!branch) {
    throw new AppError(404, "Branch not found");
  }

  return branch;
}

async function logoBufferForBranch(branch: {
  qrUseLogo: boolean;
  tenant: { logoUrl: string | null };
  subscription: { plan: { features: unknown } } | null;
}) {
  const canCustomize = planHasCustomQr(branch.subscription?.plan.features);
  if (!canCustomize || !branch.qrUseLogo || !branch.tenant.logoUrl) {
    return null;
  }
  return fetchRemoteImageBuffer(branch.tenant.logoUrl);
}

function styleForGeneration(branch: {
  qrFgColor: string | null;
  qrBgColor: string | null;
  qrUseLogo: boolean;
  tenant: { logoUrl: string | null };
  subscription: { plan: { features: unknown } } | null;
}) {
  const canCustomize = planHasCustomQr(branch.subscription?.plan.features);
  if (!canCustomize) {
    return {
      fgColor: DEFAULT_QR_FG,
      bgColor: DEFAULT_QR_BG,
      canCustomize: false,
    };
  }

  return {
    fgColor: normalizeHexColor(branch.qrFgColor, DEFAULT_QR_FG),
    bgColor: normalizeHexColor(branch.qrBgColor, DEFAULT_QR_BG),
    canCustomize: true,
  };
}

async function writeQrForBranch(
  branch: {
    id: string;
    publicQrId: string;
    qrCodeUrl: string | null;
    qrFgColor: string | null;
    qrBgColor: string | null;
    qrUseLogo: boolean;
    tenant: { slug: string; logoUrl: string | null };
    subscription: { plan: { features: unknown } } | null;
  },
  options?: { rotatePublicId?: boolean },
) {
  const style = styleForGeneration(branch);
  const publicQrId = options?.rotatePublicId
    ? await uniquePublicQrId()
    : branch.publicQrId;

  const logoBuffer = await logoBufferForBranch(branch);
  const previousUrl = branch.qrCodeUrl;

  const generated = await generateBranchQr({
    publicQrId,
    branchId: branch.id,
    fgColor: style.fgColor,
    bgColor: style.bgColor,
    logoBuffer,
  });

  // Overwrite uses the same public_id (`kitchenos/qr/{branchId}`); destroy only
  // when replacing a different legacy/non-overwrite URL.
  if (
    previousUrl &&
    previousUrl !== generated.qrCodeUrl &&
    !previousUrl.includes(`kitchenos/qr/${branch.id}`)
  ) {
    await destroyCloudinaryUrl(previousUrl);
  }

  return { ...generated, publicQrId };
}

function needsQrRegeneration(qrCodeUrl: string | null | undefined) {
  if (!qrCodeUrl) return true;
  // Legacy local paths must be regenerated onto Cloudinary.
  if (!isCloudinaryUrl(qrCodeUrl) && !/^https?:\/\//i.test(qrCodeUrl)) {
    return true;
  }
  return false;
}

export async function getBranchQr(tenantId: string, branchId: string) {
  const branch = await getBranchForTenant(tenantId, branchId);
  const menuUrl = buildPublicQrUrl(branch.publicQrId);
  const canCustomize = planHasCustomQr(branch.subscription?.plan.features);

  let qrCodeUrl = branch.qrCodeUrl;
  let qrSvg: string | null = null;

  if (needsQrRegeneration(qrCodeUrl)) {
    const generated = await writeQrForBranch(branch);
    qrCodeUrl = generated.qrCodeUrl;
    qrSvg = generated.qrSvg;
    await prisma.branch.update({
      where: { id: branch.id },
      data: {
        qrCodeUrl,
        publicQrId: generated.publicQrId,
      },
    });
  }

  return {
    branchId: branch.id,
    branchName: branch.name,
    location: branch.location,
    phone: branch.phone,
    businessName: branch.tenant.businessName,
    tenantSlug: branch.tenant.slug,
    branchSlug: branch.slug,
    publicQrId: branch.publicQrId,
    menuUrl,
    qrCodeUrl: toPublicMediaUrl(qrCodeUrl)!,
    qrSvgUrl: null as string | null,
    qrSvg,
    qrCreatedAt: branch.qrCreatedAt,
    qrRegeneratedAt: branch.qrRegeneratedAt,
    subscriptionStatus: branch.subscription?.status ?? null,
    canCustomize,
    hasLogo: Boolean(branch.tenant.logoUrl),
    style: {
      fgColor: canCustomize
        ? normalizeHexColor(branch.qrFgColor, DEFAULT_QR_FG)
        : DEFAULT_QR_FG,
      bgColor: canCustomize
        ? normalizeHexColor(branch.qrBgColor, DEFAULT_QR_BG)
        : DEFAULT_QR_BG,
      useLogo: canCustomize ? branch.qrUseLogo : false,
    },
    downloadPngUrl: `/api/v1/tenant/qr/download?format=png`,
    downloadSvgUrl: `/api/v1/tenant/qr/download?format=svg`,
    printUrl: `/api/v1/tenant/qr/print`,
  };
}

export async function regenerateBranchQr(tenantId: string, branchId: string) {
  const branch = await getBranchForTenant(tenantId, branchId);
  const previousPublicQrId = branch.publicQrId;

  const rotated = await rotateBranchPublicQrToken({
    branchId: branch.id,
    tenantId,
    previousToken: previousPublicQrId,
    actor: { type: "TENANT", id: tenantId },
  });

  const refreshed = await getBranchForTenant(tenantId, branchId);
  const generated = await writeQrForBranch(refreshed);

  await prisma.branch.update({
    where: { id: branch.id },
    data: {
      qrCodeUrl: generated.qrCodeUrl,
    },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "branch_qr",
    entityId: branch.id,
    summary: "QR code regenerated successfully",
    details: {
      regenerated: true,
      previousPublicQrId,
      publicQrId: rotated.nextToken,
      menuUrl: generated.menuUrl,
      rotatedAt: rotated.rotatedAt.toISOString(),
      fgColor: generated.fgColor,
      bgColor: generated.bgColor,
      usedLogo: generated.usedLogo,
    },
  });

  await invalidatePublicMenuCache({ publicQrId: previousPublicQrId });
  await invalidateCachesForBranch(branch.id);
  return getBranchQr(tenantId, branchId);
}

export async function updateBranchQrStyle(
  tenantId: string,
  branchId: string,
  input: z.infer<typeof updateQrStyleSchema>,
) {
  const branch = await getBranchForTenant(tenantId, branchId);
  if (!planHasCustomQr(branch.subscription?.plan.features)) {
    throw new AppError(
      403,
      "Custom QR styling is available on Basic, Popular, and Premium plans.",
      { code: "CUSTOM_QR_LOCKED" },
    );
  }

  const nextUseLogo = input.useLogo ?? branch.qrUseLogo;
  if (nextUseLogo && !branch.tenant.logoUrl) {
    throw new AppError(
      400,
      "Upload a business logo in Settings before enabling the logo on your QR.",
    );
  }

  const updated = await prisma.branch.update({
    where: { id: branch.id },
    data: {
      ...(input.fgColor
        ? { qrFgColor: normalizeHexColor(input.fgColor, DEFAULT_QR_FG) }
        : {}),
      ...(input.bgColor
        ? { qrBgColor: normalizeHexColor(input.bgColor, DEFAULT_QR_BG) }
        : {}),
      ...(input.useLogo !== undefined ? { qrUseLogo: input.useLogo } : {}),
    },
    include: {
      tenant: {
        select: {
          slug: true,
          businessName: true,
          logoUrl: true,
        },
      },
      subscription: {
        select: {
          status: true,
          plan: { select: { features: true, name: true, slug: true } },
        },
      },
    },
  });

  const generated = await writeQrForBranch(updated);
  await prisma.branch.update({
    where: { id: branch.id },
    data: { qrCodeUrl: generated.qrCodeUrl },
  });

  await logActivity({
    userType: "TENANT",
    userId: tenantId,
    action: "UPDATE",
    entityType: "branch_qr_style",
    entityId: branch.id,
    details: input,
  });

  return getBranchQr(tenantId, branchId);
}

export async function getQrDownloadPayload(
  tenantId: string,
  branchId: string,
  format: "png" | "svg",
) {
  const data = await getBranchQr(tenantId, branchId);

  if (format === "svg") {
    const branch = await getBranchForTenant(tenantId, branchId);
    const style = styleForGeneration(branch);
    const QRCode = (await import("qrcode")).default;
    const svg = await QRCode.toString(data.menuUrl, {
      type: "svg",
      width: 1024,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: style.fgColor, light: style.bgColor },
    });
    return {
      buffer: Buffer.from(svg, "utf8"),
      fileName: `${branchId}-kitchenos-qr.svg`,
      contentType: "image/svg+xml",
    };
  }

  const buffer = await fetchRemoteImageBuffer(data.qrCodeUrl);
  if (!buffer) {
    throw new AppError(404, "QR file not found");
  }
  return {
    buffer,
    fileName: `${branchId}-kitchenos-qr.png`,
    contentType: "image/png",
  };
}

export function buildPrintHtml(input: {
  businessName: string;
  branchName: string;
  location: string;
  menuUrl: string;
  qrCodeUrl: string;
  assetBaseUrl: string;
}) {
  const qrSrc = input.qrCodeUrl.startsWith("http")
    ? input.qrCodeUrl
    : `${input.assetBaseUrl.replace(/\/$/, "")}${input.qrCodeUrl}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.businessName)} — QR Menu</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: #0e1412;
      background: #fff;
    }
    .sheet {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 18px;
      border: 1px solid #e8dfd0;
      padding: 40px 28px;
    }
    .brand {
      letter-spacing: 0.35em;
      text-transform: uppercase;
      font-size: 12px;
      color: #9a7043;
      font-family: Manrope, Arial, sans-serif;
    }
    h1 {
      margin: 0;
      font-size: 42px;
      font-weight: 600;
    }
    h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 500;
      color: #444;
    }
    .qr {
      width: 320px;
      height: 320px;
      padding: 16px;
      border: 1px solid #ddd3c2;
      background: #fff;
    }
    .qr img { width: 100%; height: 100%; object-fit: contain; }
    .hint {
      font-family: Manrope, Arial, sans-serif;
      font-size: 14px;
      color: #555;
      max-width: 420px;
      line-height: 1.5;
    }
    .url {
      font-family: Manrope, Arial, sans-serif;
      font-size: 12px;
      color: #777;
      word-break: break-all;
    }
    @media print {
      .no-print { display: none !important; }
      .sheet { border: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding:16px;text-align:center;font-family:Manrope,Arial,sans-serif">
    <button onclick="window.print()" style="padding:10px 18px;border-radius:999px;border:0;background:#0e1412;color:#fff;font-weight:700;cursor:pointer">
      Print A4
    </button>
  </div>
  <div class="sheet">
    <div class="brand">KitchenOS</div>
    <h1>${escapeHtml(input.businessName)}</h1>
    <h2>${escapeHtml(input.branchName)}</h2>
    <p class="hint">${escapeHtml(input.location)}<br/>Scan to view our menu</p>
    <div class="qr"><img src="${qrSrc}" alt="Menu QR code" /></div>
    <p class="url">${escapeHtml(input.menuUrl)}</p>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
