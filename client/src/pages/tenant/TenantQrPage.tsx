import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTenantAuth } from "../../features/tenant/TenantAuthContext";
import { publicQrPath, tenantPortalPath } from "../../lib/tenant-paths";
import { api, type ApiSuccess } from "../../lib/api";
import { formatAdminDateTime } from "../../lib/datetime";
import { refreshQueries } from "../../lib/refresh-queries";
import { MediaImage } from "../../components/MediaImage";
import { subscriptionStatusLabel } from "../../lib/status-labels";

type QrPayload = {
  branchId: string;
  branchName: string;
  location: string;
  phone: string | null;
  businessName: string;
  tenantSlug: string;
  branchSlug: string;
  publicQrId: string;
  menuUrl: string;
  qrCodeUrl: string;
  qrSvgUrl: string;
  qrCreatedAt?: string;
  qrRegeneratedAt?: string | null;
  subscriptionStatus: string | null;
  canCustomize: boolean;
  hasLogo: boolean;
  style: {
    fgColor: string;
    bgColor: string;
    useLogo: boolean;
  };
};

async function fetchQr() {
  const { data } = await api.get<ApiSuccess<QrPayload>>("/tenant/qr");
  return data.data;
}

async function downloadQr(format: "png" | "svg", fileBase: string) {
  const response = await api.get(`/tenant/qr/download`, {
    params: { format },
    responseType: "blob",
  });
  const blob = new Blob([response.data], {
    type: format === "png" ? "image/png" : "image/svg+xml",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileBase}-qr.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function openPrint() {
  const response = await api.get("/tenant/qr/print", {
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function TenantQrPage() {
  const queryClient = useQueryClient();
  const { currentBranchId, tenant } = useTenantAuth();
  const portal = (...segments: string[]) => tenantPortalPath(tenant?.slug ?? "", ...segments);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);
  const [fgColor, setFgColor] = useState("#0E1412");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [useLogo, setUseLogo] = useState(false);

  const qr = useQuery({
    queryKey: ["tenant", "qr", currentBranchId],
    queryFn: fetchQr,
    enabled: Boolean(currentBranchId),
  });

  useEffect(() => {
    if (!qr.data) return;
    setFgColor(qr.data.style.fgColor);
    setBgColor(qr.data.style.bgColor);
    setUseLogo(qr.data.style.useLogo);
  }, [qr.data]);

  const regenerate = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiSuccess<QrPayload>>(
        "/tenant/qr/regenerate",
      );
      return data.data;
    },
    onSuccess: () => {
      setCacheBust(Date.now());
      setNotice(
        "New QR code issued. The previous code no longer works — reprint and replace table cards.",
      );
      setError(null);
      refreshQueries(
        queryClient,
        ["tenant", "qr"],
        ["tenant", "dashboard"],
      );
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Regenerate failed"
          : "Regenerate failed",
      );
    },
  });

  const saveStyle = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<ApiSuccess<QrPayload>>(
        "/tenant/qr/style",
        { fgColor, bgColor, useLogo },
      );
      return data.data;
    },
    onSuccess: () => {
      setCacheBust(Date.now());
      setNotice("Custom QR style saved and regenerated.");
      setError(null);
      refreshQueries(
        queryClient,
        ["tenant", "qr"],
        ["tenant", "dashboard"],
      );
    },
    onError: (err) => {
      setError(
        axios.isAxiosError(err)
          ? (err.response?.data?.message as string) || "Style update failed"
          : "Style update failed",
      );
    },
  });

  const fileBase = qr.data
    ? `${qr.data.tenantSlug}-${qr.data.branchSlug}`
    : "kitchenos";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
            Guest access
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-4xl text-white">
            QR Code
          </h2>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Print elegant table tents for{" "}
            <span className="text-white">
              {qr.data?.branchName ?? "this branch"}
            </span>
            . Guests scan once and land on your live menu.
          </p>
        </div>
        {qr.data && (
          <a
            href={publicQrPath(qr.data.publicQrId)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-[var(--gold)]"
          >
            Open public menu
          </a>
        )}
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

      {qr.isLoading && <p className="text-[var(--muted)]">Loading QR…</p>}
      {qr.isError && (
        <p className="text-[var(--danger)]">
          Could not load QR. Select a branch and try again.
        </p>
      )}

      {qr.data && (
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(160deg,rgba(212,165,116,0.14),rgba(18,26,23,0.96))] p-6">
            <p className="text-sm text-[var(--muted)]">{tenant?.businessName}</p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">
              {qr.data.branchName}
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{qr.data.location}</p>

            <div
              className="mx-auto mt-8 w-full max-w-sm rounded-[1.5rem] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
              style={{ background: qr.data.style.bgColor }}
            >
              <MediaImage
                src={qr.data.qrCodeUrl}
                alt={`${qr.data.branchName} QR code`}
                className="aspect-square w-full object-contain"
                cacheKey={cacheBust}
              />
            </div>

            <p className="mt-5 break-all text-center text-xs text-[var(--muted)]">
              {qr.data.menuUrl}
            </p>
            <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
              Token issued {formatAdminDateTime(qr.data.qrCreatedAt)}
              {qr.data.qrRegeneratedAt
                ? ` · last rotated ${formatAdminDateTime(qr.data.qrRegeneratedAt)}`
                : ""}
            </p>
          </section>

          <div className="space-y-4">
            <section className="space-y-4 rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                  Download & print
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  PNG for social posts, SVG for crisp print, A4 for table tents.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ActionButton
                  label="Download PNG"
                  onClick={() => void downloadQr("png", fileBase)}
                />
                <ActionButton
                  label="Download SVG"
                  onClick={() => void downloadQr("svg", fileBase)}
                />
                <ActionButton
                  label="Print A4 template"
                  onClick={() => void openPrint()}
                  primary
                />
                <ActionButton
                  label={
                    regenerate.isPending ? "Regenerating…" : "Regenerate QR"
                  }
                  onClick={() => regenerate.mutate()}
                  disabled={regenerate.isPending}
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--muted)]">
                <p className="font-medium text-white">Tips</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    Menu edits (items, prices, availability) appear live on this
                    QR — no reprint needed.
                  </li>
                  <li>
                    Regenerate only if a printed code was lost or compromised;
                    the old token stops working immediately.
                  </li>
                  <li>Print uses an A4 layout with restaurant + branch name.</li>
                  <li>
                    Plan status:{" "}
                    <span className="text-[var(--gold-soft)]">
                      {subscriptionStatusLabel(
                        qr.data.subscriptionStatus ?? "NO_SUBSCRIPTION",
                      )}
                    </span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-4 rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6">
              <div>
                <p className="text-[11px] tracking-[0.28em] text-[var(--gold)] uppercase">
                  Plan feature
                </p>
                <h3 className="font-[family-name:var(--font-display)] text-3xl text-white">
                  Custom styling
                </h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {qr.data.canCustomize
                    ? "Tune foreground/background colors and optionally place your logo in the center (PNG)."
                    : "Custom QR colors and logo are included on Basic, Popular, and Premium."}
                </p>
              </div>

              {!qr.data.canCustomize ? (
                <Link
                  to={portal("subscription")}
                  className="inline-flex rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)]"
                >
                  Upgrade to unlock
                </Link>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-[var(--muted)]">
                        Foreground
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={fgColor}
                          onChange={(e) =>
                            setFgColor(e.target.value.toUpperCase())
                          }
                          className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--line)] bg-transparent"
                        />
                        <input
                          value={fgColor}
                          onChange={(e) => setFgColor(e.target.value)}
                          className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 font-mono text-sm text-white outline-none focus:border-[var(--gold)]"
                        />
                      </div>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-[var(--muted)]">
                        Background
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) =>
                            setBgColor(e.target.value.toUpperCase())
                          }
                          className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--line)] bg-transparent"
                        />
                        <input
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2 font-mono text-sm text-white outline-none focus:border-[var(--gold)]"
                        />
                      </div>
                    </label>
                  </div>

                  <label className="flex items-start gap-3 text-sm text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={useLogo}
                      onChange={(e) => setUseLogo(e.target.checked)}
                      className="mt-1 accent-[var(--gold)]"
                    />
                    <span>
                      Place business logo in the center
                      {!qr.data.hasLogo && (
                        <>
                          {" "}
                          —{" "}
                          <Link
                            to={portal("settings")}
                            className="text-[var(--gold-soft)] underline"
                          >
                            upload a logo in Settings
                          </Link>{" "}
                          first
                        </>
                      )}
                      . Applies to PNG / print; SVG stays color-only for
                      sharpest scaling.
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={saveStyle.isPending}
                    onClick={() => saveStyle.mutate()}
                    className="rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-bold text-[var(--night)] disabled:opacity-60"
                  >
                    {saveStyle.isPending
                      ? "Applying…"
                      : "Apply style & regenerate"}
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  primary,
  disabled,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50",
        primary
          ? "bg-[var(--gold)] text-[var(--night)] hover:bg-[var(--gold-soft)]"
          : "border border-white/15 text-white hover:border-[var(--gold)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
