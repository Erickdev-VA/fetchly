export type PlayerIconName =
  | "play"
  | "pause"
  | "previous"
  | "next"
  | "shuffle"
  | "repeat"
  | "repeat-one"
  | "volume"
  | "volume-low"
  | "volume-off"
  | "queue"
  | "close";

const FILLED = new Set<PlayerIconName>(["play", "pause", "previous", "next"]);

const PATHS: Record<PlayerIconName, React.ReactNode> = {
  play: <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </>
  ),
  previous: (
    <>
      <rect x="5" y="5" width="2.4" height="14" rx="1" />
      <path d="M19 6.2v11.6a1 1 0 0 1-1.55.83L9.2 13.1a1.3 1.3 0 0 1 0-2.2l8.25-5.53A1 1 0 0 1 19 6.2Z" />
    </>
  ),
  next: (
    <>
      <rect x="16.6" y="5" width="2.4" height="14" rx="1" />
      <path d="M5 6.2v11.6a1 1 0 0 0 1.55.83l8.25-5.53a1.3 1.3 0 0 0 0-2.2L6.55 5.37A1 1 0 0 0 5 6.2Z" />
    </>
  ),
  shuffle: (
    <>
      <path d="M16 4h4v4M20 4l-6.5 6.5M4 20l5.5-5.5M16 20h4v-4M20 20 4 4" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3l3 3-3 3" />
      <path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" />
      <path d="M20 13v2a3 3 0 0 1-3 3H4" />
    </>
  ),
  "repeat-one": (
    <>
      <path d="M17 3l3 3-3 3" />
      <path d="M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3" />
      <path d="M20 13v2a3 3 0 0 1-3 3H4" />
      <path d="M11.5 10.5 13 9.5v5" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  "volume-low": (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  "volume-off": (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </>
  ),
  queue: (
    <>
      <path d="M4 6h16M4 11h16M4 16h9" />
      <path d="M17 14.5v5l4-2.5z" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function PlayerIcon({ name, size = 18, className }: { name: PlayerIconName; size?: number; className?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
