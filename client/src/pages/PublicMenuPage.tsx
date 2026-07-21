import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type ApiSuccess } from "../lib/api";
import { formatEtb } from "../lib/plans";

type PublicMenu =
  | {
      unavailable: true;
      reason: "expired" | "suspended";
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

export function PublicMenuPage() {
  const { tenantSlug = "", branchSlug } = useParams();
  const [activeCategory, setActiveCategory] = useState<string>("all");
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

  async function shareMenu() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({
        title: menu.data && !menu.data.unavailable
          ? `${menu.data.businessName} menu`
          : "KitchenOS menu",
        url,
      });
      return;
    }
    await navigator.clipboard.writeText(url);
    window.alert("Menu link copied to your clipboard");
  }

  return (
    <div className="min-h-screen bg-[var(--night)] text-[var(--mist)]">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, rgba(212,165,116,0.18), transparent 32%), linear-gradient(180deg, rgba(7,10,9,0.2), rgba(7,10,9,0.95))",
        }}
      />

      <main className="relative mx-auto min-h-screen max-w-lg px-4 pb-28 pt-8">
        {menu.isLoading && (
          <p className="text-center text-[var(--muted)]">Loading menu…</p>
        )}
        {menu.isError && (
          <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
              Menu not found
            </h1>
          </div>
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
              <p className="mt-4 text-sm text-white/80">
                {[menu.data.location, menu.data.phone].filter(Boolean).join(" · ")}
              </p>
            )}
          </section>
        )}

        {menu.data && !menu.data.unavailable && (
          <>
            <header className="mb-6 animate-rise text-center">
              {menu.data.logoUrl && (
                <img
                  src={menu.data.logoUrl}
                  alt=""
                  className="mx-auto mb-4 h-24 w-24 rounded-[1.25rem] border border-[var(--line)] object-cover"
                />
              )}
              <p className="text-[11px] tracking-[0.35em] text-[var(--gold)] uppercase">
                KitchenOS
              </p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-5xl leading-none text-white">
                {menu.data.businessName}
              </h1>
              <p className="mt-3 text-lg text-[var(--gold-soft)]">
                {menu.data.branchName}
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {[menu.data.location, menu.data.phone].filter(Boolean).join(" · ")}
              </p>
            </header>

            <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={[
                  "whitespace-nowrap rounded-full px-4 py-2 text-sm",
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
                  onClick={() => setActiveCategory(category.id)}
                  className={[
                    "whitespace-nowrap rounded-full px-4 py-2 text-sm",
                    activeCategory === category.id
                      ? "bg-[var(--gold)] font-semibold text-[var(--night)]"
                      : "border border-white/10 text-white/75",
                  ].join(" ")}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  className="animate-rise overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)]"
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
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
                    <div>
                      <h2 className="font-[family-name:var(--font-display)] text-2xl text-white">
                        {item.name}
                        {item.isFeatured && (
                          <span className="ml-2 align-middle text-[10px] tracking-wide text-[var(--gold)] uppercase">
                            Featured
                          </span>
                        )}
                      </h2>
                      {item.description && (
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 font-semibold text-[var(--gold-soft)]">
                      {formatEtb(item.price)}
                    </p>
                  </div>
                </article>
              ))}
              {items.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/15 px-4 py-10 text-center text-[var(--muted)]">
                  No dishes in this category yet.
                </p>
              )}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[rgba(7,10,9,0.92)] px-4 py-3 backdrop-blur">
              <div className="mx-auto flex max-w-lg gap-2">
                {menu.data.phone ? (
                  <a
                    href={`tel:${menu.data.phone}`}
                    className="flex-1 rounded-full bg-[var(--gold)] py-3 text-center text-sm font-bold text-[var(--night)]"
                  >
                    Call to order
                  </a>
                ) : (
                  <span className="flex-1 rounded-full border border-white/10 py-3 text-center text-sm text-[var(--muted)]">
                    No phone listed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void shareMenu()}
                  className="flex-1 rounded-full border border-white/20 py-3 text-sm font-semibold text-white"
                >
                  Share menu
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
