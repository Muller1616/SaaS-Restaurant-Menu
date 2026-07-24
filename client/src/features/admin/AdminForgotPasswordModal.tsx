import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { api, type ApiSuccess } from "../../lib/api";
import { strongPasswordSchema } from "../../lib/password-policy";

type Step = "email" | "otp" | "password" | "done";

const emailSchema = z.object({
  email: z.email("Enter a valid email"),
});

const otpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

const passwordSchema = z
  .object({
    newPassword: strongPasswordSchema(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type EmailForm = z.infer<typeof emailSchema>;
type OtpForm = z.infer<typeof otpSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
  initialEmail?: string;
};

function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function AdminForgotPasswordModal({
  open,
  onClose,
  onComplete,
  initialEmail = "",
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: initialEmail },
  });
  const otpForm = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: "" },
  });
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const newPasswordValue = passwordForm.watch("newPassword");
  const confirmPasswordValue = passwordForm.watch("confirmPassword");

  useEffect(() => {
    if (!open) return;
    setStep("email");
    setResetToken(null);
    setOtpExpiresAt(null);
    setSecondsLeft(0);
    setNotice(null);
    setError(null);
    emailForm.reset({ email: initialEmail });
    otpForm.reset({ otp: "" });
    passwordForm.reset({ newPassword: "", confirmPassword: "" });
    // Intentionally reset only when the modal opens / initial email changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open || !otpExpiresAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [open, otpExpiresAt]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>("input,button")
      ?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, step]);

  const sendOtp = useMutation({
    mutationFn: async (values: EmailForm) => {
      const { data } = await api.post<
        ApiSuccess<{ message: string; expiresInSeconds: number }>
      >("/auth/admin/forgot-password", values);
      return { ...data.data, email: values.email };
    },
    onSuccess: (data) => {
      setEmail(data.email);
      setOtpExpiresAt(Date.now() + data.expiresInSeconds * 1000);
      setNotice(data.message);
      setError(null);
      setStep("otp");
      otpForm.reset({ otp: "" });
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not send code"
          : "Could not send code",
      );
    },
  });

  const verifyOtp = useMutation({
    mutationFn: async (values: OtpForm) => {
      const { data } = await api.post<
        ApiSuccess<{
          resetToken: string;
          expiresInSeconds: number;
          message: string;
        }>
      >("/auth/admin/verify-otp", { email, otp: values.otp });
      return data.data;
    },
    onSuccess: (data) => {
      setResetToken(data.resetToken);
      setNotice(data.message);
      setError(null);
      setStep("password");
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Verification failed"
          : "Verification failed",
      );
    },
  });

  const resetPassword = useMutation({
    mutationFn: async (values: PasswordForm) => {
      if (!resetToken) throw new Error("Missing reset session");
      const { data } = await api.post<ApiSuccess<{ message: string }>>(
        "/auth/admin/reset-password",
        {
          resetToken,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        },
      );
      return data.data;
    },
    onSuccess: (data) => {
      setNotice(data.message);
      setError(null);
      setStep("done");
      window.setTimeout(() => {
        (onComplete ?? onClose)();
      }, 1800);
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Could not update password"
          : "Could not update password",
      );
    },
  });

  if (!open) return null;

  const busy =
    sendOtp.isPending || verifyOtp.isPending || resetPassword.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl"
      >
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Account recovery
        </p>
        <h2
          id={titleId}
          className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white"
        >
          {step === "email" && "Forgot password"}
          {step === "otp" && "Enter verification code"}
          {step === "password" && "Choose a new password"}
          {step === "done" && "Password updated"}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {step === "email" &&
            "We’ll email a one-time code if this admin account exists."}
          {step === "otp" &&
            `Enter the 6-digit code sent to ${email}. It expires in 3 minutes.`}
          {step === "password" &&
            "Create a new password for your admin account."}
          {step === "done" &&
            "You can sign in with your new password."}
        </p>

        {notice && step !== "done" && (
          <p className="mt-4 rounded-xl bg-[rgba(61,186,138,0.12)] px-3 py-2 text-sm text-[var(--success)]">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-[rgba(255,107,107,0.12)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        {step === "email" && (
          <form
            className="mt-5 space-y-4"
            onSubmit={emailForm.handleSubmit((values) => sendOtp.mutate(values))}
          >
            <div>
              <label className="mb-1 block text-sm text-white" htmlFor="admin-reset-email">
                Registered email
              </label>
              <input
                id="admin-reset-email"
                type="email"
                autoComplete="username"
                className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
                {...emailForm.register("email")}
              />
              {emailForm.formState.errors.email && (
                <p className="mt-1 text-sm text-[var(--danger)]">
                  {emailForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-[var(--gold)] px-4 py-3 text-sm font-bold text-[var(--night)] disabled:opacity-60"
            >
              {sendOtp.isPending ? "Sending…" : "Send OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form
            className="mt-5 space-y-4"
            onSubmit={otpForm.handleSubmit((values) => verifyOtp.mutate(values))}
          >
            <div>
              <label className="mb-1 block text-sm text-white" htmlFor="admin-reset-otp">
                One-time password
              </label>
              <input
                id="admin-reset-otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-center text-2xl tracking-[0.4em] text-white outline-none focus:border-[var(--gold)]"
                {...otpForm.register("otp")}
              />
              {otpForm.formState.errors.otp && (
                <p className="mt-1 text-sm text-[var(--danger)]">
                  {otpForm.formState.errors.otp.message}
                </p>
              )}
            </div>
            <p className="text-center text-sm text-[var(--muted)]">
              OTP expires in:{" "}
              <span
                className={
                  secondsLeft <= 30
                    ? "font-semibold text-[var(--danger)]"
                    : "font-semibold text-[var(--gold-soft)]"
                }
              >
                {formatCountdown(secondsLeft)}
              </span>
            </p>
            <button
              type="submit"
              disabled={busy || secondsLeft <= 0}
              className="w-full rounded-full bg-[var(--gold)] px-4 py-3 text-sm font-bold text-[var(--night)] disabled:opacity-60"
            >
              {verifyOtp.isPending ? "Verifying…" : "Verify OTP"}
            </button>
            <button
              type="button"
              disabled={busy || secondsLeft > 0}
              onClick={() => sendOtp.mutate({ email })}
              className="w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:border-[var(--gold)]"
            >
              {sendOtp.isPending
                ? "Resending…"
                : secondsLeft > 0
                  ? `Resend available in ${formatCountdown(secondsLeft)}`
                  : "Resend OTP"}
            </button>
          </form>
        )}

        {step === "password" && (
          <form
            className="mt-5 space-y-4"
            onSubmit={passwordForm.handleSubmit((values) =>
              resetPassword.mutate(values),
            )}
          >
            <div>
              <label className="mb-1 block text-sm text-white" htmlFor="admin-new-password">
                New password
              </label>
              <input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
                {...passwordForm.register("newPassword")}
              />
              <PasswordRequirements
                password={newPasswordValue ?? ""}
                confirmPassword={confirmPasswordValue}
                showConfirmMatch
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="mt-1 text-sm text-[var(--danger)]">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div>
              <label
                className="mb-1 block text-sm text-white"
                htmlFor="admin-confirm-password"
              >
                Confirm new password
              </label>
              <input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="mt-1 text-sm text-[var(--danger)]">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-[var(--gold)] px-4 py-3 text-sm font-bold text-[var(--night)] disabled:opacity-60"
            >
              {resetPassword.isPending ? "Updating…" : "Update password"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="mt-5 space-y-4">
            <p className="rounded-xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
              {notice || "Password updated successfully."}
            </p>
            <p className="text-sm text-[var(--muted)]">
              Returning to sign in…
            </p>
          </div>
        )}

        {step !== "done" && (
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="mt-4 w-full rounded-full border border-white/15 px-4 py-2.5 text-sm text-[var(--muted)] hover:border-[var(--gold)] hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
