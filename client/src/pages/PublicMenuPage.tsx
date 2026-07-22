import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { FoodDescription } from "../components/FoodDescription";
import { CallToOrderSheet } from "../features/public-menu/CallToOrderSheet";
import { ShareMenuSheet } from "../features/public-menu/ShareMenuSheet";
import { api, type ApiSuccess } from "../lib/api";
import { formatEtb } from "../lib/plans";

type PublicMenu =
  | {
      unavailable: true;
      reason: "expired" | "suspended" | "pending";
      businessName: string;
      logoUrl?: string | null;
      branchName?: string;
      location?: string;
      phone?: string | null;
      message: string;
    }
  | {
      unavailable: false;
      businessName: string;
      logoUrl: string | null;
      branchName: string;
      location: string;
      phone: string | null;
      categories: Array<{
        id: string;
        name: string;
        description: string | null;
        items: Array<{
          id: string;
          name: string;
          description: string | null;
          price: string;
          imageUrl: string | null;
          isFeatured: boolean;
        }>;
      }>;
    };

async function fetchPublicMenu(tenantSlug: string, branchSlug?: string) {
  const path = branchSlug
    ? `/public/menu/${tenantSlug}/${branchSlug}`
    : `/public/menu/${tenantSlug}`;
  const { data } = await api.get<ApiSuccess<PublicMenu>>(path);
  return data.data;
}

function MenuSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-24 w-24 animate-pulse rounded-[1.25rem] bg-white/8" />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/8" />
        <div className="h-4 w-32 animate-pulse rounded bg-white/6" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-white/8"
          />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)]"
          />
        ))}
      </div>
    </div>
  );
}

