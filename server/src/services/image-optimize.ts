import { logger } from "../lib/logger.js";

export type ImagePreset = "logo" | "menu" | "payment";

const PRESETS: Record<ImagePreset, { maxWidth: number; quality: number }> = {
  logo: { maxWidth: 512, quality: 82 },
  menu: { maxWidth: 1400, quality: 80 },
  payment: { maxWidth: 1600, quality: 78 },
};

export type OptimizedImage = {
  buffer: Buffer;
  /** Preferred Cloudinary/format hint after processing. */
  format: "webp" | "jpeg" | "png";
  optimized: boolean;
};

/**
 * SRS §6.1 — auto-resize and convert uploads to WebP in memory.
 * If Sharp's native binary is unavailable (common when npm install used
 * --ignore-scripts), return the original bytes so Cloudinary can still store it.
 */
export async function optimizeImageBuffer(
  input: Buffer,
  preset: ImagePreset,
): Promise<OptimizedImage> {
  const config = PRESETS[preset];

  try {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp(input)
      .rotate()
      .resize({
        width: config.maxWidth,
        withoutEnlargement: true,
      })
      .webp({ quality: config.quality })
      .toBuffer();
    return { buffer, format: "webp", optimized: true };
  } catch (error) {
    logger.warn("Sharp optimize unavailable — uploading original image bytes", {
      preset,
      bytes: input.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      buffer: input,
      format: detectImageFormat(input),
      optimized: false,
    };
  }
}

function detectImageFormat(buffer: Buffer): "webp" | "jpeg" | "png" {
  if (buffer.length >= 12) {
    // RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "webp";
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  // Default: let Cloudinary sniff; webp hint is harmless for conversion.
  return "jpeg";
}
