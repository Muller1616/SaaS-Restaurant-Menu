import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { BackButton } from "../../components/BackButton";
import { api, type ApiSuccess } from "../../lib/api";

const schema = z
  .object({
    temporaryPassword: z.string().min(1, "Temporary password is required"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((values) => values.temporaryPassword !== values.newPassword, {
    message: "Choose a password different from the temporary one",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

type PreviewOk = {
  valid: true;
  businessName: string;
  email: string;
  expiresAt: string;
};

type PreviewFail = {
  valid: false;
  reason: string;
  message: string;
};

type Preview = PreviewOk | PreviewFail;

export function TenantActivatePage() {
  const { tenantSlug = "", activationToken = "", slug = "", token = "" } =
    useParams();
  const slugValue = tenantSlug || slug;
  const tokenValue = activationToken || token;
  const navigate = useNavigate();
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const preview = useQuery({
    queryKey: ["tenant", "activate", slugValue, tokenValue],
    enabled: Boolean(slugValue && tokenValue),
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<Preview>>(
        "/auth/tenant/activate",
        { params: { slug: slugValue, token: tokenValue } },
      );
      return data.data;
    },
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    try {
      await api.post("/auth/tenant/activate", {
        slug: slugValue,
        token: tokenValue,
        temporaryPassword: values.temporaryPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      navigate("/tenant/login", { replace: true });
    } catch (error) {
      setError("root", {
        message: axios.isAxiosError(error)
          ? (error.response?.data?.message as string) || "Activation failed"
          : "Activation failed",
      });
    }
  }

  async function onResend(e: FormEvent) {
    e.preventDefault();
    setResending(true);
    setResendMessage(null);
    try {
      const { data } = await api.post<ApiSuccess<{ message: string }>>(
        "/auth/tenant/resend-activation",
        { email: resendEmail },
      );
      setResendMessage(data.data.message);
    } catch (error) {
      setResendMessage(
        axios.isAxiosError(error)
          ? (error.response?.data?.message as string) ||
              "Could not send activation email"
          : "Could not send activation email",
      );
    } finally {
      setResending(false);
    }
  }

  const invalid =
    !slugValue ||
    !tokenValue ||
    preview.isError ||
    (preview.data && preview.data.valid === false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--night)] px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8">
        <BackButton fallbackTo="/tenant/login" className="mb-3" />
        <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
          KitchenOS
        </p>

        {preview.isLoading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Checking your activation link…
          </p>
        ) : invalid ? (
          <>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              Link unavailable
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {preview.data && preview.data.valid === false
                ? preview.data.message
                : "This activation link is invalid or incomplete. Request a new activation email below."}
            </p>
            <form className="mt-6 space-y-4" onSubmit={onResend}>
              <div>
                <label className="mb-1 block text-sm text-white">
                  Registered email
                </label>
                <input
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
                />
              </div>
              {resendMessage && (
                <p className="text-sm text-[var(--gold-soft)]">{resendMessage}</p>
              )}
              <button
                type="submit"
                disabled={resending}
                className="w-full rounded-full bg-[var(--gold)] px-4 py-3 font-bold text-[var(--night)] disabled:opacity-60"
              >
                {resending ? "Sending…" : "Request new activation email"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">
              Set your password
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Activate{" "}
              <span className="text-white">
                {(preview.data as PreviewOk).businessName}
              </span>{" "}
              (
              {(preview.data as PreviewOk).email}
              ). Enter the temporary password from your approval email, then
              choose a permanent password.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <div>
                <label className="mb-1 block text-sm text-white">
                  Temporary password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
                  {...register("temporaryPassword")}
                />
                {errors.temporaryPassword && (
                  <p className="mt-1 text-sm text-[var(--danger)]">
                    {errors.temporaryPassword.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm text-white">
                  New password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
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
                <label className="mb-1 block text-sm text-white">
                  Confirm new password
                </label>
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
                <p className="text-sm text-[var(--danger)]">
                  {errors.root.message}
                </p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-[var(--gold)] px-4 py-3 font-bold text-[var(--night)] disabled:opacity-60"
              >
                {isSubmitting ? "Activating…" : "Activate account"}
              </button>
            </form>
          </>
        )}

        <Link
          to="/tenant/login"
          className="mt-4 inline-block text-sm text-[var(--muted)]"
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
