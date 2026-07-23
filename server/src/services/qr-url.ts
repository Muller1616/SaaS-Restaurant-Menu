import { env } from "../config/env.js";

/** Customer-facing QR URL — opaque id only, never tenant slug. */
export function buildPublicQrUrl(publicQrId: string) {
  return `${env.publicAppUrl}/r/${publicQrId}`;
}

/** Alias used by existing call sites. */
export function buildMenuUrl(publicQrId: string) {
  return buildPublicQrUrl(publicQrId);
}
