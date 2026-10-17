"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { libraryThumbnailUrl } from "@/lib/api";
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
const PROGRESS_MIN_WIDTH = 52;

// Widths in the bar, in px, matching the classes below; they decide which
// controls fit. Bar: pl-2 pr-1.5, gap-2 between its four parts.
const BAR_PADDING = 8 + 6;
const BAR_GAP = 8;
const GRIP_COLUMN = 12;
const COVER_MAX = 72;
const BUTTON = 28; // h-7 w-7
const PLAY = 36; // h-9 w-9
const CONTROL_GAP = 4; // gap-1
const VOLUME_SLIDER = 56; // w-14
// Narrower than that, the slider still shows when the handle leaves it this much room.
const VOLUME_SLIDER_MIN = 36;
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

/** ⏮ ⏯ ⏭ beside the title: the least the bar gives the controls while it shows a title. */
const TITLE_AND_TRANSPORT = BAR_LEVELS[BAR_LEVELS.length - 2];

/** Width for the title area and the controls together (with the gap between them). */
function barSpace(width: number, height: number): number {
  const cover = Math.min(COVER_MAX, height - 16);
  return width - BAR_PADDING - GRIP_COLUMN - cover - 2 * BAR_GAP;
}

/** The most that fits beside the cover (and the title at its shortest). */
function barControls(width: number, height: number): BarControls {
  const base = barSpace(width, height);
  const room = (c: BarControls) => (c.title ? base - BAR_GAP - TITLE_MIN_WIDTH - SPLITTER_WIDTH : base);
  return BAR_LEVELS.find((level) => controlsWidth(level) <= room(level)) ?? BAR_LEVELS[BAR_LEVELS.length - 1];
}

/**
 * How the bar splits its width. With no title width chosen, the controls
 * come first and the title takes the rest. Once the handle sets one, the
 * title keeps it and the controls get what's left: as many as fit, in the
 * same order as when the window narrows (⏮ ⏯ ⏭ always), and any room past
 * them holds the progress bar.
 */
function barLayout(width: number, height: number, chosenTitle: number | null) {
  const space = barSpace(width, height);
  const auto = barControls(width, height);
  // The handle can push the controls back down to ⏮ ⏯ ⏭, never further.
  const maxTitle = Math.max(TITLE_MIN_WIDTH, space - BAR_GAP - controlsWidth(TITLE_AND_TRANSPORT) - SPLITTER_WIDTH);
  if (!auto.title || chosenTitle === null) {
    const title = Math.max(TITLE_MIN_WIDTH, space - BAR_GAP - controlsWidth(auto) - SPLITTER_WIDTH);
    return { controls: auto, title, maxTitle, middle: 0, volumeSlider: VOLUME_SLIDER };
  }
  const title = Math.min(maxTitle, Math.max(TITLE_MIN_WIDTH, chosenTitle));
  const room = space - BAR_GAP - SPLITTER_WIDTH - title;
  let controls = BAR_LEVELS.find((level) => level.title && controlsWidth(level) <= room) ?? TITLE_AND_TRANSPORT;
  let middle = Math.max(0, room - controlsWidth(controls));
  // Room short of a full volume slider still fits a shorter one, so no gap is left empty.
  let volumeSlider = VOLUME_SLIDER;
  if (controls.volume && !controls.volumeSlider && middle >= CONTROL_GAP + VOLUME_SLIDER_MIN) {
    volumeSlider = Math.min(VOLUME_SLIDER, middle - CONTROL_GAP);
    controls = { ...controls, volumeSlider: true };
    middle -= CONTROL_GAP + volumeSlider;
  }
  return { controls, title, maxTitle, middle, volumeSlider };
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

/** A button that stays on (🔀, 🔁): accent-colored with a dot while on, like the main bar's. */
function ModeButton({
  icon,
  label,
  on,
  disabled,
  onClick,
  big,
}: {
  icon: PlayerIconName;
  label: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`no-drag relative flex shrink-0 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 disabled:cursor-default disabled:opacity-30 ${
        big ? "h-10 w-10" : "h-7 w-7"
      } ${on ? "text-[var(--accent)]" : "text-white/70 enabled:hover:text-white"}`}
    >
      <PlayerIcon name={icon} size={big ? 19 : 15} />
      {on && <span className={`absolute h-1 w-1 rounded-full bg-[var(--accent)] ${big ? "bottom-0.5" : "-bottom-0.5"}`} />}
    </button>
  );
}

