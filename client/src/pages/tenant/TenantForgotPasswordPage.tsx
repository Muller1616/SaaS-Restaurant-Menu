import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { api, type ApiSuccess } from "../../lib/api";
import { BackButton } from "../../components/BackButton";

const schema = z.object({
  email: z.email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

export function TenantForgotPasswordPage() {
  const [done, setDone] = useState<string | null>(null);

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
      const { data } = await api.post<ApiSuccess<{ message: string }>>(
        "/auth/tenant/forgot-password",
        values,
      );
      setDone(data.data.message);
    } catch (error) {
      setError("root", {
        message: axios.isAxiosError(error)
          ? (error.response?.data?.message as string) || "Request failed"
          : "Request failed",
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
          Forgot password
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We’ll email a reset link if the account exists.
        </p>

        {done ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
              {done}
            </p>
            <Link to="/tenant/login" className="text-sm text-white underline">
              Back to login
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="mb-1 block text-sm text-white" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
                {...register("email")}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-[var(--danger)]">{errors.email.message}</p>
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
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
