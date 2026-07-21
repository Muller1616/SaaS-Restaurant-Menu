import path from "node:path";
import type { Request } from "express";
import {
  optimizeUploadedImage,
  type ImagePreset,
} from "../services/image-optimize.js";

/** After multer, resize + convert to WebP and update req.file.filename. */
export async function optimizeRequestImage(
  req: Request,
  preset: ImagePreset,
): Promise<void> {
  if (!req.file?.path) return;
  const abs = path.resolve(req.file.path);
  const outName = await optimizeUploadedImage(abs, preset);
  req.file.filename = outName;
  req.file.path = path.join(path.dirname(abs), outName);
  req.file.mimetype = "image/webp";
}
