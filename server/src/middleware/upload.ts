import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./error.js";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function createUploader(subdir: string) {
  const destination = path.join(env.uploadDir, subdir);
  ensureDir(destination);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
      if (!allowed.includes(file.mimetype)) {
        cb(new AppError(400, "Only JPG, PNG, or WebP images are allowed"));
        return;
      }
      cb(null, true);
    },
  });
}

export const paymentUpload = createUploader("payments");
export const menuUpload = createUploader("menu");
export const logoUpload = createUploader("logos");
