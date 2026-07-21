/** Client-side guard: images must come from the device, max 2MB. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function validateDeviceImage(file: File | null | undefined): string | null {
  if (!file) return "Choose an image from your device";
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Only JPG, PNG, or WebP images are allowed";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 2MB or less";
  }
  return null;
}
