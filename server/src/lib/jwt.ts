import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtRole = "ADMIN" | "TENANT";
export type JwtAdminRole = "SUPER_ADMIN" | "ADMIN";

export type AccessTokenPayload = {
  sub: string;
  role: JwtRole;
  email: string;
  name: string;
  /** Must match AdminUser.tokenVersion / Tenant.tokenVersion or the token is rejected. */
  tokenVersion: number;
  /** Present when role === ADMIN — DB AdminRole for RBAC. */
  adminRole?: JwtAdminRole;
};

export function signAccessToken(
  payload: AccessTokenPayload,
  rememberMe = false,
): string {
  const options: SignOptions = {
    expiresIn: rememberMe ? env.jwtRememberExpiresIn : env.jwtExpiresIn,
  } as SignOptions;

  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
  if (typeof payload.tokenVersion !== "number") {
    throw new Error("Missing tokenVersion claim");
  }
  return payload;
}
