import { useQuery } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { PublicNav } from "../components/PublicNav";
import { api, type ApiSuccess } from "../lib/api";
import { formatEtb, planLimitsLabel, type Plan } from "../lib/plans";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2000&q=80";

async function fetchPlans() {
  const { data } = await api.get<ApiSuccess<Plan[]>>("/plans");
  return data.data;
}

function useRevealOnView<T extends HTMLElement>(
  delayMs = 0,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.classList.add("is-visible");
      return;
    }

    let timeoutId: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          timeoutId = window.setTimeout(() => {
            node.classList.add("is-visible");
          }, delayMs);
          observer.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [delayMs]);

  return ref;
}

function Reveal({
  children,
  className = "",
  delayMs = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: "div" | "section" | "article";
}) {
  const ref = useRevealOnView<HTMLElement>(delayMs);
  return (
    <Tag ref={ref as RefObject<HTMLDivElement>} className={`reveal-up ${className}`}>
      {children}
    </Tag>
  );
}

export function HomePage() {
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: fetchPlans,
    staleTime: 10 * 60_000,
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--night)] text-[var(--mist)]">
      <section className="relative min-h-[100svh] overflow-hidden">
        <div
          className="hero-ken-burns absolute inset-[-4%] bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(120deg, rgba(7,10,9,0.88), rgba(7,10,9,0.55) 45%, rgba(7,10,9,0.82)), url('${HERO_IMAGE}')`,
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, rgba(212,165,116,0.22), transparent 35%), radial-gradient(circle at 80% 10%, rgba(255,139,92,0.12), transparent 30%)",
            animation: "soft-pulse 7s ease-in-out infinite",
          }}
        />

        <PublicNav />

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-6 pb-20 pt-36">
          <p className="animate-rise mb-4 text-xs font-semibold tracking-[0.4em] text-[var(--gold)] uppercase">
            KitchenOS
          </p>
          <h1 className="animate-rise-delay max-w-4xl font-[family-name:var(--font-display)] text-5xl leading-[0.95] text-white sm:text-7xl">
            Your restaurant menu,{" "}
            <span className="gold-gradient-text">beautifully scannable</span>
          </h1>
          <p className="animate-rise-delay-2 mt-6 max-w-xl text-lg text-[var(--muted)]">
            Launch a guest-ready QR menu in minutes. Manage branches, update
            dishes instantly, and give every table a premium first impression.
          </p>
          <div className="animate-rise-delay-2 mt-10 flex flex-wrap gap-4">
            <Link
              to="/register"
              className="cta-glow rounded-full bg-[var(--gold)] px-7 py-3.5 text-sm font-bold tracking-wide text-[var(--night)] uppercase transition hover:bg-[var(--gold-soft)]"
            >
              Create your menu
            </Link>
            <a
              href="#plans"
              className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white/90 transition hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
            >
              View plans
            </a>
          </div>
        </div>
      </section>

      <section id="plans" className="relative px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mb-12 max-w-2xl">
            <p className="text-xs tracking-[0.3em] text-[var(--gold)] uppercase">
              Pricing
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">
              Plans built for growing kitchens
            </h2>
            <p className="mt-4 text-[var(--muted)]">
              Start free. Upgrade when you need more branches, items, and polish.
            </p>
          </Reveal>

          {plans.isLoading && (
            <p className="text-[var(--muted)]">Loading plans…</p>
          )}
          {plans.isError && (
            <p className="text-[var(--danger)]">Could not load plans.</p>
          )}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.data?.map((plan, index) => {
              const featured = plan.slug === "popular";
              return (
                <Reveal
                  key={plan.id}
                  as="article"
                  delayMs={index * 90}
                  className={[
                    "relative overflow-hidden rounded-3xl border p-6 transition duration-300 hover:-translate-y-1",
                    featured
                      ? "border-[var(--gold)] bg-[linear-gradient(160deg,#1a2420,#121916_55%,#1d1810)] shadow-[0_20px_60px_rgba(212,165,116,0.12)]"
                      : "border-[var(--line)] bg-[var(--panel)]",
                  ].join(" ")}
                >
                  {featured && (
                    <span className="absolute top-4 right-4 rounded-full bg-[var(--gold)] px-3 py-1 text-[10px] font-bold tracking-wider text-[var(--night)] uppercase">
                      Most chosen
                    </span>
                  )}
                  <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                    {plan.name}
                  </h3>
                  <p className="mt-3 text-3xl font-bold text-[var(--gold-soft)]">
                    {Number(plan.priceMonthly) === 0
                      ? "Free"
                      : `${formatEtb(plan.priceMonthly)}/mo`}
                  </p>
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    {planLimitsLabel(plan)}
                  </p>
                  <ul className="mt-6 space-y-2 text-sm text-[var(--mist)]/85">
                    <li>Public QR menu page</li>
                    <li>
                      {plan.features.customQr ? "Custom QR styling" : "Standard QR"}
                    </li>
                    <li>Analytics: {plan.features.analytics ?? "none"}</li>
                    <li>Support: {plan.features.support ?? "email"}</li>
                  </ul>
                  <Link
                    to={`/register?plan=${plan.slug}`}
                    className={[
                      "mt-8 inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-sm font-semibold transition",
                      featured
                        ? "bg-[var(--gold)] text-[var(--night)] hover:bg-[var(--gold-soft)]"
                        : "border border-white/15 hover:border-[var(--gold)] hover:text-[var(--gold-soft)]",
                    ].join(" ")}
                  >
                    Choose {plan.name}
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--line)] px-6 py-20">
        <Reveal className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs tracking-[0.3em] text-[var(--gold)] uppercase">
              Guest experience
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-white sm:text-5xl">
              Designed to stop the scroll and start the order
            </h2>
            <p className="mt-4 max-w-xl text-[var(--muted)]">
              Mobile-first menus, crisp pricing, and one-tap call-to-order — so
              your brand looks intentional the moment a guest scans.
            </p>
          </div>
          <div className="rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(212,165,116,0.12),rgba(18,26,23,0.9))] p-8">
            <p className="font-[family-name:var(--font-display)] text-3xl text-white">
              Scan. Browse. Decide.
            </p>
            <p className="mt-3 text-[var(--muted)]">
              No app download. No login. Just a fast, elegant public menu for
              every branch.
            </p>
            <Link
              to="/register"
              className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
            >
              Get started tonight
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-[var(--line)] px-6 py-8 text-sm text-[var(--muted)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} KitchenOS</span>
          <Link to="/tenant/login" className="hover:text-[var(--gold-soft)]">
            Restaurant login
          </Link>
        </div>
      </footer>
    </div>
  );
}
