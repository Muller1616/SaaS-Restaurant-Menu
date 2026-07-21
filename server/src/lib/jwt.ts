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
  return jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
}
