/**
 * Where each video was left, so it can offer "Continuar desde 3:12". Kept in
 * localStorage: it's only a convenience, and losing it costs nothing.
 */
const KEY = "fetchly.videoPositions";
const MAX_REMEMBERED = 200;

type Positions = Record<string, { seconds: number; at: number }>;

function read(): Positions {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return typeof value === "object" && value !== null ? (value as Positions) : {};
  } catch {
    return {};
  }
}

function write(positions: Positions): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(positions));
  } catch {
    // storage full or blocked: resuming just won't be offered
  }
}

export function savedPosition(id: string): number | null {
  const seconds = read()[id]?.seconds;
  return typeof seconds === "number" && Number.isFinite(seconds) ? seconds : null;
}

export function savePosition(id: string, seconds: number): void {
  const positions = read();
  positions[id] = { seconds, at: Date.now() };
  // Forget the oldest ones so this never grows without end.
  const ids = Object.keys(positions);
  if (ids.length > MAX_REMEMBERED) {
    ids.sort((a, b) => positions[a].at - positions[b].at);
    for (const old of ids.slice(0, ids.length - MAX_REMEMBERED)) delete positions[old];
  }
  write(positions);
}

export function forgetPosition(id: string): void {
  const positions = read();
  if (!(id in positions)) return;
  delete positions[id];
  write(positions);
}

/** Every remembered video, the most recently watched first. */
export function recentPositions(): { id: string; seconds: number }[] {
  const positions = read();
  return Object.entries(positions)
    .filter(([, p]) => typeof p?.seconds === "number" && Number.isFinite(p.seconds))
    .sort(([, a], [, b]) => b.at - a.at)
    .map(([id, p]) => ({ id, seconds: p.seconds }));
}
