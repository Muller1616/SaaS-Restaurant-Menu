import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Props = {
  /** Authenticated API path, e.g. `/admin/payments/:id/proof` */
  apiPath: string;
  alt: string;
  className?: string;
};

/** Loads a protected image via the API (Authorization header) as a blob URL. */
export function AuthenticatedImage({ apiPath, alt, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    void api
      .get(apiPath, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
