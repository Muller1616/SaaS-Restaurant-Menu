import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import {
  BackButton,
  isProtectedTenantHistoryKey,
} from "../../components/BackButton";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { SESSION_IDLE_MESSAGE } from "../../lib/session-timeout-config";
import { safeTenantReturnPath } from "../../lib/tenant-session";
import { tenantPortalPath } from "../../lib/tenant-paths";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function TenantLoginPage() {
  const { login, isAuthenticated, tenant, status } = useTenantAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const idleExpired = searchParams.get("reason") === "idle";
  const sessionExpired = searchParams.get("reason") === "session";
  const fromState =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
    null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
  });

  function homeFor(sessionSlug: string | undefined) {
    return safeTenantReturnPath(fromState, sessionSlug);
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--night)] text-[var(--muted)]">
        <p className="text-sm">Checking session…</p>
      </main>
    );
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={
          tenant?.mustChangePassword
            ? tenantPortalPath(tenant.slug, "change-password")
            : homeFor(tenant?.slug)
        }
        replace
      />
    );
  }

  async function onSubmit(values: LoginForm) {
    try {
      const session = await login(
        values.email,
        values.password,
        values.rememberMe ?? false,
      );
      navigate(
        session.mustChangePassword
          ? tenantPortalPath(session.slug, "change-password")
          : homeFor(session.slug),
        { replace: true },
      );
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message as string | undefined) || "Login failed"
        : "Login failed";
      setError("root", { message });
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--night)] px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 18% 20%, rgba(212,165,116,0.22), transparent 34%), radial-gradient(circle at 85% 75%, rgba(255,139,92,0.1), transparent 40%), linear-gradient(120deg, #070a09 0%, #121a17 55%, #0a100e 100%)",
        }}
      />

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[rgba(14,20,18,0.88)] shadow-2xl backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-end bg-[linear-gradient(160deg,rgba(212,165,116,0.16),transparent_45%)] p-10 lg:flex">
          <p className="text-[11px] tracking-[0.35em] text-[var(--gold)] uppercase">
            KitchenOS
          </p>
          <h1 className="mt-3 max-w-md font-[family-name:var(--font-display)] text-5xl leading-none text-white">
            Run your menu from one elegant dashboard
          </h1>
          <p className="mt-4 max-w-sm text-[var(--muted)]">
            Switch branches, publish dishes, and keep every QR code guest-ready.
          </p>
        </section>

        <section className="p-8 sm:p-10">
          <BackButton
            fallbackTo="/"
            label="Back to home"
            className="mb-3"
            skipHistoryWhenPreviousMatches={isProtectedTenantHistoryKey}
          />
          <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase lg:hidden">
            KitchenOS
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-white">
            Restaurant sign in
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            After approval, activate your account from the email link, then sign
            in with your new password.
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
              Your session is no longer valid. Please sign in again.
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

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 text-[var(--muted)]">
                <input type="checkbox" {...register("rememberMe")} />
                Remember me
              </label>
              <Link
                to="/tenant/forgot-password"
                className="text-[var(--gold-soft)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {errors.root && (
              <p className="rounded-xl bg-[rgba(255,107,107,0.12)] px-3 py-2 text-sm text-[var(--danger)]">
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
          </form>

          <p className="mt-6 text-sm text-[var(--muted)]">
            New restaurant?{" "}
            <Link to="/register" className="text-[var(--gold-soft)] hover:underline">
              Create an account
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
