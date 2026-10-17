"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { desktop } from "@/lib/desktop";
import { formatDuration } from "@/lib/format";
import type { PlayerCommand, PlayerSnapshot } from "@/lib/player/types";
import { LibraryThumb } from "../library/LibraryThumb";
import { PlayerIcon, type PlayerIconName } from "../player/PlayerIcon";
import { Slider } from "../player/Slider";

/**
 * Shorter than this it's a bar (one row, like Spotify's compact mini
 * player); from here up, a card with a big cover.
 */
const CARD_MIN_HEIGHT = 150;

// Bar: the title's share is set with the handle between it and the controls.
const SPLITTER_WIDTH = 12;
const TITLE_MIN_WIDTH = 56;
// The space the handle frees shows the progress bar, once it's this wide.
const PROGRESS_MIN_WIDTH = 80;

// Widths in the bar, in px, matching the classes below; they decide which
// controls fit. Bar: pl-2 pr-1.5, gap-2 between its four parts.
const BAR_PADDING = 8 + 6;
const BAR_GAP = 8;
const GRIP_COLUMN = 12;
const COVER_MAX = 72;
const BUTTON = 28; // h-7 w-7
const PLAY = 36; // h-9 w-9
const CONTROL_GAP = 4; // gap-1
const VOLUME_SLIDER = 72;
const EXPAND = 24;

/** What the bar shows, from everything down to the bare minimum. */
interface BarControls {
  shuffle: boolean;
  volume: boolean;
  volumeSlider: boolean;
  expand: boolean;
  /** The title and its handle; without them it's just the cover and the buttons. */
  title: boolean;
}
// Narrowing the window takes things away in this order: the volume slider,
// 🔀, ⤢, the speaker, and last the title. ⏮ ⏯ ⏭ always stay: at its
// smallest the mini is just those (as the user asked).
const BAR_LEVELS: BarControls[] = [
  {
    shuffle: true,
    volume: true,
    volumeSlider: true,
    expand: true,
    title: true,
  },
  {
    shuffle: true,
    volume: true,
    volumeSlider: false,
    expand: true,
    title: true,
  },
  {
    shuffle: false,
    volume: true,
    volumeSlider: false,
    expand: true,
    title: true,
  },
  {
    shuffle: false,
    volume: true,
    volumeSlider: false,
    expand: false,
    title: true,
  },
  {
    shuffle: false,
    volume: false,
    volumeSlider: false,
    expand: false,
    title: true,
  },
  {
    shuffle: false,
    volume: false,
    volumeSlider: false,
    expand: false,
    title: false,
  },
];

function controlsWidth(c: BarControls): number {
  const transport = [c.shuffle && BUTTON, BUTTON /* ⏮ */, PLAY, BUTTON /* ⏭ */].filter((w): w is number => typeof w === "number");
  const groups = [
    transport.reduce((sum, w) => sum + w, 0) + (transport.length - 1) * CONTROL_GAP,
    c.volume && BUTTON + (c.volumeSlider ? CONTROL_GAP + VOLUME_SLIDER : 0),
    c.expand && EXPAND,
  ].filter((w): w is number => typeof w === "number");
  // The groups sit gap-2 apart.
  return groups.reduce((sum, w) => sum + w, 0) + (groups.length - 1) * BAR_GAP;
}

/** The most that fits beside the cover (and the title at its shortest). */
function barControls(width: number, height: number): BarControls {
  const cover = Math.min(COVER_MAX, height - 16);
  const base = width - BAR_PADDING - GRIP_COLUMN - cover - 2 * BAR_GAP;
  const room = (c: BarControls) => (c.title ? base - BAR_GAP - TITLE_MIN_WIDTH - SPLITTER_WIDTH : base);
  return BAR_LEVELS.find((level) => controlsWidth(level) <= room(level)) ?? BAR_LEVELS[BAR_LEVELS.length - 1];
}
const TITLE_WIDTH_KEY = "fetchly.mini.titleWidth";

// --- window size, as an external store --------------------------------------

function subscribeToSize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
const sizeSnapshot = () => `${window.innerWidth}x${window.innerHeight}`;
const serverSizeSnapshot = () => "480x96";

function useWindowSize() {
  const [width, height] = useSyncExternalStore(subscribeToSize, sizeSnapshot, serverSizeSnapshot).split("x").map(Number);
  return { width, height };
}

/** The element's width, kept current as it resizes. */
function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// --- the mirrored player state ----------------------------------------------

