import type { CSSProperties, ReactNode } from "react";
import { toneForCategory } from "./chart-theme";

/** Compact status / category chip using the shared chart color system. */
export function StatusIndicator({
  status,
  children,
  className = "",
}: {
  status: string | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  const tone = toneForCategory(status);
  const style: CSSProperties = {
    color: tone.solid,
    backgroundColor: tone.softBg,
    borderColor: tone.softBorder,
  };

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className,
      ].join(" ")}
      style={style}
    >
      {children ?? status}
    </span>
  );
}
