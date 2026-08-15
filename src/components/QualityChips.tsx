import type { QualityOption } from "@/lib/platform/types";
import { formatBytes } from "@/lib/format";

function Chip({
  label,
  hint,
  active,
  onClick,
  disabled,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-white"
          : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/85"
      } disabled:cursor-default disabled:opacity-40`}
    >
      {label}
      {hint && <span className="ml-1 text-white/35">{hint}</span>}
    </button>
  );
}

export function QualityChips({
  qualities,
  selected,
  onSelect,
  disabled,
}: {
  qualities: QualityOption[];
  selected: number | "best";
  onSelect: (h: number | "best") => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={selected === "best"} onClick={() => onSelect("best")} disabled={disabled} label="Best" />
      {qualities.map((q) => (
        <Chip
          key={q.height}
          active={selected === q.height}
          onClick={() => onSelect(q.height)}
          disabled={disabled}
          label={q.label}
          hint={formatBytes(q.estSizeBytes) ?? undefined}
        />
      ))}
    </div>
  );
}
