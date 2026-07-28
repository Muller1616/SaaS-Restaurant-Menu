import multer from "multer";
import { AppError } from "./error.js";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

/**
 * Multer memory storage — files stay in RAM until Sharp + Cloudinary handle them.
 * No permanent local disk writes.
 */
function createUploader() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED.includes(file.mimetype)) {
        cb(new AppError(400, "Only JPG, PNG, or WebP images are allowed"));
        return;
      }
      cb(null, true);
    },
  });
}

const uploader = createUploader();

export const paymentUpload = uploader;
export const menuUpload = uploader;
export const logoUpload = uploader;
