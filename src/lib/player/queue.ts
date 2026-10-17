import type { QueueEntry, Track } from "./types";

/**
 * The queue as two lists of the same slots: `base` in the order the user
 * built it, `order` in the order it plays (shuffled or not). `index` points
 * into `order`. Every function returns a new state; nothing is mutated.
 */
export interface QueueState {
  base: QueueEntry[];
  order: QueueEntry[];
  index: number;
}

export const EMPTY_QUEUE: QueueState = { base: [], order: [], index: -1 };

let uidCounter = 0;
export function makeEntries(tracks: Track[]): QueueEntry[] {
  return tracks.map((track) => ({ uid: `q${++uidCounter}`, track }));
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function currentEntry(state: QueueState): QueueEntry | null {
  return state.order[state.index] ?? null;
}

/** A fresh queue that starts at `start`; with shuffle the rest is mixed after it. */
export function newQueue(entries: QueueEntry[], start: number, shuffle: boolean): QueueState {
  if (entries.length === 0) return EMPTY_QUEUE;
  const first = entries[Math.min(Math.max(start, 0), entries.length - 1)];
  if (!shuffle) return { base: entries, order: entries, index: entries.indexOf(first) };
  return { base: entries, order: [first, ...shuffled(entries.filter((e) => e !== first))], index: 0 };
}

/** Turning shuffle on mixes what's left to play; off goes back to the user's order. */
export function setShuffle(state: QueueState, shuffle: boolean): QueueState {
  const current = currentEntry(state);
  if (!current) return state;
  if (shuffle) {
    const played = state.order.slice(0, state.index);
    const upcoming = shuffled(state.order.slice(state.index + 1));
    return { ...state, order: [...played, current, ...upcoming], index: played.length };
  }
  return { ...state, order: state.base, index: state.base.indexOf(current) };
}

/** Puts entries right after the current song, in both orders. */
export function insertNext(state: QueueState, entries: QueueEntry[]): QueueState {
  const current = currentEntry(state);
  if (!current) return newQueue(entries, 0, false);
  const at = (list: QueueEntry[], pos: number) => [...list.slice(0, pos), ...entries, ...list.slice(pos)];
  return {
    base: at(state.base, state.base.indexOf(current) + 1),
    order: at(state.order, state.index + 1),
    index: state.index,
  };
}

export function append(state: QueueState, entries: QueueEntry[]): QueueState {
  if (state.order.length === 0) return newQueue(entries, 0, false);
  return { base: [...state.base, ...entries], order: [...state.order, ...entries], index: state.index };
}

/**
 * Drops the slots `drop` matches. If the current song goes, `index` lands on
 * whatever now sits in its place (the next song), or -1 past the end.
 */
export function removeWhere(state: QueueState, drop: (entry: QueueEntry) => boolean): QueueState {
  const current = currentEntry(state);
  const order = state.order.filter((e) => !drop(e));
  const base = state.base.filter((e) => !drop(e));
  if (order.length === 0) return EMPTY_QUEUE;
  let index: number;
  if (current && !drop(current)) {
    index = order.indexOf(current);
  } else {
    // The first surviving slot after where the current one was.
    const before = state.order.slice(0, state.index).filter((e) => !drop(e)).length;
    index = before < order.length ? before : -1;
  }
  return { base, order, index };
}
