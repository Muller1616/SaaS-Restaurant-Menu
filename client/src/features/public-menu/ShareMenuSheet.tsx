import { useMemo, useState } from "react";
import { BottomSheet } from "./BottomSheet";

type ShareMenuSheetProps = {
  open: boolean;
  onClose: () => void;
  businessName: string;
  branchName: string;
  menuUrl: string;
};

type CopyState = "idle" | "copied" | "error";

function shareText(businessName: string, branchName: string) {
  return `Check out the menu at ${businessName} (${branchName})`;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("Copy failed");
}

export function ShareMenuSheet({
  open,
  onClose,
  businessName,
  branchName,
  menuUrl,
}: ShareMenuSheetProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const text = useMemo(
    () => shareText(businessName, branchName),
    [businessName, branchName],
  );
  const encodedUrl = encodeURIComponent(menuUrl);
  const encodedText = encodeURIComponent(`${text}\n${menuUrl}`);

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare ||
      navigator.canShare({ title: businessName, text, url: menuUrl }));

  async function handleCopy() {
    try {
      await copyText(menuUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2800);
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({
        title: `${businessName} menu`,
        text,
        url: menuUrl,
      });
      onClose();
    } catch (error) {
      // User cancelled the system sheet — ignore.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2800);
    }
  }

  const channels = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodedText}`,
      accent: "#25D366",
    },
    {
      id: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(text)}`,
      accent: "#2AABEE",
    },
    {
      id: "sms",
      label: "Messages",
      href: `sms:?&body=${encodedText}`,
      accent: "#A78BFA",
    },
    {
      id: "email",
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent(`${businessName} menu`)}&body=${encodedText}`,
      accent: "#F5B942",
    },
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      accent: "#1877F2",
    },
    {
      id: "x",
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(text)}`,
      accent: "#E7E9EA",
    },
  ] as const;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Share menu"
      description={`Send ${businessName}'s menu to friends and tables.`}
    >
      <div className="rounded-2xl border border-[var(--line)] bg-black/25 p-3">
        <p className="text-[11px] tracking-[0.2em] text-[var(--gold)] uppercase">
          Menu link
        </p>
        <p className="mt-1 break-all text-sm text-white/90">{menuUrl}</p>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="mt-3 w-full rounded-full bg-[var(--gold)] py-2.5 text-sm font-bold text-[var(--night)] transition hover:bg-[var(--gold-soft)]"
        >
          {copyState === "copied"
            ? "Link copied"
            : copyState === "error"
              ? "Couldn't copy — try again"
              : "Copy link"}
        </button>
        {copyState === "copied" && (
          <p className="mt-2 text-center text-xs text-[var(--success)]" role="status">
            Ready to paste anywhere.
          </p>
        )}
        {copyState === "error" && (
          <p className="mt-2 text-center text-xs text-[var(--danger)]" role="alert">
            Copy failed. Long-press the link above, or try another share option.
          </p>
        )}
      </div>

      {canNativeShare && (
        <button
          type="button"
          onClick={() => void handleNativeShare()}
          className="mt-3 w-full rounded-full border border-white/20 py-2.5 text-sm font-semibold text-white transition hover:border-[var(--gold)] hover:text-[var(--gold-soft)]"
        >
          Share via device…
        </button>
      )}

      <p className="mt-5 text-xs tracking-[0.18em] text-[var(--muted)] uppercase">
        Or share with
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {channels.map((channel) => (
          <a
            key={channel.id}
            href={channel.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-white transition hover:border-white/25"
            style={{ boxShadow: `inset 0 0 0 1px ${channel.accent}22` }}
          >
            {channel.label}
          </a>
        ))}
      </div>
    </BottomSheet>
  );
}
