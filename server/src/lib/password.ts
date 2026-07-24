import { randomBytes, randomInt } from "node:crypto";
import {
  isStrongPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_CHARS,
} from "./password-policy.js";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = PASSWORD_SPECIAL_CHARS.replace(/\\/g, "");
const ALL = `${UPPER}${LOWER}${DIGITS}${SPECIAL}`;

function pick(alphabet: string) {
  return alphabet[randomInt(0, alphabet.length)]!;
}

/**
 * Cryptographically random password that always satisfies the app password policy.
 */
export function generateSecurePassword(
  length = Math.max(12, PASSWORD_MIN_LENGTH),
) {
  const size = Math.max(length, PASSWORD_MIN_LENGTH, 8);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
    const bytes = randomBytes(size - required.length);
    const rest: string[] = [];
    for (let i = 0; i < bytes.length; i += 1) {
      rest.push(ALL[bytes[i]! % ALL.length]!);
    }
    const chars = [...required, ...rest];
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = chars[i]!;
      chars[i] = chars[j]!;
      chars[j] = tmp;
    }
    const password = chars.join("");
    if (isStrongPassword(password)) return password;
  }

  // Extremely unlikely fallback — still policy-compliant by construction.
  return `${pick(UPPER)}${pick(LOWER)}${pick(DIGITS)}${pick(SPECIAL)}${"Aa1!".repeat(Math.ceil(size / 4))}`.slice(
    0,
    size,
  );
}
