import type { NextFunction, Request, Response } from "express";
import {
  uploadImageBuffer,
  type CloudinaryFolder,
  type UploadedMedia,
} from "../lib/cloudinary-media.js";
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
 * After multer (memory): optimize to WebP, upload to Cloudinary,
 * attach `req.uploadedMedia`, clear the raw buffer.
 */
export async function processAndUploadImage(
  req: Request,
  preset: ImagePreset,
): Promise<void> {
  if (!req.file?.buffer?.length) return;

  try {
    const optimized = await optimizeImageBuffer(req.file.buffer, preset);
    const uploaded = await uploadImageBuffer(optimized, PRESET_TO_FOLDER[preset], {
      format: "webp",
    });
    req.uploadedMedia = uploaded;
    req.file.buffer = Buffer.alloc(0);
    req.file.mimetype = "image/webp";
    req.file.filename = uploaded.publicId;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      400,
      error instanceof Error && error.message.includes("Cloudinary is not configured")
        ? error.message
        : "Could not process image",
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
