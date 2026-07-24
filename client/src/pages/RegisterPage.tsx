import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { PublicNav } from "../components/PublicNav";
import { api, type ApiSuccess } from "../lib/api";
import { validateDeviceImage } from "../lib/device-image";
import { formatEtb, type Plan } from "../lib/plans";
import { BackButton } from "../components/BackButton";
import { getUserFacingError } from "../lib/user-facing-error";

const registrationSchema = z
  .object({
    fullName: z.string().min(2, "Full name is required"),
    email: z.email("Enter a valid email"),
    phone: z.string().min(7, "Phone is required"),
    businessName: z.string().min(2, "Business name is required"),
    businessLocation: z.string().min(2, "Location is required"),
    businessDescription: z.string().optional(),
    planSlug: z.enum(["free", "basic", "popular", "premium"]),
    paymentMethod: z.enum(["BANK_TRANSFER", "TELEBIRR", "CASH"]).optional(),
    referenceNumber: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.planSlug !== "free") {
      if (!values.paymentMethod) {
        ctx.addIssue({
          code: "custom",
          path: ["paymentMethod"],
          message: "Payment method is required",
        });
      }
      if (!values.referenceNumber?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["referenceNumber"],
          message: "Reference number is required",
        });
      }
    }
  });

type RegistrationForm = z.infer<typeof registrationSchema>;

type RegistrationSuccess = {
  businessName: string;
  email: string;
  plan: { name: string };
  emailDelivered: boolean;
  message: string;
};

