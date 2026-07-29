import type { NextFunction, Request, Response } from "express";
import {
  uploadImageBuffer,
  type CloudinaryFolder,
  type UploadedMedia,
} from "../lib/cloudinary-media.js";
import { logger } from "../lib/logger.js";
import {
  optimizeImageBuffer,
  type ImagePreset,
} from "../services/image-optimize.js";
import { AppError } from "./error.js";

export type { UploadedMedia };

declare global {
  namespace Express {
    interface Request {
      /** Set after Sharp optimize + Cloudinary upload. */
      uploadedMedia?: UploadedMedia;
    }
  }
}

const PRESET_TO_FOLDER: Record<ImagePreset, CloudinaryFolder> = {
  logo: "logos",
  menu: "menu",
  payment: "payments",
};

/**
 * After multer (memory): optimize to WebP when Sharp works, upload to Cloudinary,
 * attach `req.uploadedMedia`, clear the raw buffer.
 */
export async function processAndUploadImage(
  req: Request,
  preset: ImagePreset,
): Promise<void> {
  if (!req.file?.buffer?.length) return;

  const folder = PRESET_TO_FOLDER[preset];

  try {
    const optimized = await optimizeImageBuffer(req.file.buffer, preset);
    const uploaded = await uploadImageBuffer(optimized.buffer, folder, {
      format: optimized.format,
    });
    req.uploadedMedia = uploaded;
    req.file.buffer = Buffer.alloc(0);
    req.file.mimetype = `image/${optimized.format === "jpeg" ? "jpeg" : optimized.format}`;
    req.file.filename = uploaded.publicId;
    logger.info("Upload processed", {
      preset,
      folder,
      optimized: optimized.optimized,
      publicId: uploaded.publicId,
    });
  } catch (error) {
    logger.error("Upload processing failed", error, {
      preset,
      folder,
      bytes: req.file.buffer.length,
      mimetype: req.file.mimetype,
    });
    if (error instanceof AppError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    if (/cloudinary is not configured/i.test(message)) {
      throw new AppError(
        503,
        "Image storage is not configured. Please contact support.",
      );
    }
    if (/Invalid image|unsupported image|Input buffer/i.test(message)) {
      throw new AppError(
        400,
        "That file could not be read as an image. Use a JPG, PNG, or WebP screenshot.",
      );
    }
    throw new AppError(
      400,
      "Could not upload the image. Please try a smaller JPG or PNG screenshot (max 2MB).",
    );
  }
}

/** Express middleware factory: optimize + Cloudinary for the given preset. */
export function cloudinaryUploadMiddleware(preset: ImagePreset) {
  return (req: Request, _res: Response, next: NextFunction) => {
    void processAndUploadImage(req, preset)
      .then(() => next())
      .catch((error) => next(error));
  };
}
