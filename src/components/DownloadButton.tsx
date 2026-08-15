import type { DownloadState } from "@/hooks/useDownloadJob";

export function DownloadButton({ state, onClick }: { state: DownloadState; onClick: () => void }) {
  const isBusy = state.phase === "starting" || state.phase === "preparing" || state.phase === "processing";
  const percent =
    state.phase === "processing" || state.phase === "preparing"
      ? state.percent
      : state.phase === "completed"
        ? 100
        : 0;

  let text = "Download";
  if (state.phase === "starting" || state.phase === "preparing") text = "Preparing…";
  else if (state.phase === "processing") text = `Downloading ${Math.round(percent)}%`;
  else if (state.phase === "completed") text = "Completed";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className="relative w-full overflow-hidden rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-default sm:w-auto sm:px-7"
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