/** 🔀: shuffled, or in the order of the list. */
function ShuffleButton({ player, big }: { player: PlayerSnapshot | null; big?: boolean }) {
  const on = player?.shuffle ?? false;
  return (
    <ModeButton
      icon="shuffle"
      label={on ? "Desactivar aleatorio" : "Aleatorio"}
      on={on}
      disabled={!player?.track}
      onClick={() => send({ type: "toggleShuffle" })}
      big={big}
    />
  );
}

/** 🔁: off → the whole list → this song → off, as in the main bar. */
function RepeatButton({ player, big }: { player: PlayerSnapshot | null; big?: boolean }) {
  const repeat = player?.repeat ?? "off";
  return (
    <ModeButton
      icon={repeat === "one" ? "repeat-one" : "repeat"}
      label={repeat === "off" ? "Repetir todas" : repeat === "all" ? "Repetir una" : "No repetir"}
      on={repeat !== "off"}
      disabled={!player?.track}
      onClick={() => send({ type: "cycleRepeat" })}
      big={big}
    />
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

function Progress({ player, position }: { player: PlayerSnapshot | null; position: number }) {
  const duration = player?.duration ?? 0;
  return (
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
}

function volumeIcon(player: PlayerSnapshot | null): PlayerIconName {
  const volume = player?.volume ?? 1;
  return player?.muted || volume === 0 ? "volume-off" : volume < 0.5 ? "volume-low" : "volume";
}

function Volume({
  player,
  sliderClassName = "w-14",
  sliderWidth,
  withSlider = true,
}: {
  player: PlayerSnapshot | null;
  sliderClassName?: string;
  /** In px, instead of sliderClassName's width. */
  sliderWidth?: number;
  /** Without it, just the speaker (a click mutes). */
  withSlider?: boolean;
}) {
  const volume = player?.volume ?? 1;
  const muted = player?.muted ?? false;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button icon={volumeIcon(player)} label={muted ? "Activar sonido" : "Silenciar"} onClick={() => send({ type: "toggleMute" })} />
      {withSlider && (
        <div className={`flex shrink-0 ${sliderWidth === undefined ? sliderClassName : ""}`} style={sliderWidth === undefined ? undefined : { width: sliderWidth }}>
          <Slider
            value={muted ? 0 : volume}
            max={1}
            onCommit={(value) => send({ type: "volume", volume: value })}
            label="Volumen"
            valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
            className="no-drag w-full"
          />
        </div>
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
      className="no-drag group/split flex h-full max-h-10 shrink-0 cursor-col-resize items-center justify-center outline-none"
    >
      <span className="h-[calc(100%-4px)] max-h-9 w-[3px] rounded-full bg-white/15 transition group-hover/split:bg-white/50 group-focus-visible/split:bg-[var(--accent)]" />
    </div>
  );
}

// --- the two shapes -------------------------------------------------------------

/**
 * Short window: ● ⠿ | cover · title ┃ (progress) | 🔀 ⏮ ⏯ ⏭ | 🔊 ━━ | ⤢,
 * like Spotify's. The handle ┃ splits the width between the title and the
 * controls (see barLayout): dragged left it brings controls back, then the
 * progress bar; dragged right it takes them away. Double click: automatic.
 */
function Bar({ player, position, width, height }: { player: PlayerSnapshot | null; position: number; width: number; height: number }) {
  const [savedTitleWidth, setSavedTitleWidth] = useState<number | null>(readTitleWidth);
  const { controls, title: titleWidth, maxTitle, middle, volumeSlider } = barLayout(width, height, savedTitleWidth);
  // The middle has pl-1 pr-1.
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
      <div className="flex h-full min-w-0 flex-1 items-center">
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
                  setSavedTitleWidth(value);
                  if (done) saveTitleWidth(value);
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
        {controls.volume && <Volume player={player} withSlider={controls.volumeSlider} sliderWidth={volumeSlider} />}
        {controls.expand && <Button icon="expand" label="Abrir Pista" size={14} className="h-6 w-6" onClick={showApp} />}
      </div>
    </div>
  );
}

/**
 * The cover's average color, leaning to its most colorful pixels and
 * darkened so white text stays readable on it: the card's backdrop, like
 * Spotify's. Null until it's read (and for songs without a cover).
 */
function useCoverColor(id: string | null, hasThumbnail: boolean): string | null {
  const [color, setColor] = useState<{ id: string; value: string } | null>(null);
  useEffect(() => {
    if (!id || !hasThumbnail) return;
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (!live) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, 16, 16);
        const data = context.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const weight = 1 + (Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])) / 24;
          r += data[i] * weight;
          g += data[i + 1] * weight;
          b += data[i + 2] * weight;
          total += weight;
        }
        const peak = Math.max(r, g, b, 1) / total;
        const k = Math.min(0.8, 130 / peak) / total;
        setColor({ id, value: `rgb(${Math.round(r * k)} ${Math.round(g * k)} ${Math.round(b * k)})` });
      } catch {
        // Only a backdrop: the plain one stays.
      }
    };
    image.src = libraryThumbnailUrl(id);
    return () => {
      live = false;
    };
  }, [id, hasThumbnail]);
  return color && color.id === id ? color.value : null;
}

