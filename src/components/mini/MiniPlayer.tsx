"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import type { PlayerCommand, PlayerSnapshot } from "@/lib/player/types";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayerIcon, type PlayerIconName } from "../player/PlayerIcon";
import { Slider } from "../player/Slider";

type Layout = "small" | "medium" | "large";

/** Below this height there's only room for one row; from LARGE_MIN on both sides, the big cover. */
const MEDIUM_MIN_HEIGHT = 112;
const LARGE_MIN = 240;

function layoutFor(width: number, height: number): Layout {
  if (height < MEDIUM_MIN_HEIGHT) return "small";
  if (height >= LARGE_MIN && width >= LARGE_MIN) return "large";
  return "medium";
}

// --- window size, as an external store --------------------------------------

function subscribeToSize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
const sizeSnapshot = () => `${window.innerWidth}x${window.innerHeight}`;
const serverSizeSnapshot = () => "400x128";

function useWindowSize() {
  const [width, height] = useSyncExternalStore(subscribeToSize, sizeSnapshot, serverSizeSnapshot).split("x").map(Number);
  return { width, height };
}

// --- the mirrored player state ----------------------------------------------

function useMirroredPlayer() {
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null);
  const [pinned, setPinnedState] = useState(true);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const mini = desktop()?.mini;
    if (!mini) return;
    let live = true;
    const unsubscribe = mini.onState((state) => setPlayer(state));
    void mini.getState().then((initial) => {
      if (!live || !initial) return;
      setPlayer((current) => current ?? initial.player);
      setPinnedState(initial.pinned);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  // The snapshot only says where the song was at positionAt; move the clock on from there.
  const playing = player?.playing ?? false;
  useEffect(() => {
    if (!playing) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 250);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [playing, player?.positionAt]);

  let position = player?.position ?? 0;
  if (player?.playing && now > player.positionAt) position += (now - player.positionAt) / 1000;
  if (player?.duration) position = Math.min(position, player.duration);

  const setPinned = (next: boolean) => {
    setPinnedState(next);
    void desktop()
      ?.mini.setPinned(next)
      .then((actual) => setPinnedState(actual));
  };

  return { player, position, pinned, setPinned };
}

const send = (command: PlayerCommand) => desktop()?.mini.command(command);

// --- pieces -------------------------------------------------------------------

function Button({
  icon,
  label,
  onClick,
  size = 16,
  active,
  disabled,
  className,
}: {
  icon: PlayerIconName;
  label: string;
  onClick: () => void;
  size?: number;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`no-drag flex shrink-0 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:cursor-default disabled:opacity-30 ${
        active ? "text-[var(--accent)]" : "text-white/60 enabled:hover:text-white"
      } ${className ?? "h-7 w-7"}`}
    >
      <PlayerIcon name={icon} size={size} />
    </button>
  );
}

function Transport({ player, big }: { player: PlayerSnapshot | null; big?: boolean }) {
  const hasTrack = Boolean(player?.track);
  return (
    <div className={`flex shrink-0 items-center ${big ? "gap-4" : "gap-1"}`}>
      <Button
        icon="previous"
        label="Anterior"
        size={big ? 22 : 16}
        className={big ? "h-10 w-10" : "h-7 w-7"}
        disabled={!player?.hasPrevious}
        onClick={() => send({ type: "previous" })}
      />
      <button
        type="button"
        title={player?.playing ? "Pausar" : "Reproducir"}
        aria-label={player?.playing ? "Pausar" : "Reproducir"}
        disabled={!hasTrack}
        onClick={() => send({ type: "toggle" })}
        className={`no-drag flex shrink-0 items-center justify-center rounded-full bg-white text-black outline-none transition enabled:hover:scale-105 enabled:active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-30 ${
          big ? "h-12 w-12" : "h-8 w-8"
        }`}
      >
        <PlayerIcon name={player?.playing ? "pause" : "play"} size={big ? 22 : 16} />
      </button>
      <Button
        icon="next"
        label="Siguiente"
        size={big ? 22 : 16}
        className={big ? "h-10 w-10" : "h-7 w-7"}
        disabled={!player?.hasNext}
        onClick={() => send({ type: "next" })}
      />
    </div>
  );
}

function WindowButtons({ pinned, setPinned }: { pinned: boolean; setPinned: (pinned: boolean) => void }) {
  const mini = desktop()?.mini;
  return (
    <div className="flex shrink-0 items-center">
      <Button
        icon="pin"
        label={pinned ? "Dejar de fijar encima" : "Fijar siempre encima"}
        active={pinned}
        size={14}
        className="h-6 w-6"
        onClick={() => setPinned(!pinned)}
      />
      <Button icon="expand" label="Abrir Fetchly" size={14} className="h-6 w-6" onClick={() => mini?.showApp()} />
      <Button icon="close" label="Cerrar mini reproductor" size={14} className="h-6 w-6" onClick={() => mini?.close()} />
    </div>
  );
}

