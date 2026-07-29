import multer from "multer";
import { AppError } from "./error.js";

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/pjpeg",
]);

/**
 * Multer memory storage — files stay in RAM until Sharp + Cloudinary handle them.
 * No permanent local disk writes.
 */
function createUploader(maxBytes: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      const mime = String(file.mimetype || "").toLowerCase();
      // Some mobile browsers send empty or generic MIME for gallery picks.
      if (!mime || mime === "application/octet-stream") {
        const name = String(file.originalname || "").toLowerCase();
        if (/\.(jpe?g|png|webp)$/.test(name)) {
          cb(null, true);
          return;
        }
      }
      if (!ALLOWED.has(mime)) {
        cb(new AppError(400, "Only JPG, PNG, or WebP images are allowed"));
        return;
      }
      cb(null, true);
    },
  });
}

/** Payment proofs + logos + menu images — 2MB client/server limit. */
const uploader = createUploader(2 * 1024 * 1024);

export const paymentUpload = uploader;
export const menuUpload = uploader;
export const logoUpload = uploader;
