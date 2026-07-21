import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { api } from "../../lib/api";
import { BackButton } from "../../components/BackButton";

const schema = z
  .object({
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your password"),
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
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    if (!token) {
      setError("root", { message: "Reset token is missing" });
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
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              {...register("newPassword")}
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