function useMirroredPlayer() {
  const [player, setPlayer] = useState<PlayerSnapshot | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const mini = desktop()?.mini;
    if (!mini) return;
    let live = true;
    const unsubscribe = mini.onState((state) => setPlayer(state));
    void mini.getState().then((initial) => {
      if (live && initial) setPlayer((current) => current ?? initial.player);
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

  return { player, position };
}

const send = (command: PlayerCommand) => desktop()?.mini.command(command);
const showApp = () => desktop()?.mini.showApp();

// --- the remembered title width (bar) ---------------------------------------

function readTitleWidth(): number | null {
  try {
    const value = Number(window.localStorage.getItem(TITLE_WIDTH_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function saveTitleWidth(value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(TITLE_WIDTH_KEY);
    else window.localStorage.setItem(TITLE_WIDTH_KEY, String(Math.round(value)));
  } catch {
    // only a convenience
  }
}

// --- pieces -------------------------------------------------------------------

function Button({
  icon,
  label,
  onClick,
  size = 16,
  disabled,
  className,
}: {
  icon: PlayerIconName;
  label: string;
  onClick: () => void;
  size?: number;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`no-drag flex shrink-0 items-center justify-center rounded-full text-white/70 outline-none transition enabled:hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:cursor-default disabled:opacity-30 ${
        className ?? "h-7 w-7"
      }`}
    >
      <PlayerIcon name={icon} size={size} />
    </button>
  );
}

function PlayButton({ player, big }: { player: PlayerSnapshot | null; big?: boolean }) {
  return (
    <button
      type="button"
      title={player?.playing ? "Pausar" : "Reproducir"}
      aria-label={player?.playing ? "Pausar" : "Reproducir"}
      disabled={!player?.track}
      onClick={() => send({ type: "toggle" })}
      className={`no-drag flex shrink-0 items-center justify-center rounded-full bg-white text-black outline-none transition enabled:hover:scale-105 enabled:active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-30 ${
        big ? "h-12 w-12" : "h-9 w-9"
      }`}
    >
      <PlayerIcon name={player?.playing ? "pause" : "play"} size={big ? 22 : 16} />
    </button>
  );
}

/** 🔀: shuffled, or in the order of the list. Accent-colored with a dot while on, like the main bar's. */
function ShuffleButton({ player, big }: { player: PlayerSnapshot | null; big?: boolean }) {
  const on = player?.shuffle ?? false;
  const label = on ? "Desactivar aleatorio" : "Aleatorio";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={!player?.track}
      onClick={() => send({ type: "toggleShuffle" })}
      className={`no-drag relative flex shrink-0 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:cursor-default disabled:opacity-30 ${
        big ? "h-10 w-10" : "h-7 w-7"
      } ${on ? "text-[var(--accent)]" : "text-white/70 enabled:hover:text-white"}`}
    >
      <PlayerIcon name="shuffle" size={big ? 19 : 15} />
      {on && <span className={`absolute h-1 w-1 rounded-full bg-[var(--accent)] ${big ? "bottom-0.5" : "-bottom-0.5"}`} />}
    </button>
  );
}

function Transport({
  player,
  big,
  withPrevious = true,
  withShuffle = true,
}: {
  player: PlayerSnapshot | null;
  big?: boolean;
  withPrevious?: boolean;
  withShuffle?: boolean;
}) {
  const iconSize = big ? 22 : 16;
  const buttonClass = big ? "h-10 w-10" : "h-7 w-7";
  return (
    <div className={`flex shrink-0 items-center ${big ? "gap-3" : "gap-1"}`}>
      {withShuffle && <ShuffleButton player={player} big={big} />}
      {withPrevious && (
        <Button
          icon="previous"
          label="Anterior"
          size={iconSize}
          className={buttonClass}
          disabled={!player?.hasPrevious}
          onClick={() => send({ type: "previous" })}
        />
      )}
      <PlayButton player={player} big={big} />
      <Button
        icon="next"
        label="Siguiente"
        size={iconSize}
        className={buttonClass}
        disabled={!player?.hasNext}
        onClick={() => send({ type: "next" })}
      />
    </div>
  );
}

/** The red dot that hides the mini player (the music keeps going). */
function CloseDot() {
  return (
    <button
      type="button"
      title="Cerrar mini reproductor"
      aria-label="Cerrar mini reproductor"
      onClick={() => desktop()?.mini.close()}
      className="no-drag group/close flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-[#ff5f57] outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 transition group-hover/close:opacity-100" aria-hidden>
        <path d="M1 1l4 4M5 1L1 5" stroke="#5a0b07" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** The dotted handle the window is dragged by. */
function Grip({ vertical }: { vertical?: boolean }) {
  const dots = vertical
    ? [0, 1, 2].flatMap((row) => [0, 1].map((col) => [col * 4 + 1.5, row * 4 + 1.5]))
    : [0, 1].flatMap((row) => [0, 1, 2, 3].map((col) => [col * 4 + 1.5, row * 4 + 1.5]));
  const width = vertical ? 7 : 15;
  const height = vertical ? 11 : 7;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 text-white/35" aria-hidden>
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.1" fill="currentColor" />
      ))}
    </svg>
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
    <div className="flex w-full items-center gap-2 text-[10px] tabular-nums text-white/70">
      <span>{formatDuration(player?.track ? position : 0) ?? "0:00"}</span>
      {slider}
      <span>{formatDuration(player?.track ? duration : 0) ?? "0:00"}</span>
    </div>
  );
}

function Volume({
  player,
  sliderClassName = "w-[72px]",
  withSlider = true,
}: {
  player: PlayerSnapshot | null;
  sliderClassName?: string;
  /** Without it, just the speaker (a click mutes). */
  withSlider?: boolean;
}) {
  const volume = player?.volume ?? 1;
  const muted = player?.muted ?? false;
  const icon: PlayerIconName = muted || volume === 0 ? "volume-off" : volume < 0.5 ? "volume-low" : "volume";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button icon={icon} label={muted ? "Activar sonido" : "Silenciar"} onClick={() => send({ type: "toggleMute" })} />
      {withSlider && (
        <Slider
          value={muted ? 0 : volume}
          max={1}
          onCommit={(value) => send({ type: "volume", volume: value })}
          label="Volumen"
          valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
          className={`no-drag ${sliderClassName}`}
        />
      )}
    </div>
  );
}

