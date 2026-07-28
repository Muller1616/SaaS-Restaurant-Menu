import QRCode from "qrcode";
import sharp from "sharp";
import { uploadImageBuffer } from "../lib/cloudinary-media.js";
import { buildPublicQrUrl } from "./qr-url.js";

export const DEFAULT_QR_FG = "#0E1412";
export const DEFAULT_QR_BG = "#FFFFFF";

export { buildMenuUrl, buildPublicQrUrl } from "./qr-url.js";

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return fallback;
  return trimmed.toUpperCase();
}

async function overlayLogoOnPng(
  pngBuffer: Buffer,
  logoBuffer: Buffer,
): Promise<Buffer> {
  const size = 1024;
  const logoBox = Math.round(size * 0.22);
  const pad = Math.round(logoBox * 0.12);
  const inner = logoBox - pad * 2;

  const logoBuf = await sharp(logoBuffer)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
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

  return sharp(pngBuffer)
    .composite([{ input: plate, left, top }])
    .png()
    .toBuffer();
}

/**
 * Generate a branch QR as PNG (uploaded to Cloudinary) + SVG string (on demand).
 */
export async function generateBranchQr(input: {
  publicQrId: string;
  branchId: string;
  fgColor?: string | null;
  bgColor?: string | null;
  logoBuffer?: Buffer | null;
}) {
  const menuUrl = buildPublicQrUrl(input.publicQrId);
  const dark = normalizeHexColor(input.fgColor, DEFAULT_QR_FG);
  const light = normalizeHexColor(input.bgColor, DEFAULT_QR_BG);
  const useLogo = Boolean(input.logoBuffer?.length);

  const qrOptions = {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: useLogo ? ("H" as const) : ("M" as const),
    color: { dark, light },
  };

  let pngBuffer = await QRCode.toBuffer(menuUrl, {
    type: "png",
    ...qrOptions,
  });

  if (input.logoBuffer?.length) {
    try {
      pngBuffer = await overlayLogoOnPng(pngBuffer, input.logoBuffer);
    } catch {
      // Logo overlay failed — keep plain QR
    }
  }

  const uploaded = await uploadImageBuffer(pngBuffer, "qr", {
    publicId: `kitchenos/qr/${input.branchId}`,
    format: "png",
  });

  const svg = await QRCode.toString(menuUrl, {
    type: "svg",
    ...qrOptions,
  });

  return {
    menuUrl,
    publicQrId: input.publicQrId,
    qrCodeUrl: uploaded.url,
    qrSvg: svg,
    fgColor: dark,
    bgColor: light,
    usedLogo: useLogo,
  };
}
