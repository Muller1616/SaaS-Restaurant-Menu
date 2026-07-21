import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { validateDeviceImage } from "../../lib/device-image";
import { formatEtb } from "../../lib/plans";
import { subscriptionStatusLabel } from "../../lib/status-labels";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  categoryId: string;
};

type Category = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  items: MenuItem[];
};

type MenuWorkspace = {
  branch: { id: string; name: string; slug: string };
  tenant: { slug: string; businessName: string };
  canEdit: boolean;
  canAddItem: boolean;
  itemCount: number;
  previewUrl: string;
  plan: { name: string; maxItems: number | null } | null;
  subscriptionStatus: string | null;
  categories: Category[];
};

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const itemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().positive("Enter a valid price"),
  categoryId: z.string().min(1, "Category is required"),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
});

type CategoryForm = z.infer<typeof categorySchema>;
type ItemForm = z.infer<typeof itemSchema>;

async function fetchMenu() {
  const { data } = await api.get<ApiSuccess<MenuWorkspace>>("/tenant/menu");
  return data.data;
}

export function TenantMenuPage() {
  const queryClient = useQueryClient();
  const { currentBranchId, tenant } = useTenantAuth();
  const menu = useQuery({
    queryKey: ["tenant", "menu", currentBranchId],
    queryFn: fetchMenu,
    enabled: Boolean(currentBranchId),
  });

  const [activeCategoryId, setActiveCategoryId] = useState<string | "all">("all");
  const [categoryModal, setCategoryModal] = useState<"create" | Category | null>(
    null,
  );
  const [itemModal, setItemModal] = useState<"create" | MenuItem | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const categoryForm = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "", description: "", sortOrder: 0 },
  });

  const itemForm = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 100,
      categoryId: "",
      isAvailable: true,
      isFeatured: false,
    },
  });

  const categories = menu.data?.categories ?? [];
  const allItems = categories.flatMap((c) =>
    c.items.map((item) => ({ ...item, categoryName: c.name })),
  );
  const visibleItems =
    activeCategoryId === "all"
      ? allItems
      : allItems.filter((item) => item.categoryId === activeCategoryId);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["tenant", "menu"] });
    void queryClient.invalidateQueries({ queryKey: ["tenant", "dashboard"] });
  }

  const saveCategory = useMutation({
    mutationFn: async (values: CategoryForm) => {
      if (categoryModal && categoryModal !== "create") {
        await api.patch(`/tenant/menu/categories/${categoryModal.id}`, values);
      } else {
        await api.post("/tenant/menu/categories", values);
      }
    },
    onSuccess: () => {
      setCategoryModal(null);
      setNotice("Category saved");
      invalidate();
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Category save failed"
          : "Category save failed",
      ),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => api.delete(`/tenant/menu/categories/${id}`),
    onSuccess: () => {
      setNotice("Category removed");
      setActiveCategoryId("all");
      invalidate();
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Delete failed"
          : "Delete failed",
      ),
  });

  const saveItem = useMutation({
    mutationFn: async (values: ItemForm) => {
      if (imageFile) {
        const invalid = validateDeviceImage(imageFile);
        if (invalid) throw new Error(invalid);
      }
      const body = new FormData();
      body.append("name", values.name);
      body.append("description", values.description || "");
      body.append("price", String(values.price));
      body.append("currency", "ETB");
      body.append("categoryId", values.categoryId);
      body.append("isAvailable", String(values.isAvailable));
      body.append("isFeatured", String(values.isFeatured));
      if (imageFile) body.append("image", imageFile);

      if (itemModal && itemModal !== "create") {
        await api.patch(`/tenant/menu/items/${itemModal.id}`, body);
      } else {
        await api.post("/tenant/menu/items", body);
      }
    },
    onSuccess: () => {
      setItemModal(null);
      setImageFile(null);
      setNotice("Menu item saved");
      invalidate();
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Item save failed"
          : err instanceof Error
            ? err.message
            : "Item save failed",
      ),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => api.delete(`/tenant/menu/items/${id}`),
    onSuccess: () => {
      setNotice("Item deleted");
      invalidate();
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Delete failed"
          : "Delete failed",
      ),
  });

  function openCreateCategory() {
    setError(null);
    categoryForm.reset({ name: "", description: "", sortOrder: categories.length });
    setCategoryModal("create");
  }

  function openEditCategory(category: Category) {
    setError(null);
    categoryForm.reset({
      name: category.name,
      description: category.description ?? "",
      sortOrder: category.sortOrder,
    });
    setCategoryModal(category);
  }

  function openCreateItem() {
    setError(null);
    setImageFile(null);
    itemForm.reset({
      name: "",
      description: "",
      price: 100,
      categoryId:
        activeCategoryId !== "all"
          ? activeCategoryId
          : categories[0]?.id || "",
      isAvailable: true,
      isFeatured: false,
    });
    setItemModal("create");
  }

  function openEditItem(item: MenuItem) {
    setError(null);
    setImageFile(null);
    itemForm.reset({
      name: item.name,
      description: item.description ?? "",
      price: Number(item.price),
      categoryId: item.categoryId,
      isAvailable: item.isAvailable,
      isFeatured: item.isFeatured,
    });
    setItemModal(item);
  }

  const limitLabel =
    menu.data?.plan?.maxItems == null
      ? "Unlimited items"
      : `${menu.data.itemCount}/${menu.data.plan.maxItems} items`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            {tenant?.businessName}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
            Menu · {menu.data?.branch.name ?? "Branch"}
          </h2>
          <p className="mt-2 text-[var(--muted)]">
            Craft categories and dishes guests will see on your QR menu.{" "}
            <span className="text-[var(--gold-soft)]">{limitLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {menu.data?.previewUrl && (
            <a
              href={menu.data.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold hover:border-[var(--gold)]"
            >
              Preview menu
            </a>
          )}
          <button
            type="button"
            disabled={!menu.data?.canEdit}
            onClick={openCreateCategory}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm disabled:opacity-40"
          >
            Add category
          </button>
          <button
            type="button"
            disabled={!menu.data?.canEdit || !menu.data?.canAddItem || categories.length === 0}
            onClick={openCreateItem}
            className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-40"
            title={
              !menu.data?.canAddItem
                ? "Item limit reached — upgrade your plan"
                : categories.length === 0
                  ? "Add a category first"
                  : undefined
            }
          >
            Add item
          </button>
        </div>
      </div>

      {menu.data && !menu.data.canEdit && (
        <div className="rounded-2xl border border-[var(--danger)]/30 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          Your plan is {subscriptionStatusLabel(menu.data.subscriptionStatus)}.
          Menu editing is locked until you renew.
        </div>
      )}
      {menu.data && !menu.data.canAddItem && menu.data.canEdit && (
        <div className="rounded-2xl border border-[var(--gold)]/30 bg-[rgba(212,165,116,0.08)] px-4 py-3 text-sm text-[var(--gold-soft)]">
          You’ve reached your item limit on the {menu.data.plan?.name} plan. Upgrade
          to add more dishes.
        </div>
      )}
      {notice && (
        <div className="rounded-2xl bg-[rgba(61,186,138,0.12)] px-4 py-3 text-sm text-[var(--success)]">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-[rgba(255,107,107,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {menu.isLoading && <p className="text-[var(--muted)]">Loading menu…</p>}
      {menu.isError && (
        <p className="text-[var(--danger)]">
          Could not load menu. Ensure a branch is selected.
        </p>
      )}

      {menu.data && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Tab
              active={activeCategoryId === "all"}
              onClick={() => setActiveCategoryId("all")}
              label={`All (${allItems.length})`}
            />
            {categories.map((category) => (
              <Tab
                key={category.id}
                active={activeCategoryId === category.id}
                onClick={() => setActiveCategoryId(category.id)}
                label={`${category.name} (${category.items.length})`}
                onEdit={
                  menu.data.canEdit
                    ? () => openEditCategory(category)
                    : undefined
                }
              />
            ))}
          </div>

          {categories.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-white/15 px-6 py-16 text-center">
              <p className="font-[family-name:var(--font-display)] text-3xl text-white">
                Start with a category
              </p>
              <p className="mt-2 text-[var(--muted)]">
                Appetizers, Mains, Drinks — then add your dishes.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-[var(--panel)]"
                >
                  <div className="aspect-[16/10] bg-black/30">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-[family-name:var(--font-display)] text-2xl text-white">
                          {item.name}
                        </h3>
                        <p className="text-xs text-[var(--muted)]">
                          {item.categoryName}
                          {item.isFeatured ? " · Featured" : ""}
                          {!item.isAvailable ? " · Out of stock" : ""}
                        </p>
                      </div>
                      <p className="font-semibold text-[var(--gold-soft)]">
                        {formatEtb(item.price)}
                      </p>
                    </div>
                    {item.description && (
                      <p className="line-clamp-2 text-sm text-[var(--muted)]">
                        {item.description}
                      </p>
                    )}
                    {menu.data.canEdit && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openEditItem(item)}
                          className="rounded-full border border-white/15 px-3 py-1.5 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete “${item.name}”?`)) {
                              deleteItem.mutate(item.id);
                            }
                          }}
                          className="rounded-full border border-[var(--danger)]/40 px-3 py-1.5 text-xs text-[var(--danger)]"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {categoryModal && (
        <Modal
          title={categoryModal === "create" ? "New category" : "Edit category"}
          onClose={() => setCategoryModal(null)}
        >
          <form
            className="space-y-4"
            onSubmit={categoryForm.handleSubmit((values) =>
              saveCategory.mutate(values),
            )}
          >
            <Field label="Name" error={categoryForm.formState.errors.name?.message}>
              <input className="field" {...categoryForm.register("name")} />
            </Field>
            <Field label="Description">
              <textarea
                className="field min-h-20"
                {...categoryForm.register("description")}
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                className="field"
                {...categoryForm.register("sortOrder", { valueAsNumber: true })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
              >
                Save
              </button>
              {categoryModal !== "create" && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove category “${categoryModal.name}”? Items stay in the database but the category is hidden.`,
                      )
                    ) {
                      deleteCategory.mutate(categoryModal.id);
                      setCategoryModal(null);
                    }
                  }}
                  className="rounded-full border border-[var(--danger)]/40 px-5 py-2.5 text-sm text-[var(--danger)]"
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}

      {itemModal && (
        <Modal
          title={itemModal === "create" ? "New menu item" : "Edit menu item"}
          onClose={() => setItemModal(null)}
        >
          <form
            className="space-y-4"
            onSubmit={itemForm.handleSubmit((values) => saveItem.mutate(values))}
          >
            <Field label="Item name" error={itemForm.formState.errors.name?.message}>
              <input className="field" {...itemForm.register("name")} />
            </Field>
            <Field label="Description">
              <textarea
                className="field min-h-20"
                {...itemForm.register("description")}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (ETB)" error={itemForm.formState.errors.price?.message}>
                <input
                  type="number"
                  step="0.01"
                  className="field"
                  {...itemForm.register("price", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Category"
                error={itemForm.formState.errors.categoryId?.message}
              >
                <select className="field" {...itemForm.register("categoryId")}>
                  <option value="">Select…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Image from device (optional, max 2MB · no URLs)">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--gold)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--night)]"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) {
                    const invalid = validateDeviceImage(file);
                    if (invalid) {
                      setImageFile(null);
                      e.target.value = "";
                      setError(invalid);
                      return;
                    }
                  }
                  setImageFile(file);
                }}
              />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm text-white">
              <label className="flex items-center gap-2">
                <input type="checkbox" {...itemForm.register("isAvailable")} />
                Available
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...itemForm.register("isFeatured")} />
                Featured
              </label>
            </div>
            <button
              type="submit"
              disabled={saveItem.isPending}
              className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-50"
            >
              {saveItem.isPending ? "Saving…" : "Save item"}
            </button>
          </form>
        </Modal>
      )}

      <style>{`
        .field {
          width: 100%;
          border-radius: 0.9rem;
          border: 1px solid var(--line);
          background: rgba(0,0,0,0.28);
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

function Tab({
  label,
  active,
  onClick,
  onEdit,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div
      className={[
        "flex items-center gap-1 rounded-full border px-1 py-1",
        active
          ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--night)]"
          : "border-white/10 text-white/75",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onClick}
        className="rounded-full px-3 py-1.5 text-sm font-medium"
      >
        {label}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full px-2 py-1 text-xs opacity-70 hover:opacity-100"
          title="Edit category"
        >
          ✎
        </button>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[1.75rem] border border-[var(--line)] bg-[#121a17] p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-sm"
          >
            Close
          </button>
        </div>
        {children}
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
      <span className="mb-1.5 block text-sm text-white/90">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-[var(--danger)]">{error}</span>}
    </label>
  );
}