function Cover({ player, className }: { player: PlayerSnapshot | null; className: string }) {
  const track = player?.track;
  if (!track) return <div className={`bg-white/[0.06] ${className}`} />;
  return <LibraryThumb id={track.id} hasThumbnail={track.hasThumbnail} fallbackIcon="music" className={className} />;
}

/**
 * One line of text that ends in "…" when it doesn't fit, and slides across
 * to show the rest while hovered (it has to sit outside the drag area:
 * Windows doesn't report hover over it).
 */
function Marquee({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [shift, setShift] = useState(0);
  const style = {
    "--marquee-shift": `-${shift}px`,
    "--marquee-duration": `${Math.max(3, shift / 30)}s`,
  } as CSSProperties;
  return (
    <p
      ref={ref}
      title={text}
      onMouseEnter={() => {
        const el = ref.current;
        if (el) setShift(Math.max(0, el.scrollWidth - el.clientWidth));
      }}
      onMouseLeave={() => setShift(0)}
      className={`no-drag overflow-hidden whitespace-nowrap ${shift > 0 ? "" : "text-ellipsis"} ${className}`}
    >
      {shift > 0 ? (
        <span className="mini-marquee inline-block" style={style}>
          {text}
        </span>
      ) : (
        text
      )}
    </p>
  );
}

function Titles({ player }: { player: PlayerSnapshot | null }) {
  const track = player?.track;
  if (!track) return <p className="truncate text-[13px] font-medium text-white/35">Nada en reproducción</p>;
  return (
    <div className="min-w-0">
      <Marquee text={track.title} className="text-[13px] font-semibold leading-tight text-white" />
      {/* No artist: just the title, rather than a "—". */}
      {track.artist && <Marquee text={track.artist} className="mt-0.5 text-[11px] leading-tight text-white/55" />}
    </div>
  );
}

/** Between the title and the controls: drag it to choose how much of the title shows. */
function Splitter({ value, max, onChange }: { value: number; max: number; onChange: (value: number | null, done: boolean) => void }) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(TITLE_MIN_WIDTH, n));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del título (doble clic: todo el título)"
      aria-valuemin={TITLE_MIN_WIDTH}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title="Arrastra para cambiar cuánto se ve del título. Doble clic: todo el título."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startWidth: value };
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(clamp(drag.current.startWidth + e.clientX - drag.current.startX), false);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        onChange(clamp(drag.current.startWidth + e.clientX - drag.current.startX), true);
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onChange(null, true)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(clamp(value + (e.key === "ArrowLeft" ? -16 : 16)), true);
        }
      }}
      style={{ width: SPLITTER_WIDTH }}
      className="no-drag group/split flex h-10 shrink-0 cursor-col-resize items-center justify-center outline-none"
    >
      <span className="h-9 w-[3px] rounded-full bg-white/15 transition group-hover/split:bg-white/50 group-focus-visible/split:bg-[var(--accent)]" />
    </div>
  );
}

// --- the two shapes -------------------------------------------------------------

/**
 * Short window: ● ⠿ | cover · title ┃ (progress) | 🔀 ⏮ ⏯ ⏭ | 🔊 ━━ | ⤢,
 * like Spotify's. The controls come first; the handle ┃ sets how much of
 * the title shows, and the room that frees in the middle holds the
 * progress bar once it's wide enough.
 */
