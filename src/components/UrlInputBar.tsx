"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onPasteClick: () => void;
  disabled?: boolean;
}

export function UrlInputBar({ value, onChange, onSubmit, onPasteClick, disabled }: Props) {
  return (
    <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors focus-within:border-white/25 sm:px-4 sm:py-3">
      <input
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Paste the link here"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/35 outline-none disabled:opacity-50 sm:text-base"
      />
      <button
        type="button"
        onClick={onPasteClick}
        disabled={disabled}
        className="shrink-0 rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium text-white/90 transition hover:bg-white/[0.16] active:scale-[0.97] disabled:opacity-50"
      >
        Paste
      </button>
    </div>
  );
}
