import { useState } from "react";
import { BottomSheet } from "./BottomSheet";

type CallToOrderSheetProps = {
  open: boolean;
  onClose: () => void;
  businessName: string;
  branchName: string;
  location: string;
  phone: string;
};

function normalizeTelHref(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.startsWith("+") ? cleaned : cleaned.replace(/^0+/, "");
}

function formatPhoneDisplay(phone: string) {
  return phone.trim();
}

export function CallToOrderSheet({
  open,
  onClose,
  businessName,
  branchName,
  location,
  phone,
}: CallToOrderSheetProps) {
  const [copied, setCopied] = useState(false);
  const tel = normalizeTelHref(phone);
  const display = formatPhoneDisplay(phone);

  async function copyPhone() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(display);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Call to order"
      description="Confirm the number, then place your call to this branch."
    >
      <div className="rounded-2xl border border-[var(--line)] bg-black/25 p-4">
        <p className="text-[11px] tracking-[0.2em] text-[var(--gold)] uppercase">
          Restaurant
        </p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">
          {businessName}
        </p>
        <p className="mt-1 text-sm text-[var(--gold-soft)]">{branchName}</p>
        {location && (
          <p className="mt-2 text-sm text-[var(--muted)]">{location}</p>
        )}

        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
          <p className="text-xs text-[var(--muted)]">Phone</p>
          <p className="mt-1 text-lg font-semibold tracking-wide text-white">
            {display}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a
          href={`tel:${tel}`}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--gold)] px-4 text-sm font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
        >
          Call now
        </a>
        <button
          type="button"
          onClick={() => void copyPhone()}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 px-4 text-sm font-semibold text-white transition hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
        >
          {copied ? "Number copied" : "Copy number"}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        Standard carrier rates may apply. Call when you’re ready to place an
        order.
      </p>
    </BottomSheet>
  );
}