function Bar({ player, position, width, height }: { player: PlayerSnapshot | null; position: number; width: number; height: number }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const regionWidth = useElementWidth(regionRef);
  const [savedTitleWidth, setSavedTitleWidth] = useState<number | null>(readTitleWidth);
  const controls = barControls(width, height);

  const maxTitle = Math.max(TITLE_MIN_WIDTH, regionWidth - SPLITTER_WIDTH);
  const titleWidth = savedTitleWidth === null ? maxTitle : Math.min(maxTitle, Math.max(TITLE_MIN_WIDTH, savedTitleWidth));
  const middle = Math.max(0, regionWidth - SPLITTER_WIDTH - titleWidth);
  const showProgress = middle >= PROGRESS_MIN_WIDTH + 8;

  return (
    <div className="flex h-full items-center gap-2 py-2 pl-2 pr-1.5">
      <div className="flex h-full max-h-16 shrink-0 flex-col items-center justify-between py-0.5">
        <CloseDot />
        <Grip vertical />
      </div>
      <div className="no-drag aspect-square h-full max-h-[72px] shrink-0" onDoubleClick={showApp} title="Doble clic: abrir Pista">
        <Cover player={player} className="h-full w-full rounded-md" />
      </div>
      <div ref={regionRef} className="flex min-w-0 flex-1 items-center">
        {controls.title && (
          <>
            <div style={{ width: titleWidth }} className="min-w-0 shrink-0">
              <Titles player={player} />
            </div>
            {player?.track && (
              <Splitter
                value={titleWidth}
                max={maxTitle}
                onChange={(value, done) => {
                  // Pulled all the way right: back to "the whole title", so it follows the window's width again.
                  const next = value !== null && value >= maxTitle - 1 ? null : value;
                  setSavedTitleWidth(next);
                  if (done) saveTitleWidth(next);
                }}
              />
            )}
            <div className="flex min-w-0 flex-1 items-center pl-1 pr-1">
              {showProgress && <Progress player={player} position={position} />}
            </div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Transport player={player} withShuffle={controls.shuffle} />
        {controls.volume && <Volume player={player} withSlider={controls.volumeSlider} />}
        {controls.expand && <Button icon="expand" label="Abrir Pista" size={14} className="h-6 w-6" onClick={showApp} />}
      </div>
    </div>
  );
}

/**
 * Tall window: ● ⠿ ⤢ on top, the cover filling the rest and the title
 * under it. Hovering the cover brings up the controls over it.
 */
function Card({ player, position, width, height }: { player: PlayerSnapshot | null; position: number; width: number; height: number }) {
  // As big as fits under the top strip and above the titles (~96 px of them).
  const side = Math.max(48, Math.min(width - 16, height - 96));
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="relative flex h-5 shrink-0 items-center justify-between px-0.5">
        <CloseDot />
        <div className="absolute left-1/2 -translate-x-1/2">
          <Grip />
        </div>
        <Button icon="expand" label="Abrir Pista" size={13} className="h-5 w-5" onClick={showApp} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          style={{ width: side, height: side }}
          className="no-drag group/cover relative overflow-hidden rounded-lg"
          title="Doble clic: abrir Pista"
          onDoubleClick={(e) => {
            // Not when double-clicking a control on top of it.
            if (!(e.target as HTMLElement).closest("button, input")) showApp();
          }}
        >
          <Cover player={player} className="h-full w-full" />
          {player?.track && (
            <div className="absolute inset-0 flex flex-col justify-between bg-black/60 p-3 opacity-0 transition-opacity group-focus-within/cover:opacity-100 group-hover/cover:opacity-100">
              <div className="flex justify-end">{side >= 160 && <Volume player={player} sliderClassName="w-14 mr-1" />}</div>
              <div className="flex justify-center">
                {/* With 🔀 the big buttons need ~210 px; below 160 px there's only room for ⏮ ⏯ ⏭. */}
                <Transport player={player} big={side >= 230} withShuffle={side >= 160} />
              </div>
              <Progress player={player} position={position} withTimes={side >= 160} />
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 px-1 pb-1" style={{ minHeight: 36 }}>
        <Titles player={player} />
      </div>
    </div>
  );
}

// --- the window ---------------------------------------------------------------

/**
 * The floating mini player, after Spotify's: a bar when the window is short,
 * a card with a big cover when it's tall. It's dragged by its empty areas
 * and the dotted handle. Nothing plays here; every button is a command to
 * the main window.
 */
export function MiniPlayer() {
  const { width, height } = useWindowSize();
  const { player, position } = useMirroredPlayer();

  return (
    <div className="drag relative h-full select-none overflow-hidden bg-[#121212] ring-1 ring-inset ring-white/[0.08]">
      {height < CARD_MIN_HEIGHT ? (
        <Bar player={player} position={position} width={width} height={height} />
      ) : (
        <Card player={player} position={position} width={width} height={height} />
      )}
    </div>
  );
}
