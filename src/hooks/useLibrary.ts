"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLibrary, fetchLibraryRevision, fetchPlaylist, fetchPlaylists } from "@/lib/api";
import type { Category, LibraryEntry, PlaylistDetail, PlaylistSummary } from "@/lib/library/types";

const REVISION_POLL_MS = 3000;

/**
 * Something read from the library, kept current: changes made while the
 * page is open (a download finishing, a song added to a playlist) show up
 * within a few seconds, and coming back to the window re-checks which files
 * were moved or deleted outside the app. `load` must be stable (useCallback).
 */
function useLiveResource<T>(load: () => Promise<{ revision: string; value: T }>, failMessage: string) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revisionRef = useRef<string | null>(null);
  // Only the newest request may update the value.
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const result = await load();
      if (request !== requestRef.current) return;
      revisionRef.current = result.revision;
      setValue(result.value);
      setError(null);
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error && err.message ? err.message : failMessage);
    }
  }, [load, failMessage]);

  useEffect(() => {
    // From a callback rather than the effect body, as react-hooks/set-state-in-effect asks.
    const initial = window.setTimeout(() => void reload(), 0);

    const checkRevision = async () => {
      if (document.hidden) return;
      try {
        const { revision } = await fetchLibraryRevision();
        if (revision !== revisionRef.current) await reload();
      } catch {
        // the next tick tries again
      }
    };
    const interval = window.setInterval(checkRevision, REVISION_POLL_MS);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [reload]);

  return { value, error, reload };
}

/** One category of the library, newest first. */
export function useLibrary(category: Category) {
  const load = useCallback(
    () => fetchLibrary(category).then(({ revision, items }) => ({ revision, value: items })),
    [category],
  );
  const { value, error, reload } = useLiveResource<LibraryEntry[]>(load, "No se pudo cargar la biblioteca.");
  return { items: value, error, reload };
}

/** The playlists of songs, or (kind "video") of videos. */
export function usePlaylists(kind: Category = "music") {
  const load = useCallback(
    () => fetchPlaylists(kind).then(({ revision, playlists }) => ({ revision, value: playlists })),
    [kind],
  );
  const { value, error, reload } = useLiveResource<PlaylistSummary[]>(load, "No se pudieron cargar las playlists.");
  return { playlists: value, error, reload };
}

export function usePlaylist(id: string) {
  const load = useCallback(
    () => fetchPlaylist(id).then(({ revision, playlist }) => ({ revision, value: playlist })),
    [id],
  );
  const { value, error, reload } = useLiveResource<PlaylistDetail>(load, "No se pudo cargar la playlist.");
  return { playlist: value, error, reload };
}
