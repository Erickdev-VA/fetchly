"use client";

/**
 * When on, downloads are converted to H.264/AAC MP4 if the platform served
 * something else (VP9/AV1/HE-AAC), so they can be sent on WhatsApp or posted
 * to Status. Off keeps the original stream as-is (faster, no re-encode).
 */
export function ShareableToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center gap-2 text-xs text-white/55 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
      title="Convierte a H.264/AAC cuando hace falta, para poder enviar el archivo por WhatsApp y publicarlo en Estados."
    >
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-[var(--accent)]" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] ${value ? "left-3.5" : "left-0.5"}`}
        />
      </button>
      {/* Clicking the label text activates the switch (buttons are labelable). */}
      <span>Compatible con WhatsApp</span>
    </label>
  );
}
