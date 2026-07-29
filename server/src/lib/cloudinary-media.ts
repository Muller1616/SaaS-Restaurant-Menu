import { randomUUID } from "node:crypto";
import { getCloudinary } from "../config/cloudinary.js";
import { logger } from "./logger.js";

export type CloudinaryFolder = "logos" | "menu" | "payments" | "qr";

export type UploadedMedia = {
  url: string;
  publicId: string;
};

const FOLDER_PREFIX = "kitchenos";

/**
 * Extract a Cloudinary public_id from a delivery URL.
 * Returns null for legacy `/uploads/...` paths or non-Cloudinary URLs.
 */
export function extractCloudinaryPublicId(
  mediaUrl: string | null | undefined,
): string | null {
  if (!mediaUrl || !mediaUrl.includes("res.cloudinary.com")) return null;
  try {
    const pathname = new URL(mediaUrl).pathname;
    const match = pathname.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

export function isCloudinaryUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.includes("res.cloudinary.com"));
}

function cloudinaryErrorMessage(error: unknown): string {
  if (!error) return "Unknown Cloudinary error";
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object") {
    const obj = error as {
      message?: unknown;
      error?: { message?: unknown };
      http_code?: unknown;
      name?: unknown;
    };
    const nested =
      (typeof obj.error?.message === "string" && obj.error.message) ||
      (typeof obj.message === "string" && obj.message) ||
      null;
    if (nested) {
      const code = obj.http_code != null ? ` (HTTP ${String(obj.http_code)})` : "";
      return `${nested}${code}`;
    }
  }
  return String(error);
}

function mimeForFormat(format: string | undefined) {
  switch ((format || "").toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

/**
 * Upload an in-memory image buffer to Cloudinary.
 * Uses data-URI upload (more reliable than streams on some hosts).
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  folder: CloudinaryFolder,
  options?: { publicId?: string; format?: string },
): Promise<UploadedMedia> {
  if (!buffer?.length) {
    throw new Error("Cannot upload an empty image buffer");
  }

  const cloudinary = getCloudinary();
  const publicId =
    options?.publicId ?? `${FOLDER_PREFIX}/${folder}/${randomUUID()}`;
  const format = options?.format?.toLowerCase();
  const dataUri = `data:${mimeForFormat(format)};base64,${buffer.toString("base64")}`;

  try {
    const uploaded = await cloudinary.uploader.upload(dataUri, {
      public_id: publicId,
      resource_type: "image",
      overwrite: Boolean(options?.publicId),
      unique_filename: !options?.publicId,
      // Let Cloudinary keep/convert; avoid forcing an invalid format on raw bytes.
      ...(format ? { format } : {}),
    });

    if (!uploaded?.secure_url || !uploaded.public_id) {
      throw new Error("Cloudinary upload returned no URL");
    }

    logger.info("Cloudinary upload ok", {
      folder,
      publicId: uploaded.public_id,
      bytes: buffer.length,
    });

    return { url: uploaded.secure_url, publicId: uploaded.public_id };
  } catch (error) {
    const message = cloudinaryErrorMessage(error);
    logger.error("Cloudinary upload failed", error, {
      folder,
      publicId,
      bytes: buffer.length,
      format: format ?? null,
      detail: message,
    });
    throw new Error(message);
  }
}

/** Delete a Cloudinary asset by public_id. Soft-fails so DB updates still proceed. */
export async function destroyCloudinaryPublicId(
  publicId: string | null | undefined,
): Promise<void> {
  if (!publicId) return;
  try {
    const cloudinary = getCloudinary();
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    logger.warn("Cloudinary destroy failed", {
      publicId,
      error: cloudinaryErrorMessage(error),
    });
  }
}

/** Delete by stored media URL (Cloudinary only; ignores legacy local paths). */
export async function destroyCloudinaryUrl(
  mediaUrl: string | null | undefined,
): Promise<void> {
  const publicId = extractCloudinaryPublicId(mediaUrl);
  await destroyCloudinaryPublicId(publicId);
}

/** Fetch a remote image into a Buffer (e.g. Cloudinary logo for QR overlay). */
export async function fetchRemoteImageBuffer(
  url: string | null | undefined,
): Promise<Buffer | null> {
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logger.warn("Failed to fetch remote image", {
      url,
      error: cloudinaryErrorMessage(error),
    });
    return null;
  }
}
