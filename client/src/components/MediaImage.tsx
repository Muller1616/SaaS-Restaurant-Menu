import { useEffect, useState } from "react";
import { assetUrl } from "../lib/api-base";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Optional cache-buster (e.g. Date.now() after regenerate). */
  cacheKey?: string | number;
};

function withCacheBust(url: string, cacheKey: string | number | undefined) {
  if (cacheKey === undefined || cacheKey === null || cacheKey === "") return url;
  // Never mutate data:/blob: URLs — appending ?v= breaks them and shows "Image unavailable".
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("filesystem:")
  ) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(String(cacheKey))}`;
}

/** Renders Cloudinary or legacy media with production-safe absolute URLs. */
export function MediaImage({ src, alt, className = "", cacheKey }: Props) {
  const [failed, setFailed] = useState(false);
  const resolved = assetUrl(src);
  const href = resolved ? withCacheBust(resolved, cacheKey) : undefined;

  useEffect(() => {
    setFailed(false);
  }, [href]);

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
