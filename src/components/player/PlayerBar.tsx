"use client";

import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayerIcon, type PlayerIconName } from "./PlayerIcon";
import { Slider } from "./Slider";
import { usePlayer, usePlayerPosition } from "./PlayerProvider";

function IconButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  size = 18,
}: {
  icon: PlayerIconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:cursor-default disabled:opacity-30 ${
        active ? "text-[var(--accent)]" : "text-white/60 enabled:hover:text-white"
      }`}
    >
      <PlayerIcon name={icon} size={size} />
      {active && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[var(--accent)]" />}
    </button>
  );
}

function Progress() {
  const { current, duration, actions } = usePlayer();
  const position = usePlayerPosition();
  const total = duration ?? 0;
  return (
    <div className="flex w-full items-center gap-2 text-[11px] tabular-nums text-white/45">
      <span className="w-9 text-right">{formatDuration(current ? position : 0) ?? "0:00"}</span>
      <Slider
        value={position}
        max={total}
        disabled={!current || total <= 0}
        onCommit={actions.seek}
        label="Posición"
        valueText={`${formatDuration(position) ?? "0:00"} de ${formatDuration(total) ?? "0:00"}`}
        className="flex-1"
      />
      <span className="w-9">{formatDuration(current ? total : 0) ?? "0:00"}</span>
    </div>
  );
}

/** The bar along the bottom of the app: what's playing, controls, progress, volume and the queue button. */
export function PlayerBar() {
  const { current, playing, shuffle, repeat, volume, muted, hasPrevious, hasNext, error, queueOpen, setQueueOpen, actions } =
    usePlayer();
  const track = current?.track ?? null;
  const volumeIcon: PlayerIconName = muted || volume === 0 ? "volume-off" : volume < 0.5 ? "volume-low" : "volume";

  return (
    <footer className="grid h-[76px] shrink-0 grid-cols-[minmax(0,3fr)_minmax(240px,4fr)_minmax(0,3fr)] items-center gap-4 border-t border-white/[0.06] bg-[#0d0d10] px-4">
      <div className="flex min-w-0 items-center gap-3">
        {track ? (
          <LibraryThumb id={track.id} hasThumbnail={track.hasThumbnail} fallbackIcon="music" className="h-12 w-12 shrink-0 rounded-lg" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-white/[0.05]" />
        )}
        <div className="min-w-0">
          {track ? (
            <>
              <p className="truncate text-[13px] font-medium text-white" title={track.title}>
                {track.title}
              </p>
              {error ? (
                <p className="truncate text-xs text-red-300" title={error}>
                  {error}
                </p>
              ) : (
                <p className="truncate text-xs text-white/45">{track.artist ?? "—"}</p>
              )}
            </>
          ) : (
            <p className="truncate text-sm text-white/35">Nada en reproducción</p>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-0.5">
        <div className="flex items-center gap-2">
          <IconButton icon="shuffle" label={shuffle ? "Desactivar aleatorio" : "Aleatorio"} active={shuffle} onClick={actions.toggleShuffle} size={16} />
          <IconButton icon="previous" label="Anterior" disabled={!hasPrevious} onClick={actions.previous} />
          <button
            type="button"
            title={playing ? "Pausar" : "Reproducir"}
            aria-label={playing ? "Pausar" : "Reproducir"}
            disabled={!track}
            onClick={actions.toggle}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black outline-none transition enabled:hover:scale-105 enabled:active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-30"
          >
            <PlayerIcon name={playing ? "pause" : "play"} size={18} />
          </button>
          <IconButton icon="next" label="Siguiente" disabled={!hasNext} onClick={actions.next} />
          <IconButton
            icon={repeat === "one" ? "repeat-one" : "repeat"}
            label={repeat === "off" ? "Repetir todas" : repeat === "all" ? "Repetir una" : "No repetir"}
            active={repeat !== "off"}
            onClick={actions.cycleRepeat}
            size={16}
          />
        </div>
        <Progress />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <IconButton icon={volumeIcon} label={muted ? "Activar sonido" : "Silenciar"} onClick={actions.toggleMute} />
        <Slider
          value={muted ? 0 : volume}
          max={1}
          onCommit={actions.setVolume}
          label="Volumen"
          valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
          className="hidden w-24 lg:block"
        />
        <IconButton icon="queue" label="Cola" active={queueOpen} onClick={() => setQueueOpen(!queueOpen)} />
        <IconButton icon="mini" label="Mini reproductor" onClick={() => desktop()?.mini.open()} />
      </div>
    </footer>
  );
}
