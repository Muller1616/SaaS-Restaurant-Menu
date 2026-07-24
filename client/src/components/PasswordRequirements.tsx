import {
  getPasswordRuleStatus,
  PASSWORD_MIN_LENGTH,
} from "../lib/password-policy";

type Props = {
  password: string;
  confirmPassword?: string;
  showConfirmMatch?: boolean;
  minLength?: number;
  className?: string;
};

/**
 * Live checklist for password create / change / reset fields.
 */
export function PasswordRequirements({
  password,
  confirmPassword,
  showConfirmMatch = false,
  minLength = PASSWORD_MIN_LENGTH,
  className = "",
}: Props) {
  const rules = getPasswordRuleStatus(password, minLength);
  const confirmTouched =
    showConfirmMatch && (confirmPassword?.length ?? 0) > 0;
  const passwordsMatch =
    Boolean(confirmPassword) && password === confirmPassword;

  return (
    <ul
      className={`mt-2 space-y-1 text-xs ${className}`}
      aria-live="polite"
    >
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={
            rule.met ? "text-[var(--success)]" : "text-[var(--muted)]"
          }
        >
          <span className="inline-block w-4" aria-hidden>
            {rule.met ? "✓" : "○"}
          </span>
          {rule.label}
        </li>
      ))}
      {showConfirmMatch && (
        <li
          className={
            confirmTouched && passwordsMatch
              ? "text-[var(--success)]"
              : "text-[var(--muted)]"
          }
        >
          <span className="inline-block w-4" aria-hidden>
            {confirmTouched && passwordsMatch ? "✓" : "○"}
          </span>
          Passwords match
        </li>
      )}
    </ul>
  );
}
