import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export type ImagePreset = "logo" | "menu" | "payment";

const PRESETS: Record<ImagePreset, { maxWidth: number; quality: number }> = {
  logo: { maxWidth: 512, quality: 82 },
  menu: { maxWidth: 1400, quality: 80 },
  payment: { maxWidth: 1600, quality: 78 },
};

/**
 * SRS §6.1 — auto-resize and convert uploads to WebP.
 * Replaces the original multer file with an optimized .webp sibling.
 */
export async function optimizeUploadedImage(
  absolutePath: string,
  preset: ImagePreset,
): Promise<string> {
  const config = PRESETS[preset];
  const dir = path.dirname(absolutePath);
  const base = path.basename(absolutePath, path.extname(absolutePath));
  const outName = `${base}.webp`;
  const outPath = path.join(dir, outName);

  await sharp(absolutePath)
    .rotate()
    .resize({
      width: config.maxWidth,
      withoutEnlargement: true,
    })
    .webp({ quality: config.quality })
    .toFile(outPath);

  if (outPath !== absolutePath) {
    await fs.unlink(absolutePath).catch(() => undefined);
  }

  return outName;
}
