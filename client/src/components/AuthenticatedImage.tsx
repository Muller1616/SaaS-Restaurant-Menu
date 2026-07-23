import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Props = {
  /** Authenticated API path, e.g. `/admin/payments/:id/proof` */
  apiPath: string;
  alt: string;
  className?: string;
};

type CacheEntry = {
  objectUrl: string;
  refCount: number;
};

/** Session-scoped blob cache so remounts do not re-download the same proof. */
const blobCache = new Map<string, CacheEntry>();

function retainBlob(apiPath: string, blob: Blob) {
  const existing = blobCache.get(apiPath);
  if (existing) {
    existing.refCount += 1;
    return existing.objectUrl;
  }
  const objectUrl = URL.createObjectURL(blob);
  blobCache.set(apiPath, { objectUrl, refCount: 1 });
  return objectUrl;
}

function releaseBlob(apiPath: string) {
  const existing = blobCache.get(apiPath);
  if (!existing) return;
  existing.refCount -= 1;
  if (existing.refCount <= 0) {
    URL.revokeObjectURL(existing.objectUrl);
    blobCache.delete(apiPath);
  }
}

/** Loads a protected image via the API (Authorization header) as a blob URL. */
export function AuthenticatedImage({ apiPath, alt, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(() => {
    const cached = blobCache.get(apiPath);
    return cached?.objectUrl ?? null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const cached = blobCache.get(apiPath);
    if (cached) {
      cached.refCount += 1;
      setSrc(cached.objectUrl);
      return () => {
        releaseBlob(apiPath);
      };
    }

    setSrc(null);
    void api
      .get(apiPath, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        const objectUrl = retainBlob(apiPath, res.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      releaseBlob(apiPath);
    };
  }, [apiPath]);

  if (failed) {
    return (
      <div
        className={[
          "flex items-center justify-center bg-black/30 text-sm text-[var(--muted)]",
          className,
        ].join(" ")}
      >
        Proof unavailable
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={[
          "animate-pulse bg-white/8",
          className,
        ].join(" ")}
        aria-busy="true"
        aria-label={`Loading ${alt}`}
      />
    );
  }

  return <img src={src} alt={alt} className={className} />;
}
