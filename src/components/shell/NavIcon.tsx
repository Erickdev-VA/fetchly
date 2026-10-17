export type NavIconName = "download" | "music" | "video" | "playlist" | "settings";

const PATHS: Record<NavIconName, React.ReactNode> = {
  download: (
    <>
      <path d="M12 4v11M12 15l-4.5-4.5M12 15l4.5-4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m10 9.5 4.5 2.5-4.5 2.5z" />
    </>
  ),
  playlist: (
    <>
      <path d="M4 6h12M4 11h12M4 16h7" />
      <path d="M15 20v-6l5 3z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
