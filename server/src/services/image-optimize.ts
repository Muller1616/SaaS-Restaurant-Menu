import sharp from "sharp";

export type ImagePreset = "logo" | "menu" | "payment";

const PRESETS: Record<ImagePreset, { maxWidth: number; quality: number }> = {
  logo: { maxWidth: 512, quality: 82 },
  menu: { maxWidth: 1400, quality: 80 },
  payment: { maxWidth: 1600, quality: 78 },
};

/**
 * SRS §6.1 — auto-resize and convert uploads to WebP in memory.
 */
export async function optimizeImageBuffer(
  input: Buffer,
  preset: ImagePreset,
): Promise<Buffer> {
  const config = PRESETS[preset];
  return sharp(input)
    .rotate()
    .resize({
      width: config.maxWidth,
      withoutEnlargement: true,
    })
    .webp({ quality: config.quality })
    .toBuffer();
}
