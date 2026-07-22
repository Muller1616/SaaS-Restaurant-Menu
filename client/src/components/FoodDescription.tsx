import { useId, useState } from "react";

const COLLAPSE_AT = 160;

type FoodDescriptionProps = {
  text: string | null | undefined;
  /** When true, always show the full text (tenant management cards can stay compact). */
  compact?: boolean;
  className?: string;
};

/**
 * Renders a multiline menu-item food description with optional expand/collapse
 * so long ingredient lists stay readable without cluttering the card.
 */
export function FoodDescription({
  text,
  compact = false,
  className = "",
}: FoodDescriptionProps) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const value = text?.trim() ?? "";
  if (!value) return null;

  const needsToggle = !compact && value.length > COLLAPSE_AT;
  const shown =
    needsToggle && !expanded
      ? `${value.slice(0, COLLAPSE_AT).trimEnd()}…`
      : value;

  return (
    <div className={className}>
      <p
        id={id}
        className={[
          "text-sm leading-relaxed text-[var(--muted)] whitespace-pre-line",
          compact ? "line-clamp-3" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {compact ? value : shown}
      </p>
      {needsToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold tracking-wide text-[var(--gold-soft)] uppercase hover:text-[var(--gold)]"
        >
          {expanded ? "Show less" : "Full description"}
        </button>
      )}
    </div>
  );
}
