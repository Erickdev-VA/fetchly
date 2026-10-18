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
    <div className="flex h-[52px] w-full items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] pl-5 pr-1.5 transition focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_4px_rgb(109_93_252/0.15)] hover:border-white/20 focus-within:hover:border-[var(--accent)] sm:h-14 sm:pl-5 sm:pr-1.5">
      <NavIcon name="link" className="h-[18px] w-[18px] shrink-0 text-white/45" />
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
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/35 outline-none disabled:opacity-50 sm:text-[15px]"
      />
      <button
        type="button"
        onClick={onPasteClick}
        disabled={disabled}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition enabled:hover:brightness-110 enabled:active:scale-[0.97] disabled:opacity-50 sm:h-11 sm:px-5"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="6" y="4.5" width="12" height="16" rx="2" />
          <path d="M9.5 4.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z" />
        </svg>
        Pegar
      </button>
    </div>
  );
}
