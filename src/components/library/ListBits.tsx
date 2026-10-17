"use client";

/** The accent line a row shows where the dragged rows will land. Its row must be `relative`. */
export function DropLine({ at }: { at: "before" | "after" | null }) {
  if (!at) return null;
  return (
    <span
      className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-[var(--accent)] ${at === "before" ? "-top-px" : "-bottom-px"}`}
    />
  );
}

/**
 * A row's check box for picking several songs, shown only in selection
 * mode. Shift + click selects the range from the last one touched.
 */
export function SelectBox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: (range: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title="Shift + clic: un rango · Ctrl + A: todas"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="flex h-6 w-6 shrink-0 animate-[fadeIn_0.12s_ease] items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition ${
          checked ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-white/35 bg-transparent hover:border-white/70"
        }`}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
    </button>
  );
}

/** Six dots: "grab here to drag". Shown on hover in place of the row's number. */
export function GripDots() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
      {[2, 8, 14].map((y) => (
        <g key={y}>
          <circle cx="2.5" cy={y} r="1.4" />
          <circle cx="7.5" cy={y} r="1.4" />
        </g>
      ))}
    </svg>
  );
}

export interface BarAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown filled, as the main action. */
  primary?: boolean;
}

/**
 * What to do with the selected songs: floats at the bottom of the page,
 * above the playback bar, while selection mode is on. ✕ leaves the mode.
 */
export function SelectionBar({
  active,
  count,
  total,
  actions,
  onSelectAll,
  onClear,
}: {
  active: boolean;
  count: number;
  total: number;
  actions: BarAction[];
  onSelectAll: () => void;
  onClear: () => void;
}) {
  if (!active) return null;
  return (
    <div className="pointer-events-none sticky bottom-4 z-20 mt-4 flex justify-center">
      <div
        role="toolbar"
        aria-label="Acciones con las canciones seleccionadas"
        className="pointer-events-auto flex max-w-full animate-[fadeIn_0.15s_ease] flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-[#1b1b20]/95 p-1.5 pl-3 shadow-2xl shadow-black/60 backdrop-blur"
      >
        <span className="mr-1 whitespace-nowrap text-[13px] font-semibold text-white">
          {count} {count === 1 ? "seleccionada" : "seleccionadas"}
        </span>
        {count < total && (
          <button
            type="button"
            onClick={onSelectAll}
            className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/[0.07] hover:text-white"
          >
            Seleccionar todas ({total})
          </button>
        )}
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden />
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled || count === 0}
            onClick={action.onSelect}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:opacity-35 ${
              action.primary
                ? "bg-[var(--accent)] text-white enabled:hover:brightness-110"
                : action.danger
                  ? "text-red-300 enabled:hover:bg-red-500/10"
                  : "text-white/85 enabled:hover:bg-white/[0.08]"
            }`}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClear}
          aria-label="Dejar de seleccionar (Esc)"
          title="Dejar de seleccionar (Esc)"
          className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/[0.08] hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
