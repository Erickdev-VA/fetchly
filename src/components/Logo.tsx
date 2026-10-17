// Pista's logo, redrawn from the user's brand sheet: a white "p" (a round
// stem and a ring) on a rounded purple square, and the name in a heavy
// serif. electron/assets/logo.svg has the same shapes for the app icons.

/** The logo's purple (sampled from the brand sheet). */
export const BRAND_PURPLE = "#6d5dfc";

/** The "p" alone, in a 100×100 box: stem, then the ring (even-odd leaves the hole). */
function PShape({ fill }: { fill: string }) {
  return (
    <>
      <rect x="31" y="11.8" width="9.4" height="68.7" rx="4.7" fill={fill} />
      <path
        fillRule="evenodd"
        fill={fill}
        d="M57.6 15.1a20.2 20.2 0 1 1 0 40.4a20.2 20.2 0 1 1 0-40.4ZM56.5 27.5a7.8 7.8 0 1 0 0 15.6a7.8 7.8 0 1 0 0-15.6Z"
      />
    </>
  );
}

/** The app icon: the white "p" on the purple square. */
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <rect width="100" height="100" rx="22" fill={BRAND_PURPLE} />
      <PShape fill="#fff" />
    </svg>
  );
}

/** "Pista" in the logo's heavy serif. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-[Georgia,'Times_New_Roman',serif] font-bold tracking-tight ${className ?? ""}`}>Pista</span>
  );
}

/** Icon and name, side by side. `compact`: the name only shows from 1024px up, like the menu labels. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={30} className="shrink-0" />
      <Wordmark className={`text-[21px] leading-none text-white ${compact ? "hidden lg:inline" : ""}`} />
    </div>
  );
}
