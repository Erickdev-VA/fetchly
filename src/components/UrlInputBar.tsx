"use client";

import { NavIcon } from "./shell/NavIcon";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onPasteClick: () => void;
  disabled?: boolean;
}

export function UrlInputBar({ value, onChange, onSubmit, onPasteClick, disabled }: Props) {
  return (
    <div className="flex h-14 w-full items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] pl-5 pr-1.5 transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_rgb(109_93_252/0.15)] hover:border-white/20 focus-within:hover:border-[var(--accent)] sm:h-16 sm:pl-6 sm:pr-2">
      <NavIcon name="link" className="h-5 w-5 shrink-0 text-white/45" />
      <input
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Enlace"
        placeholder="https://…"
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
        className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[15px] font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:opacity-50 sm:h-12 sm:px-6"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="6" y="4.5" width="12" height="16" rx="2" />
          <path d="M9.5 4.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z" />
        </svg>
        Pegar
      </button>
    </div>
  );
}
