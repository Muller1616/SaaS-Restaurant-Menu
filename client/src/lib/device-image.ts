/** Client-side guard: images must come from the device, max 2MB. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/pjpeg",
]);

function hasAllowedExtension(name: string) {
  return /\.(jpe?g|png|webp)$/i.test(name);
}

export function validateDeviceImage(file: File | null | undefined): string | null {
  if (!file) return "Choose an image from your device";

  const mime = String(file.type || "").toLowerCase();
  const mimeOk =
    ALLOWED_IMAGE_TYPES.has(mime) ||
    // Mobile browsers sometimes omit MIME for gallery screenshots.
    ((!mime || mime === "application/octet-stream") &&
      hasAllowedExtension(file.name));

  if (!mimeOk) {
    return "Only JPG, PNG, or WebP images are allowed";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 2MB or less";
  }
  return null;
}
