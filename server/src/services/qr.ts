import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { env } from "../config/env.js";

export const DEFAULT_QR_FG = "#0E1412";
export const DEFAULT_QR_BG = "#FFFFFF";

export function buildMenuUrl(tenantSlug: string, branchSlug: string) {
  return `${env.publicAppUrl}/r/${tenantSlug}/${branchSlug}`;
}

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return fallback;
  return trimmed.toUpperCase();
}

export function resolveUploadAbsolutePath(publicUrl: string | null | undefined) {
  if (!publicUrl) return null;
  const cleaned = publicUrl.replace(/^\/uploads\//, "").replace(/^\//, "");
  if (!cleaned || cleaned.includes("..")) return null;
  return path.join(env.uploadDir, cleaned);
}

async function overlayLogo(pngPath: string, logoPath: string) {
  const size = 1024;
  const logoBox = Math.round(size * 0.22);
  const pad = Math.round(logoBox * 0.12);
  const inner = logoBox - pad * 2;

  const logoBuf = await sharp(logoPath)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  const plate = await sharp({
    create: {
      width: logoBox,
      height: logoBox,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logoBuf, left: pad, top: pad }])
    .png()
    .toBuffer();

  const left = Math.round((size - logoBox) / 2);
  const top = left;

  await sharp(pngPath)
    .composite([{ input: plate, left, top }])
    .png()
    .toFile(pngPath + ".tmp");

  await fs.rename(pngPath + ".tmp", pngPath);
}

export async function generateBranchQr(input: {
  tenantSlug: string;
  branchSlug: string;
  branchId: string;
  fgColor?: string | null;
  bgColor?: string | null;
  logoPath?: string | null;
}) {
  const menuUrl = buildMenuUrl(input.tenantSlug, input.branchSlug);
  const dir = path.join(env.uploadDir, "qr");
  await fs.mkdir(dir, { recursive: true });

  const dark = normalizeHexColor(input.fgColor, DEFAULT_QR_FG);
  const light = normalizeHexColor(input.bgColor, DEFAULT_QR_BG);
  const useLogo = Boolean(input.logoPath);

  const pngName = `${input.branchId}.png`;
  const svgName = `${input.branchId}.svg`;
  const pngPath = path.join(dir, pngName);
  const svgPath = path.join(dir, svgName);

  const qrOptions = {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: useLogo ? ("H" as const) : ("M" as const),
    color: { dark, light },
  };

  await QRCode.toFile(pngPath, menuUrl, {
    type: "png",
    ...qrOptions,
  });

  if (input.logoPath) {
    try {
      await fs.access(input.logoPath);
      await overlayLogo(pngPath, input.logoPath);
    } catch {
      // Logo missing — keep plain QR
    }
  }

  const svg = await QRCode.toString(menuUrl, {
    type: "svg",
    ...qrOptions,
  });
  await fs.writeFile(svgPath, svg, "utf8");

  return {
    menuUrl,
    qrCodeUrl: `/uploads/qr/${pngName}`,
    qrSvgUrl: `/uploads/qr/${svgName}`,
    pngPath,
    svgPath,
    fgColor: dark,
    bgColor: light,
    usedLogo: useLogo,
  };
}