// The card's row of controls: 🔊 🔀 ⏮ ⏯ ⏭ 🔁, big or small (px, matching the classes).
const CARD_BUTTON = { big: 40, small: 28 };
const CARD_PLAY = { big: 48, small: 36 };
const CARD_GAP = { big: 12, small: 8 };

interface CardRow {
  big: boolean;
  volume: boolean;
  shuffle: boolean;
  repeat: boolean;
}
// Narrower takes away 🔁, then 🔊, then 🔀; ⏮ ⏯ ⏭ always stay.
const CARD_LEVELS = [
  { volume: true, shuffle: true, repeat: true },
  { volume: true, shuffle: true, repeat: false },
  { volume: false, shuffle: true, repeat: false },
  { volume: false, shuffle: false, repeat: false },
];

/** The biggest, fullest row that fits across the panel (with 12 px each side). */
function cardRow(panelWidth: number): CardRow {
  for (const big of [true, false]) {
    const size = big ? "big" : "small";
    for (const level of CARD_LEVELS) {
      const buttons = 2 + Number(level.volume) + Number(level.shuffle) + Number(level.repeat);
      if (buttons * CARD_BUTTON[size] + CARD_PLAY[size] + buttons * CARD_GAP[size] <= panelWidth - 24) return { big, ...level };
    }
  }
  return { big: false, ...CARD_LEVELS[CARD_LEVELS.length - 1] };
}

