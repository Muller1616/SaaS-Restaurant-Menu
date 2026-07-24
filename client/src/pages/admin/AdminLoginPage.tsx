import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useState } from "react";
import { useAdminAuth } from "../../features/admin/AdminAuthContext";
import { AdminForgotPasswordModal } from "../../features/admin/AdminForgotPasswordModal";
import { safeAdminReturnPath } from "../../lib/admin-session";
import { SESSION_IDLE_MESSAGE } from "../../lib/session-timeout-config";
import { getUserFacingError } from "../../lib/user-facing-error";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function AdminLoginPage() {
  const { login, isAuthenticated, status } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [forgotOpen, setForgotOpen] = useState(false);
  const idleExpired = searchParams.get("reason") === "idle";
  const sessionExpired = searchParams.get("reason") === "session";
  const from = safeAdminReturnPath(
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname,
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true,
    },
  });

  const loginEmail = watch("email");

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--night)] text-[var(--muted)]">
        <p className="text-sm">Checking session…</p>
      </main>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(values: LoginForm) {
    try {
      await login(values.email, values.password, values.rememberMe ?? false);
      navigate(from, { replace: true });
    } catch (error) {
      setError("root", {
        message: getUserFacingError(error, "Login failed"),
      });
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--night)] px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(212,165,116,0.22), transparent 35%), radial-gradient(circle at 80% 80%, rgba(255,139,92,0.14), transparent 30%), linear-gradient(160deg, #0a100e 0%, #121a17 45%, #070a09 100%)",
          opacity: 0.9,
        }}
      />
      <div className="relative w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[rgba(14,20,18,0.88)] p-8 shadow-2xl backdrop-blur-xl">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-[var(--gold)] uppercase">
          KitchenOS
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
          Admin sign in
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Approve tenants, payments, and subscriptions.
        </p>

        {idleExpired && (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-[var(--gold)]/25 bg-[rgba(212,165,116,0.12)] px-4 py-3 text-sm text-[var(--gold-soft)]"
          >
            {SESSION_IDLE_MESSAGE}
          </div>
        )}
        {sessionExpired && !idleExpired && (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-[var(--gold)]/25 bg-[rgba(212,165,116,0.12)] px-4 py-3 text-sm text-[var(--gold-soft)]"
          >
            Your admin session is no longer valid. Please sign in again.
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="mb-1 block text-sm font-medium text-white" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-[var(--danger)]">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-[var(--danger)]">
                {errors.password.message}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" className="rounded" {...register("rememberMe")} />
            Remember me
          </label>

          {errors.root && (
            <p className="rounded-lg bg-[rgba(255,107,107,0.12)] px-3 py-2 text-sm text-[var(--danger)]">
              {errors.root.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-[var(--gold)] px-4 py-3 font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)] disabled:opacity-60"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-sm font-medium text-[var(--gold-soft)] underline-offset-2 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>

      <AdminForgotPasswordModal
        open={forgotOpen}
        initialEmail={loginEmail}
        onClose={() => setForgotOpen(false)}
        onComplete={() => {
          setForgotOpen(false);
          navigate("/admin/login", { replace: true });
        }}
      />
    </main>
  );
}
