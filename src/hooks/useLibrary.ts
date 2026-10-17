"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLibrary, fetchLibraryRevision } from "@/lib/api";
import type { Category, LibraryEntry } from "@/lib/library/types";

const REVISION_POLL_MS = 3000;

/**
 * One category of the library, kept current: downloads that finish while
 * the page is open show up within a few seconds, and coming back to the
 * window re-checks which files were moved or deleted outside the app.
 */
export function useLibrary(category: Category) {
  const [items, setItems] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revisionRef = useRef<string | null>(null);
  // Only the newest request may update the list.
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const result = await fetchLibrary(category);
      if (request !== requestRef.current) return;
      revisionRef.current = result.revision;
      setItems(result.items);
      setError(null);
    } catch {
      if (request === requestRef.current) setError("No se pudo cargar la biblioteca.");
    }
  }, [category]);

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

  return { items, error, reload };
}
