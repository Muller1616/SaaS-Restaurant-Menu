import { useState } from "react";
import { assetUrl } from "../lib/api-base";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Optional cache-buster (e.g. Date.now() after regenerate). */
  cacheKey?: string | number;
};

/** Renders upload/QR media with production-safe absolute URLs. */
export function MediaImage({ src, alt, className = "", cacheKey }: Props) {
  const [failed, setFailed] = useState(false);
  const resolved = assetUrl(src);
  const href =
    resolved && cacheKey !== undefined
      ? `${resolved}${resolved.includes("?") ? "&" : "?"}v=${cacheKey}`
      : resolved;

  if (!href || failed) {
    return (
      <div
        className={[
          "flex items-center justify-center bg-black/25 text-xs text-[var(--muted)]",
          className,
        ].join(" ")}
        role="img"
        aria-label={alt}
      >
        {failed ? "Image unavailable" : "No image"}
      </div>
    );
  }

  return (
    <img
      src={href}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