export function PublicMenuPage() {
  const { tenantSlug = "", branchSlug } = useParams();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [shareOpen, setShareOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const trackedKey = useRef<string | null>(null);

  const menu = useQuery({
    queryKey: ["public-menu", tenantSlug, branchSlug],
    queryFn: () => fetchPublicMenu(tenantSlug, branchSlug),
    enabled: Boolean(tenantSlug),
  });

  useEffect(() => {
    if (!tenantSlug || !menu.data || menu.data.unavailable) return;
    const key = `${tenantSlug}/${branchSlug ?? ""}`;
    if (trackedKey.current === key) return;
    trackedKey.current = key;
    const path = branchSlug
      ? `/public/menu/${tenantSlug}/${branchSlug}/views`
      : `/public/menu/${tenantSlug}/views`;
    void api.post(path).catch(() => undefined);
  }, [menu.data, tenantSlug, branchSlug]);

  const categories =
    menu.data && !menu.data.unavailable ? menu.data.categories : [];

  const items = useMemo(() => {
    if (!menu.data || menu.data.unavailable) return [];
    const all = menu.data.categories.flatMap((c) =>
      c.items.map((item) => ({ ...item, categoryId: c.id })),
    );
    if (activeCategory === "all") return all;
    return all.filter((item) => item.categoryId === activeCategory);
  }, [menu.data, activeCategory]);

  const menuUrl =
    typeof window !== "undefined" ? window.location.href.split("#")[0]! : "";

  const available = menu.data && !menu.data.unavailable ? menu.data : null;

  return (
    <div className="min-h-dvh bg-[var(--night)] text-[var(--mist)]">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, rgba(212,165,116,0.18), transparent 32%), linear-gradient(180deg, rgba(7,10,9,0.2), rgba(7,10,9,0.95))",
        }}
      />

      <main className="relative mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-8">
        {menu.isLoading && <MenuSkeleton />}

        {menu.isError && (
          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
            <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
              KitchenOS
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
              Menu not found
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              This link may be incorrect or the restaurant may have moved. Ask
              your host for a fresh QR code.
            </p>
          </section>
        )}

        {menu.data?.unavailable && (
          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
            {menu.data.logoUrl && (
              <img
                src={menu.data.logoUrl}
                alt=""
                className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover"
              />
            )}
            <p className="text-[11px] tracking-[0.3em] text-[var(--gold)] uppercase">
              KitchenOS
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-white">
              {menu.data.businessName}
            </h1>
            {menu.data.branchName && (
              <p className="mt-2 text-[var(--muted)]">{menu.data.branchName}</p>
            )}
            <p className="mt-6 text-[var(--muted)]">{menu.data.message}</p>
            {(menu.data.phone || menu.data.location) && (
              <div className="mt-6 space-y-2 text-sm text-white/85">
                {menu.data.location && <p>{menu.data.location}</p>}
                {menu.data.phone && (
                  <a
                    href={`tel:${menu.data.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex font-semibold text-[var(--gold-soft)] underline-offset-2 hover:underline"
                  >
                    {menu.data.phone}
                  </a>
                )}
              </div>
            )}
          </section>
        )}

        {available && (
          <>
            <header className="mb-6 text-center">
              {available.logoUrl && (
                <img
                  src={available.logoUrl}
                  alt={`${available.businessName} logo`}
                  className="mx-auto mb-4 h-24 w-24 rounded-[1.25rem] border border-[var(--line)] object-cover"
                />
              )}
              <p className="text-[11px] tracking-[0.35em] text-[var(--gold)] uppercase">
                Digital menu
              </p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-5xl leading-none text-white">
                {available.businessName}
              </h1>
              <p className="mt-3 text-lg text-[var(--gold-soft)]">
                {available.branchName}
              </p>
              <div className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                {available.location && <p>{available.location}</p>}
                {available.phone && (
                  <button
                    type="button"
                    onClick={() => setCallOpen(true)}
                    className="text-[var(--gold-soft)] underline-offset-2 hover:underline"
                  >
                    {available.phone}
                  </button>
                )}
              </div>
            </header>

            {categories.length > 0 && (
              <div
                className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Menu categories"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === "all"}
                  onClick={() => setActiveCategory("all")}
                  className={[
                    "whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors",
                    activeCategory === "all"
                      ? "bg-[var(--gold)] font-semibold text-[var(--night)]"
                      : "border border-white/10 text-white/75",
                  ].join(" ")}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={activeCategory === category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={[
                      "whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors",
                      activeCategory === category.id
                        ? "bg-[var(--gold)] font-semibold text-[var(--night)]"
                        : "border border-white/10 text-white/75",
                    ].join(" ")}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)]"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="aspect-[16/9] w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
                          {item.name}
                          {item.isFeatured && (
                            <span className="ml-2 align-middle text-[10px] tracking-wide text-[var(--gold)] uppercase">
                              Featured
                            </span>
                          )}
                        </h2>
                        <p className="shrink-0 font-semibold text-[var(--gold-soft)]">
                          {formatEtb(item.price)}
                        </p>
                      </div>
                      {item.description && (
                        <FoodDescription
                          text={item.description}
                          className="mt-3"
                        />
                      )}
                    </div>
                  </div>
                </article>
              ))}

              {items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/15 px-4 py-12 text-center">
                  <p className="font-[family-name:var(--font-display)] text-2xl text-white">
                    Nothing here yet
                  </p>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {activeCategory === "all"
                      ? "This branch hasn’t published dishes yet. Check back soon."
                      : "No dishes in this category. Try another tab."}
                  </p>
                  {activeCategory !== "all" && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory("all")}
                      className="mt-4 rounded-full border border-white/15 px-4 py-2 text-sm text-white hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
                    >
                      View full menu
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(7,10,9,0.94)] px-4 py-3 backdrop-blur-md">
              <div className="mx-auto flex max-w-lg gap-2">
                {available.phone ? (
                  <button
                    type="button"
                    onClick={() => setCallOpen(true)}
                    className="flex-1 rounded-full bg-[var(--gold)] py-3 text-center text-sm font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
                  >
                    Call to order
                  </button>
                ) : (
                  <span className="flex-1 rounded-full border border-white/10 py-3 text-center text-sm text-[var(--muted)]">
                    Phone unavailable
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="flex-1 rounded-full border border-white/20 py-3 text-sm font-semibold text-white transition hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
                >
                  Share menu
                </button>
              </div>
            </div>

            {available.phone && (
              <CallToOrderSheet
                open={callOpen}
                onClose={() => setCallOpen(false)}
                businessName={available.businessName}
                branchName={available.branchName}
                location={available.location}
                phone={available.phone}
              />
            )}

            <ShareMenuSheet
              open={shareOpen}
              onClose={() => setShareOpen(false)}
              businessName={available.businessName}
              branchName={available.branchName}
              menuUrl={menuUrl}
            />
          </>
        )}
      </main>
    </div>
  );
}
