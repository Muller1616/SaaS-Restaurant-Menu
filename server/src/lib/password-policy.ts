import { z } from "zod";

/**
 * Central password policy for every create / change / reset path.
 * Keep in sync with `client/src/lib/password-policy.ts`.
 */

const DEFAULT_MIN_LENGTH = 8;

export function resolvePasswordMinLength(
  raw: string | number | undefined = process.env.PASSWORD_MIN_LENGTH,
): number {
  const n = typeof raw === "number" ? raw : Number(raw ?? DEFAULT_MIN_LENGTH);
  if (!Number.isFinite(n) || n < 8) return DEFAULT_MIN_LENGTH;
  return Math.floor(n);
}

export const PASSWORD_MIN_LENGTH = resolvePasswordMinLength();

/** Allowed special characters (spaces are never allowed). */
export const PASSWORD_SPECIAL_CHAR_CLASS = String.raw`!@#$%^&*()\-_+=?.,:;/\\|\[\]{}`;
export const PASSWORD_SPECIAL_CHARS = "!@#$%^&*()-_+=?.,:;/\\|[]{}";

const SPECIAL_RE = new RegExp(`[${PASSWORD_SPECIAL_CHAR_CLASS}]`);

/** Lowercased passwords that must be rejected even if they match charset rules. */
const COMMON_PASSWORDS = new Set(
  [
    "12345678",
    "123456789",
    "1234567890",
    "password",
    "password1",
    "password12",
    "password123",
    "passw0rd",
    "qwerty123",
    "qwertyui",
    "admin123",
    "admin1234",
    "abcdefgh",
    "abcdefg1",
    "11111111",
    "00000000",
    "87654321",
    "letmein1",
    "welcome1",
    "iloveyou",
    "monkey12",
    "dragon12",
    "baseball",
    "football",
    "sunshine",
    "princess",
    "superman",
    "kitchenos",
    "kitchen1",
    "changeme",
    "changeme1",
    "temp1234",
    "temporary",
  ].map((p) => p.toLowerCase()),
);

export type PasswordRuleId =
  | "length"
  | "upper"
  | "lower"
  | "number"
  | "special"
  | "noSpaces"
  | "notCommon";

export type PasswordRuleStatus = {
  id: PasswordRuleId;
  label: string;
  met: boolean;
};

export function getPasswordRuleStatus(
  password: string,
  minLength: number = PASSWORD_MIN_LENGTH,
): PasswordRuleStatus[] {
  const value = password ?? "";
  const lower = value.toLowerCase();
  return [
    {
      id: "length",
      label: `At least ${minLength} characters`,
      met: value.length >= minLength,
    },
    {
      id: "upper",
      label: "Contains an uppercase letter",
      met: /[A-Z]/.test(value),
    },
    {
      id: "lower",
      label: "Contains a lowercase letter",
      met: /[a-z]/.test(value),
    },
    {
      id: "number",
      label: "Contains a number",
      met: /[0-9]/.test(value),
    },
    {
      id: "special",
      label: "Contains a special character",
      met: SPECIAL_RE.test(value),
    },
    {
      id: "noSpaces",
      label: "Does not contain spaces",
      met: value.length > 0 && !/\s/.test(value),
    },
    {
      id: "notCommon",
      label: "Is not a common or easily guessed password",
      met: value.length > 0 && !COMMON_PASSWORDS.has(lower),
    },
  ];
}

export function isStrongPassword(
  password: string,
  minLength: number = PASSWORD_MIN_LENGTH,
): boolean {
  return getPasswordRuleStatus(password, minLength).every((rule) => rule.met);
}

export function passwordPolicyErrorMessage(
  password: string,
  minLength: number = PASSWORD_MIN_LENGTH,
): string | null {
  const unmet = getPasswordRuleStatus(password, minLength).filter((r) => !r.met);
  if (unmet.length === 0) return null;
  if (unmet.length === 1) {
    return `Password requirement not met: ${unmet[0]!.label.toLowerCase()}.`;
  }
  return `Password must: ${unmet.map((r) => r.label.toLowerCase()).join("; ")}.`;
}

/** Zod field schema — use on every newPassword / password-create field. */
export function strongPasswordSchema(
  minLength: number = PASSWORD_MIN_LENGTH,
) {
  return z.string().superRefine((value, ctx) => {
    const message = passwordPolicyErrorMessage(value, minLength);
    if (message) {
      ctx.addIssue({
        code: "custom",
        message,
      });
    }
  });
}

/** Defense-in-depth for service layers that hash passwords. */
export function assertStrongPassword(
  password: string,
  minLength: number = PASSWORD_MIN_LENGTH,
): void {
  const message = passwordPolicyErrorMessage(password, minLength);
  if (message) {
    const error = new Error(message);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }
}

export const PASSWORD_POLICY_SUMMARY = `Use at least ${PASSWORD_MIN_LENGTH} characters with upper and lower case letters, a number, and a special character (!@#$%^&* etc.). No spaces. Avoid common passwords.`;