async function fetchPlans() {
  const { data } = await api.get<ApiSuccess<Plan[]>>("/plans");
  return data.data;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialPlan = (params.get("plan") as RegistrationForm["planSlug"]) || "free";
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null);

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: fetchPlans,
    staleTime: 10 * 60_000,
  });

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      planSlug: ["free", "basic", "popular", "premium"].includes(initialPlan)
        ? initialPlan
        : "free",
      paymentMethod: "BANK_TRANSFER",
    },
  });

  const selectedSlug = watch("planSlug");
  const selectedPlan = useMemo(
    () => plans.data?.find((plan) => plan.slug === selectedSlug),
    [plans.data, selectedSlug],
  );
  const isPaid = selectedPlan ? Number(selectedPlan.priceMonthly) > 0 : false;

  const mutation = useMutation({
    mutationFn: async (values: RegistrationForm) => {
      if (isPaid && !screenshot) {
        throw new Error("Payment screenshot is required for paid plans");
      }
      if (screenshot) {
        const invalid = validateDeviceImage(screenshot);
        if (invalid) throw new Error(invalid);
      }

      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        if (value != null && value !== "") body.append(key, String(value));
      });
      if (screenshot) body.append("paymentScreenshot", screenshot);

      const { data } = await api.post<ApiSuccess<RegistrationSuccess>>(
        "/registrations",
        body,
      );
      return data.data;
    },
    onSuccess: (data) => {
      setSuccess(data);
    },
  });

  async function onSubmit(values: RegistrationForm) {
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      setError("root", {
        message: getUserFacingError(error, "Registration failed"),
      });
    }
  }

  function dismissSuccess() {
    setSuccess(null);
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[var(--night)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-70"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, rgba(212,165,116,0.18), transparent 40%), radial-gradient(circle at 85% 0%, rgba(255,139,92,0.12), transparent 35%)",
        }}
      />
      <PublicNav />

      <main className="relative mx-auto grid max-w-6xl gap-10 px-6 pt-32 pb-20 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="animate-rise lg:sticky lg:top-28 lg:self-start">
          <BackButton fallbackTo="/" className="mb-3" />
          <p className="text-xs tracking-[0.35em] text-[var(--gold)] uppercase">
            Join KitchenOS
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-none text-white">
            Register your restaurant
          </h1>
          <p className="mt-4 text-[var(--muted)]">
            Choose a plan, share your business details, and we’ll activate your
            account after a quick review. You’ll get a confirmation email right
            away.
          </p>
          {selectedPlan && (
            <div className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6">
              <p className="text-sm text-[var(--muted)]">Selected plan</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">
                {selectedPlan.name}
              </p>
              <p className="mt-2 text-[var(--gold-soft)]">
                {Number(selectedPlan.priceMonthly) === 0
                  ? "Free forever starter"
                  : `${formatEtb(selectedPlan.priceMonthly)} / month`}
              </p>
            </div>
          )}
        </aside>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="animate-rise-delay space-y-5 rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-8"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.fullName?.message}>
              <input className="field" {...register("fullName")} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input className="field" type="email" {...register("email")} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <input className="field" {...register("phone")} />
            </Field>
            <Field label="Business name" error={errors.businessName?.message}>
              <input className="field" {...register("businessName")} />
            </Field>
          </div>

          <Field label="Business location" error={errors.businessLocation?.message}>
            <input className="field" {...register("businessLocation")} />
          </Field>

          <Field label="Business description (optional)">
            <textarea
              className="field min-h-24 resize-y"
              {...register("businessDescription")}
            />
          </Field>

          <fieldset>
            <legend className="mb-3 text-sm font-medium text-white">
              Select plan
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.data?.map((plan) => (
                <label
                  key={plan.id}
                  className={[
                    "cursor-pointer rounded-2xl border px-4 py-3 transition",
                    selectedSlug === plan.slug
                      ? "border-[var(--gold)] bg-[rgba(212,165,116,0.08)]"
                      : "border-[var(--line)] hover:border-white/30",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    value={plan.slug}
                    className="sr-only"
                    {...register("planSlug")}
                  />
                  <span className="block font-semibold text-white">{plan.name}</span>
                  <span className="text-sm text-[var(--muted)]">
                    {Number(plan.priceMonthly) === 0
                      ? "Free"
                      : `${formatEtb(plan.priceMonthly)}/mo`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {isPaid && (
            <div className="space-y-4 rounded-2xl border border-[var(--gold)]/30 bg-black/20 p-4">
              <p className="text-sm text-[var(--gold-soft)]">
                Paid plans require payment proof before admin approval.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Payment method" error={errors.paymentMethod?.message}>
                  <select className="field" {...register("paymentMethod")}>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="TELEBIRR">Telebirr</option>
                    <option value="CASH">Cash</option>
                  </select>
                </Field>
                <Field
                  label="Reference number"
                  error={errors.referenceNumber?.message}
                >
                  <input className="field" {...register("referenceNumber")} />
                </Field>
              </div>
              <Field label="Payment screenshot from device (max 2MB)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--gold)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--night)]"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file) {
                      const invalid = validateDeviceImage(file);
                      if (invalid) {
                        setScreenshot(null);
                        event.target.value = "";
                        setError("root", { message: invalid });
                        return;
                      }
                    }
                    setScreenshot(file);
                  }}
                />
              </Field>
            </div>
          )}

          {errors.root && (
            <p className="rounded-xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
              {errors.root.message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="w-full rounded-full bg-[var(--gold)] px-6 py-3.5 text-sm font-bold tracking-wide text-[var(--night)] uppercase transition hover:bg-[var(--gold-soft)] disabled:opacity-60"
          >
            {isSubmitting || mutation.isPending
              ? "Submitting…"
              : "Submit registration"}
          </button>
        </form>
      </main>

      {success && (
        <RegistrationSuccessDialog
          businessName={success.businessName}
          email={success.email}
          planName={success.plan.name}
          onClose={dismissSuccess}
        />
      )}

      <style>{`
        .field {
          width: 100%;
          border-radius: 0.9rem;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.25);
          color: white;
          padding: 0.7rem 0.9rem;
          outline: none;
        }
        .field:focus {
          border-color: var(--gold);
          box-shadow: 0 0 0 3px rgba(212,165,116,0.15);
        }
      `}</style>
    </div>
  );
}

function RegistrationSuccessDialog({
  businessName,
  email,
  planName,
  onClose,
}: {
  businessName: string;
  email: string;
  planName: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>("button:not([disabled])")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-md rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-2xl"
      >
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Submitted
        </p>
        <h2
          id={titleId}
          className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white"
        >
          Check your email
        </h2>
        <p id={descId} className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          Your <strong className="text-white">{planName}</strong> application for{" "}
          <strong className="text-white">{businessName}</strong> was submitted
          successfully. A confirmation was sent to{" "}
          <strong className="text-white">{email}</strong>. After approval, you’ll
          receive another email with your activation link and temporary password.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-11 w-full rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
        >
          Continue to homepage
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-white/90">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-[var(--danger)]">{error}</span>}
    </label>
  );
}
