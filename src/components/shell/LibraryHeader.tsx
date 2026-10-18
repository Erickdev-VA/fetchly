import { PlayerIcon } from "../player/PlayerIcon";

/** "1,8 GB", "350 MB": the space a section's files take, Spanish style. */
export function diskSize(bytes: number): string | null {
  if (bytes <= 0) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1).replace(".", ",")} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * The top of Música and Videos: the section's name in big type, what's in
 * it, and "Reproducir todo" / "Aleatorio" on the right.
 */
export function LibraryHeader({
  title,
  meta,
  onPlayAll,
  onShuffle,
  disabled,
}: {
  title: string;
  meta: string | null;
  onPlayAll: () => void;
  onShuffle: () => void;
  disabled: boolean;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-[40px] font-black leading-none tracking-[-0.03em] text-white lg:text-[52px]">{title}</h1>
        {meta && <p className="mt-3 text-sm text-white/55 lg:text-[15px]">{meta}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onPlayAll}
          className="flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-6 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 outline-none transition enabled:hover:brightness-110 enabled:active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
        >
          <PlayerIcon name="play" size={16} />
          Reproducir todo
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onShuffle}
          className="flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white outline-none transition enabled:hover:border-white/30 enabled:hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-40"
        >
          <PlayerIcon name="shuffle" size={17} />
          Aleatorio
        </button>
      </div>
    </header>
  );
}
