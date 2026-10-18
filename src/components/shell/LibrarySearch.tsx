"use client";

import { useId, useMemo, useRef, useState } from "react";
import { fetchLibrary } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { LibraryEntry } from "@/lib/library/types";
import { toTrack, toVideoTrack } from "@/lib/player/types";
import { LibraryThumb } from "../library/LibraryThumb";
import { usePlayer } from "../player/PlayerProvider";
import { NavIcon } from "./NavIcon";

const MAX_PER_GROUP = 5;

type Result = { kind: "music" | "video"; entry: LibraryEntry };

/** Lowercase and without accents, so "cancion" finds "Canción". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function matches(entry: LibraryEntry, words: string[]): boolean {
  const haystack = fold(`${entry.title} ${entry.artist ?? ""}`);
  return words.every((w) => haystack.includes(w));
}

/**
 * The search box in the top bar: finds songs and videos already in the
 * library by title or artist. Picking a song plays it; picking a video opens
 * it over the window. The library is read when the box gets focus, so it is
 * current without polling in the background.
 */
export function LibrarySearch() {
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [library, setLibrary] = useState<{ music: LibraryEntry[]; video: LibraryEntry[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const load = () => {
    Promise.all([fetchLibrary("music"), fetchLibrary("video")]).then(
      ([music, video]) => setLibrary({ music: music.items, video: video.items }),
      () => {},
    );
  };

  const words = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const results = useMemo<Result[]>(() => {
    if (!library || words.length === 0) return [];
    const pick = (kind: Result["kind"], entries: LibraryEntry[]) =>
      entries
        .filter((e) => !e.missing && matches(e, words))
        .slice(0, MAX_PER_GROUP)
        .map((entry) => ({ kind, entry }));
    return [...pick("music", library.music), ...pick("video", library.video)];
  }, [library, words]);

  const showPanel = open && words.length > 0;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  const choose = (result: Result) => {
    if (result.kind === "music") player.actions.playTracks([toTrack(result.entry)], 0);
    else player.actions.playVideos([toVideoTrack(result.entry)], 0);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else inputRef.current?.blur();
      return;
    }
    if (!showPanel || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[activeIndex]);
    }
  };

  const songs = results.filter((r) => r.kind === "music");
  const videos = results.filter((r) => r.kind === "video");

  return (
    <div className="relative w-full min-w-[120px] max-w-[460px]">
      <label className="flex h-10 items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 transition-colors focus-within:border-white/20 hover:border-white/15">
        <NavIcon name="search" className="h-4 w-4 shrink-0 text-white/45" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Buscar en tu biblioteca"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && results.length > 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder="Buscar"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            // In case it wasn't read on focus (or that failed).
            if (!library) load();
          }}
          onFocus={() => {
            setOpen(true);
            load();
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35 [&::-webkit-search-cancel-button]:hidden"
        />
      </label>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Resultados"
          // Keeps focus in the box, so a click lands before onBlur closes the panel.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute right-0 top-full z-40 mt-2 max-h-[min(520px,70vh)] w-full min-w-[min(380px,calc(100vw-48px))] animate-[fadeIn_0.12s_ease] overflow-y-auto rounded-2xl border border-white/10 bg-[#141417] p-2 shadow-2xl shadow-black/60"
        >
          {!library ? (
            <p className="px-3 py-4 text-sm text-white/40">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-sm text-white/40">Sin resultados</p>
          ) : (
            <>
              {songs.length > 0 && <Group title="Canciones" />}
              {songs.map((r) => (
                <ResultRow key={r.entry.id} result={r} index={results.indexOf(r)} activeIndex={activeIndex} listId={listId} onHover={setActive} onChoose={choose} />
              ))}
              {videos.length > 0 && <Group title="Videos" />}
              {videos.map((r) => (
                <ResultRow key={r.entry.id} result={r} index={results.indexOf(r)} activeIndex={activeIndex} listId={listId} onHover={setActive} onChoose={choose} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">{title}</p>;
}

function ResultRow({
  result,
  index,
  activeIndex,
  listId,
  onHover,
  onChoose,
}: {
  result: Result;
  index: number;
  activeIndex: number;
  listId: string;
  onHover: (index: number) => void;
  onChoose: (result: Result) => void;
}) {
  const { entry, kind } = result;
  const isActive = index === activeIndex;
  const meta = [entry.artist, formatDuration(entry.durationSeconds)].filter(Boolean).join(" · ");
  return (
    <div
      id={`${listId}-${index}`}
      role="option"
      aria-selected={isActive}
      onMouseMove={() => onHover(index)}
      onClick={() => onChoose(result)}
      className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 ${isActive ? "bg-white/[0.07]" : ""}`}
    >
      <LibraryThumb
        id={entry.id}
        hasThumbnail={entry.hasThumbnail}
        fallbackIcon={kind === "music" ? "music" : "video"}
        className={`${kind === "music" ? "w-10" : "w-[71px]"} h-10 shrink-0 rounded-lg`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/90">{entry.title}</p>
        {meta && <p className="truncate text-xs text-white/40">{meta}</p>}
      </div>
    </div>
  );
}
