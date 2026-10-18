"use client";

import { useState } from "react";
import { PLAYLIST_NAME_MAX } from "@/lib/library/types";

/**
 * Asks for a playlist name (new playlist, or renaming one). `onSubmit`
 * may throw; its message is shown and the dialog stays open.
 */
export function NameDialog({
  title,
  initialName = "",
  submitLabel,
  note,
  onSubmit,
  onCancel,
}: {
  title: string;
  initialName?: string;
  submitLabel: string;
  /** Shown under the name box (a hint or a link). */
  note?: React.ReactNode;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="m-auto w-[min(400px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-[#17171b] p-5 text-white backdrop:bg-black/60"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <input
          autoFocus
          value={name}
          maxLength={PLAYLIST_NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Nombre de la playlist"
          aria-label="Nombre de la playlist"
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/25"
        />
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        {note && <div className="mt-3">{note}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!trimmed || busy}
            className="rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
