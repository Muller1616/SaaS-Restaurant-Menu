import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { PasswordRequirements } from "../../components/PasswordRequirements";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api } from "../../lib/api";
import { strongPasswordSchema } from "../../lib/password-policy";
import { tenantPortalPath } from "../../lib/tenant-paths";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPasswordSchema(),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function TenantChangePasswordPage() {
  const { markPasswordChanged, tenant } = useTenantAuth();
  const portal = (...segments: string[]) =>
    tenantPortalPath(tenant?.slug ?? "", ...segments);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPassword = watch("newPassword");
  const confirmPassword = watch("confirmPassword");

  async function onSubmit(values: FormValues) {
    try {
      await api.post("/auth/tenant/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      markPasswordChanged();
      navigate(portal(), { replace: true });
    } catch (error) {
      setError("root", {
        message: axios.isAxiosError(error)
          ? (error.response?.data?.message as string) || "Update failed"
          : "Update failed",
      });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--night)] px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8">
        <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
          Security first
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
          Change your password
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {tenant?.mustChangePassword
            ? "For your security, please replace the temporary password before continuing."
            : "Update your KitchenOS password."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1 block text-sm text-white">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="mt-1 text-sm text-[var(--danger)]">
                {errors.currentPassword.message}
              </p>
            )}
          </div>
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
            {isSubmitting ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </main>
  );
}
