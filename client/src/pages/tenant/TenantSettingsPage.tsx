import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { api, type ApiSuccess } from "../../lib/api";
import { validateDeviceImage } from "../../lib/device-image";
import { BackButton } from "../../components/BackButton";

type Settings = {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessLocation: string;
  businessDescription: string | null;
  logoUrl: string | null;
  emailNotificationsEnabled: boolean;
  selectedPlan: { name: string; slug: string };
};

async function fetchSettings() {
  const { data } = await api.get<ApiSuccess<Settings>>("/tenant/settings");
  return data.data;
}

export function TenantSettingsPage() {
  const queryClient = useQueryClient();
  const { refreshTenant } = useTenantAuth();
  const query = useQuery({ queryKey: ["tenant", "settings"], queryFn: fetchSettings });
  const [enabled, setEnabled] = useState(true);
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setEnabled(query.data.emailNotificationsEnabled);
      setPhone(query.data.phone);
      setDescription(query.data.businessDescription ?? "");
    }
  }, [query.data]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const save = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<ApiSuccess<Settings>>("/tenant/settings", {
        emailNotificationsEnabled: enabled,
        phone,
        businessDescription: description || null,
      });
      return data.data;
    },
    onSuccess: async () => {
      setNotice("Settings saved");
      await queryClient.invalidateQueries({ queryKey: ["tenant", "settings"] });
      await refreshTenant();
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Save failed"
          : "Save failed",
      ),
  });

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const invalid = validateDeviceImage(file);
      if (invalid) throw new Error(invalid);
      const body = new FormData();
      body.append("logo", file);
      const { data } = await api.post<ApiSuccess<{ logoUrl: string | null }>>(
        "/tenant/settings/logo",
        body,
      );
      return data.data;
    },
    onSuccess: async () => {
      setLogoFile(null);
      setNotice("Logo uploaded from your device");
      await queryClient.invalidateQueries({ queryKey: ["tenant", "settings"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Logo upload failed"
          : err instanceof Error
            ? err.message
            : "Logo upload failed",
      ),
  });

  const removeLogo = useMutation({
    mutationFn: async () => api.delete("/tenant/settings/logo"),
    onSuccess: async () => {
      setLogoFile(null);
      setNotice("Logo removed");
      await queryClient.invalidateQueries({ queryKey: ["tenant", "settings"] });
    },
    onError: (err) =>
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Remove failed"
          : "Remove failed",
      ),
  });

  const displayLogo = logoPreview ?? query.data?.logoUrl ?? null;

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackTo="/tenant" className="mb-3" />
        <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
          Account
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
          Settings
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          Manage logo (device upload only), notifications, and profile details.
        </p>
      </div>

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

      {query.data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
            <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
              Profile
            </h3>
            <dl className="mt-5 space-y-3 text-sm">
              <Row label="Business" value={query.data.businessName} />
              <Row label="Owner" value={query.data.fullName} />
              <Row label="Email" value={query.data.email} />
              <Row label="Location" value={query.data.businessLocation} />
              <Row label="Plan" value={query.data.selectedPlan.name} />
            </dl>
            <Link
              to="/tenant/change-password"
              className="mt-6 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[var(--gold)]"
            >
              Change password
            </Link>
          </section>

          <section className="rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(160deg,rgba(212,165,116,0.12),rgba(18,26,23,0.95))] p-6">
            <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
              Restaurant logo
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Upload from your device (JPG, PNG, or WebP · max 2MB). No image
              URLs.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-[var(--line)] bg-black/25">
                {displayLogo ? (
                  <img
                    src={displayLogo}
                    alt="Restaurant logo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-[var(--muted)]">
                    No logo
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <label className="block">
                  <span className="sr-only">Choose logo from device</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    capture={undefined}
                    onChange={(e) => {
                      setError(null);
                      const file = e.target.files?.[0] ?? null;
                      const invalid = file ? validateDeviceImage(file) : null;
                      if (invalid) {
                        setError(invalid);
                        setLogoFile(null);
                        e.target.value = "";
                        return;
                      }
                      setLogoFile(file);
                    }}
                    className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--gold)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--night)]"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!logoFile || uploadLogo.isPending}
                    onClick={() => logoFile && uploadLogo.mutate(logoFile)}
                    className="rounded-full bg-[var(--gold)] px-4 py-2 text-sm font-bold text-[var(--night)] disabled:opacity-50"
                  >
                    {uploadLogo.isPending ? "Uploading…" : "Upload logo"}
                  </button>
                  {query.data.logoUrl && (
                    <button
                      type="button"
                      disabled={removeLogo.isPending}
                      onClick={() => removeLogo.mutate()}
                      className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[var(--danger)] hover:text-[var(--danger)]"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <h3 className="mt-10 font-[family-name:var(--font-display)] text-3xl text-white">
              Preferences
            </h3>

            <label className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-black/20 px-4 py-3">
              <div>
                <p className="font-medium text-white">Email notifications</p>
                <p className="text-sm text-[var(--muted)]">
                  Payment, subscription, and system emails
                </p>
              </div>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5"
              />
            </label>

            <label className="mt-4 block text-sm">
              <span className="mb-1.5 block text-white">Phone</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              />
            </label>

            <label className="mt-4 block text-sm">
              <span className="mb-1.5 block text-white">Business description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-28 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5 text-white outline-none focus:border-[var(--gold)]"
              />
            </label>

            <button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                setError(null);
                save.mutate();
              }}
              className="mt-6 rounded-full bg-[var(--gold)] px-6 py-3 text-sm font-bold text-[var(--night)] disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save settings"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-medium text-white">{value}</dd>
    </div>
  );
}
