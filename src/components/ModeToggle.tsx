"use client";

import type { DownloadMode } from "@/lib/platform/types";

const MODES: { id: DownloadMode; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "audio", label: "Audio" },
  { id: "mute", label: "Mute" },
];

export function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: DownloadMode;
  onChange: (m: DownloadMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      {MODES.map((m) => {
        const active = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
              active ? "bg-white text-black" : "text-white/50 hover:text-white/85"
            } disabled:opacity-50`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