function Progress({ player, position, withTimes }: { player: PlayerSnapshot | null; position: number; withTimes?: boolean }) {
  const duration = player?.duration ?? 0;
  const slider = (
    <Slider
      value={position}
      max={duration}
      disabled={!player?.track || duration <= 0}
      onCommit={(seconds) => send({ type: "seek", seconds })}
      label="Posición"
      valueText={`${formatDuration(position) ?? "0:00"} de ${formatDuration(duration) ?? "0:00"}`}
      className="no-drag min-w-0 flex-1"
    />
  );
  if (!withTimes) return slider;
  return (
    <div className="flex w-full items-center gap-2 text-[11px] tabular-nums text-white/45">
      <span className="w-9 text-right">{formatDuration(player?.track ? position : 0) ?? "0:00"}</span>
      {slider}
      <span className="w-9">{formatDuration(player?.track ? duration : 0) ?? "0:00"}</span>
    </div>
  );
}

function Volume({ player }: { player: PlayerSnapshot | null }) {
  const volume = player?.volume ?? 1;
  const muted = player?.muted ?? false;
  const icon: PlayerIconName = muted || volume === 0 ? "volume-off" : volume < 0.5 ? "volume-low" : "volume";
  return (
    <div className="flex shrink-0 items-center">
      <Button icon={icon} label={muted ? "Activar sonido" : "Silenciar"} onClick={() => send({ type: "toggleMute" })} />
      <Slider
        value={muted ? 0 : volume}
        max={1}
        onCommit={(value) => send({ type: "volume", volume: value })}
        label="Volumen"
        valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
        className="no-drag w-16"
      />
    </div>
  );
}

function Cover({ player, className }: { player: PlayerSnapshot | null; className: string }) {
  const track = player?.track;
  if (!track) return <div className={`bg-white/[0.05] ${className}`} />;
  return <LibraryThumb id={track.id} hasThumbnail={track.hasThumbnail} fallbackIcon="music" className={className} />;
}

function Titles({ player, center }: { player: PlayerSnapshot | null; center?: boolean }) {
  const track = player?.track;
  return (
    <div className={`min-w-0 ${center ? "text-center" : ""}`}>
      <p className={`truncate text-[13px] font-medium ${track ? "text-white" : "text-white/35"}`} title={track?.title}>
        {track?.title ?? "Nada en reproducción"}
      </p>
      {track && <p className="truncate text-xs text-white/45">{track.artist ?? "—"}</p>}
    </div>
  );
}

// --- the window ---------------------------------------------------------------

/**
 * The floating mini player. The whole window drags (buttons and sliders
 * excepted) and its layout follows its size: one row when it's short, a bar
 * with progress and volume in between, and a big cover when it's roughly
 * square. Nothing plays here; every button is a command to the main window.
 */
export function MiniPlayer() {
  const { width, height } = useWindowSize();
  const { player, position, pinned, setPinned } = useMirroredPlayer();
  const layout = layoutFor(width, height);

  return (
    <div className="drag group relative h-full select-none overflow-hidden bg-[#121216] ring-1 ring-inset ring-white/[0.08]">
      {layout === "small" && (
        <div className="flex h-full items-center gap-2 p-2">
          <Cover player={player} className="aspect-square h-full max-h-14 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">{width >= 300 && <Titles player={player} />}</div>
          <Transport player={player} />
          {/* Window controls appear on hover; there's no room to keep them. */}
          <div className="absolute right-1 top-1 rounded-full bg-[#121216]/90 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <WindowButtons pinned={pinned} setPinned={setPinned} />
          </div>
        </div>
      )}

      {layout === "medium" && (
        <div className="flex h-full items-center gap-3 p-3">
          <Cover player={player} className="aspect-square h-full max-h-[104px] shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <Titles player={player} />
              </div>
              <WindowButtons pinned={pinned} setPinned={setPinned} />
            </div>
            <div className="flex items-center gap-2">
              <Transport player={player} />
              <Progress player={player} position={position} />
              {width >= 380 && <Volume player={player} />}
            </div>
          </div>
        </div>
      )}

      {layout === "large" && (
        <div className="flex h-full flex-col items-center px-4 pb-4 pt-2">
          <div className="flex w-full justify-end">
            <WindowButtons pinned={pinned} setPinned={setPinned} />
          </div>
          <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
            {/* Square, as big as fits above the titles and controls (~190 px of them). */}
            <div style={{ width: Math.max(48, Math.min(width - 32, height - 190)) }} className="aspect-square">
              <Cover player={player} className="h-full w-full rounded-xl shadow-2xl shadow-black/50" />
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="w-full">
              <Titles player={player} center />
            </div>
            <Progress player={player} position={position} withTimes />
            <Transport player={player} big />
          </div>
        </div>
      )}
    </div>
  );
}
