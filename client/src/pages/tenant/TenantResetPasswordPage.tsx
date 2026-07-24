import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { BackButton } from "../../components/BackButton";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { api } from "../../lib/api";
import { strongPasswordSchema } from "../../lib/password-policy";

const schema = z
  .object({
    newPassword: strongPasswordSchema(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function TenantResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const newPassword = watch("newPassword");
  const confirmPassword = watch("confirmPassword");

  async function onSubmit(values: FormValues) {
    if (!token) {
      setError("root", {
        message:
          "This reset link is missing or incomplete. Please request a new one.",
      });
      return;
    }
    try {
      await api.post("/auth/tenant/reset-password", {
        token,
        newPassword: values.newPassword,
      });
      navigate("/tenant/login", { replace: true });
    } catch (error) {
      setError("root", {
        message: axios.isAxiosError(error)
          ? (error.response?.data?.message as string) || "Reset failed"
          : "Reset failed",
      });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--night)] px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8">
        <BackButton fallbackTo="/tenant/login" className="mb-3" />
        <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
          KitchenOS
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
          Set a new password
        </h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1 block text-sm text-white">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              {...register("newPassword")}
            />
            <PasswordRequirements
              password={newPassword ?? ""}
              confirmPassword={confirmPassword}
              showConfirmMatch
            />
            {errors.newPassword && (
              <p className="mt-1 text-sm text-[var(--danger)]">
                {errors.newPassword.message}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-white">Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-[var(--danger)]">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
          {errors.root && (
            <p className="text-sm text-[var(--danger)]">{errors.root.message}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--gold)] px-4 py-3 font-bold text-[var(--night)] disabled:opacity-60"
          >
            {isSubmitting ? "Saving…" : "Update password"}
          </button>
        </form>
        <Link to="/tenant/login" className="mt-4 inline-block text-sm text-[var(--muted)]">
          Back to login
        </Link>
      </div>
    </main>
  );
}
