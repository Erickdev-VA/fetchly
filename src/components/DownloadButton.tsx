import type { DownloadState } from "@/hooks/useDownloadJob";

export function DownloadButton({
  state,
  onClick,
  blocked,
}: {
  state: DownloadState;
  onClick: () => void;
  /** Why it can't start yet (shown instead of "Descargar"). */
  blocked?: string | null;
}) {
  const isBusy =
    state.phase === "starting" ||
    state.phase === "queued" ||
    state.phase === "processing" ||
    state.phase === "converting";
  const percent =
    state.phase === "processing" || state.phase === "converting"
      ? state.percent
      : state.phase === "completed"
        ? 100
        : 0;

  let text = blocked ?? "Descargar";
  if (state.phase === "starting") text = "Preparando…";
  else if (state.phase === "queued") text = "En espera…";
  else if (state.phase === "processing") text = `Descargando ${Math.round(percent)}%`;
  else if (state.phase === "converting") text = `Convirtiendo ${Math.round(percent)}%`;
  else if (state.phase === "completed") text = "Completado";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy || Boolean(blocked && state.phase === "idle")}
      className={`relative w-full overflow-hidden rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-default sm:w-auto sm:px-7 ${
        blocked && state.phase === "idle" ? "opacity-40" : ""
      }`}
    >
      {isBusy && (
        <span
          className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      )}
      <span className="relative">{text}</span>
    </button>
  );
}
