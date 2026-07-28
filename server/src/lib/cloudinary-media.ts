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

/** Upload an in-memory image buffer to Cloudinary. */
export async function uploadImageBuffer(
  buffer: Buffer,
  folder: CloudinaryFolder,
  options?: { publicId?: string; format?: string },
): Promise<UploadedMedia> {
  const cloudinary = getCloudinary();
  const publicId =
    options?.publicId ?? `${FOLDER_PREFIX}/${folder}/${randomUUID()}`;

  const result = await new Promise<{
    secure_url: string;
    public_id: string;
  }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: undefined,
          public_id: publicId,
          resource_type: "image",
          overwrite: Boolean(options?.publicId),
          format: options?.format,
        },
        (error, uploaded) => {
          if (error || !uploaded?.secure_url || !uploaded.public_id) {
            reject(error ?? new Error("Cloudinary upload returned no URL"));
            return;
          }
          resolve({
            secure_url: uploaded.secure_url,
            public_id: uploaded.public_id,
          });
        },
      )
      .end(buffer);
  });

  return { url: result.secure_url, publicId: result.public_id };
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
      error: error instanceof Error ? error.message : String(error),
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
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
