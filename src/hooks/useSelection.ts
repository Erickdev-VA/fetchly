"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface Selection {
  /** The selected ids, in the list's order. */
  ids: string[];
  count: number;
  /** Selection mode is on: rows show their check boxes, a click toggles, and the action bar shows. */
  active: boolean;
  has(id: string): boolean;
  /** "Seleccionar" in a song's ⋯ menu: turns selection mode on with that song checked. */
  start(id: string): void;
  /** The check box: toggles `id`, or with Shift selects everything from the last one touched. */
  toggle(id: string, range: boolean): void;
  /**
   * A click on the row itself, in selection mode: toggles it, or with Shift
   * selects a range. Outside selection mode it does nothing. Returns whether
   * it did anything.
   */
  rowClick(id: string, e: { shiftKey: boolean }): boolean;
  selectAll(): void;
  /** Leaves selection mode (✕, Esc, or after the songs moved or went away). */
  clear(): void;
}

function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

/**
 * Picking several rows of a list. It's a mode the user turns on from a
 * song's ⋯ menu ("Seleccionar"); until then the list behaves as usual.
 * In it: check boxes, a click toggles a row, Shift + click selects a range,
 * Ctrl + A everything shown, and Esc leaves. Only ids still in `listIds`
 * count, so rows that a search hides or that get deleted drop out by
 * themselves.
 */
export function useSelection(listIds: string[]): Selection {
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  const ids = useMemo(() => listIds.filter((id) => picked.has(id)), [listIds, picked]);

  const range = useCallback(
    (to: string) => {
      const from = anchor.current && listIds.includes(anchor.current) ? anchor.current : to;
      const a = listIds.indexOf(from);
      const b = listIds.indexOf(to);
      const span = listIds.slice(Math.min(a, b), Math.max(a, b) + 1);
      setPicked((prev) => new Set([...prev, ...span]));
    },
    [listIds],
  );

  const toggle = useCallback(
    (id: string, withRange: boolean) => {
      if (withRange) {
        range(id);
      } else {
        setPicked((prev) => {
          const next = new Set(prev);
          if (!next.delete(id)) next.add(id);
          return next;
        });
      }
      anchor.current = id;
    },
    [range],
  );

  const start = useCallback((id: string) => {
    setActive(true);
    setPicked(new Set([id]));
    anchor.current = id;
  }, []);
  const selectAll = useCallback(() => setPicked(new Set(listIds)), [listIds]);
  const clear = useCallback(() => {
    setActive(false);
    setPicked(new Set());
    anchor.current = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc in a dialog or an open ⋯ menu closes that, not the selection.
      if (typingIn(e.target) || document.querySelector('dialog[open], [role="menu"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.key === "Escape") {
        clear();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, selectAll, clear]);

  return useMemo<Selection>(() => {
    const set = new Set(ids);
    return {
      ids,
      count: ids.length,
      active,
      has: (id) => set.has(id),
      start,
      toggle,
      rowClick(id, e) {
        if (!active) return false;
        toggle(id, e.shiftKey);
        return true;
      },
      selectAll,
      clear,
    };
  }, [ids, active, start, toggle, selectAll, clear]);
}