/** 🔊 in the card: a click mutes; resting on it shows the volume slider above. */
function CardVolume({ player, big }: { player: PlayerSnapshot | null; big: boolean }) {
  const volume = player?.volume ?? 1;
  const muted = player?.muted ?? false;
  return (
    <div className="group/vol relative flex shrink-0">
      <Button
        icon={volumeIcon(player)}
        label={muted ? "Activar sonido" : "Silenciar"}
        size={big ? 20 : 16}
        className={big ? "h-10 w-10" : "h-7 w-7"}
        onClick={() => send({ type: "toggleMute" })}
      />
      {/* pb-1.5 rather than a margin, so the pointer doesn't drop out on its way up. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 pb-1.5 opacity-0 transition-opacity group-focus-within/vol:pointer-events-auto group-focus-within/vol:opacity-100 group-hover/vol:pointer-events-auto group-hover/vol:opacity-100">
        <div className="rounded-full bg-black/85 px-3 py-2 shadow-lg">
          <Slider
            value={muted ? 0 : volume}
            max={1}
            onCommit={(value) => send({ type: "volume", volume: value })}
            label="Volumen"
            valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
            className="no-drag w-20"
          />
        </div>
      </div>
    </div>
  );
}

function CardControls({ player, row }: { player: PlayerSnapshot | null; row: CardRow }) {
  const iconSize = row.big ? 22 : 16;
  const buttonClass = row.big ? "h-10 w-10" : "h-7 w-7";
  return (
    <div className={`flex items-center ${row.big ? "gap-3" : "gap-2"}`}>
      {row.volume && <CardVolume player={player} big={row.big} />}
      {row.shuffle && <ShuffleButton player={player} big={row.big} />}
      <Button
        icon="previous"
        label="Anterior"
        size={iconSize}
        className={buttonClass}
        disabled={!player?.hasPrevious}
        onClick={() => send({ type: "previous" })}
      />
      <PlayButton player={player} big={row.big} />
      <Button icon="next" label="Siguiente" size={iconSize} className={buttonClass} disabled={!player?.hasNext} onClick={() => send({ type: "next" })} />
      {row.repeat && <RepeatButton player={player} big={row.big} />}
    </div>
  );
}

// Under the panel: the title (one line) and the artist.
const CARD_TITLES_HEIGHT = 46;

function CardTitles({ player, big }: { player: PlayerSnapshot | null; big: boolean }) {
  const track = player?.track;
  if (!track) return <p className="truncate text-sm font-medium text-white/35">Nada en reproducción</p>;
  return (
    <div className="min-w-0">
      <Marquee text={track.title} className={`font-bold leading-snug text-white ${big ? "text-[17px]" : "text-[14px]"}`} />
      {track.artist && <Marquee text={track.artist} className={`leading-snug text-white/55 ${big ? "text-[13px]" : "text-[12px]"}`} />}
    </div>
  );
}

/**
 * Tall window, after Spotify's: ● ⠿ ⤢ on top, then a panel tinted with the
 * cover's color and the cover on it, and the title and artist under it.
 * Resting on the panel darkens it and brings up one centered row of
 * controls, with the progress bar and its times along the bottom.
 */
function Card({ player, position, width, height }: { player: PlayerSnapshot | null; position: number; width: number; height: number }) {
  const track = player?.track ?? null;
  const tint = useCoverColor(track?.id ?? null, track?.hasThumbnail ?? false);
  // p-2, the 20 px top strip and the titles, with gap-2 between the three.
  const panelWidth = width - 16;
  const panelHeight = height - 16 - 20 - CARD_TITLES_HEIGHT - 16;
  // A margin all round, a little more at the sides, like Spotify's.
  const side = Math.max(40, Math.min(panelWidth - 56, panelHeight - 40));
  const row = cardRow(panelWidth);
  const duration = player?.duration ?? 0;
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="relative flex h-5 shrink-0 items-center justify-between px-0.5">
        <CloseDot />
        <div className="absolute left-1/2 -translate-x-1/2">
          <Grip />
        </div>
        <Button icon="expand" label="Abrir Pista" size={13} className="h-5 w-5" onClick={showApp} />
      </div>
      <div
        style={{ backgroundColor: tint ?? "rgb(38 38 42)" }}
        className="no-drag group/cover relative min-h-0 flex-1 overflow-hidden rounded-lg transition-colors duration-700"
        title="Doble clic: abrir Pista"
        onDoubleClick={(e) => {
          // Not when double-clicking a control on top of it.
          if (!(e.target as HTMLElement).closest("button, input, [role='slider']")) showApp();
        }}
      >
        <div className="flex h-full items-center justify-center">
          <div style={{ width: side, height: side }} className="overflow-hidden rounded-md shadow-xl shadow-black/50">
            <Cover player={player} className="h-full w-full" />
          </div>
        </div>
        {track && (
          <div className="absolute inset-0 flex flex-col bg-black/55 px-3 pb-3 opacity-0 transition-opacity group-focus-within/cover:opacity-100 group-hover/cover:opacity-100">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <CardControls player={player} row={row} />
            </div>
            <div className="mb-1.5 flex justify-between text-[11px] tabular-nums text-white/80">
              <span>{formatDuration(position) ?? "0:00"}</span>
              <span>{formatDuration(duration) ?? "0:00"}</span>
            </div>
            <div className="flex">
              <Progress player={player} position={position} />
            </div>
          </div>
        )}
      </div>
      <div className="shrink-0 overflow-hidden px-1" style={{ height: CARD_TITLES_HEIGHT }}>
        <CardTitles player={player} big={width >= 260} />
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
