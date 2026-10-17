"use client";

/**
 * A modal yes/no question. Uses the native <dialog>, which brings focus
 * trapping, Escape to cancel and the backdrop for free. Focus starts on
 * "Cancelar", so a stray Enter never confirms something destructive.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** "primary" for a question that isn't about deleting something. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === e.currentTarget) onCancel();
      }}
      className="m-auto w-[min(400px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-[#17171b] p-5 text-white backdrop:bg-black/60"
    >
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/60">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition ${
            tone === "danger" ? "bg-red-500/90 hover:bg-red-500" : "bg-[var(--accent)] hover:brightness-110"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
