"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../Logo";
import { LibrarySearch } from "./LibrarySearch";
import { NavIcon, type NavIconName } from "./NavIcon";
import { FRAME_CLASS } from "./PageHeader";

// Playlists live at the top of Música, so a playlist's page counts as being in Música.
const SECTIONS: { href: string; label: string; icon?: NavIconName; also?: string }[] = [
  { href: "/", label: "Inicio" },
  { href: "/musica", label: "Música", also: "/playlists" },
  { href: "/videos", label: "Videos" },
  { href: "/descargar", label: "Descargar", icon: "download" },
];

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isCurrent(pathname: string, section: (typeof SECTIONS)[number]): boolean {
  if (section.href === "/") return pathname === "/";
  return isUnder(pathname, section.href) || (section.also !== undefined && isUnder(pathname, section.also));
}

/**
 * The navigation, across the top: the logo and the sections as pills on the
 * left, the library search and Ajustes on the right. It stays put while the
 * page below scrolls. Below 1024px wide the logo shows only its icon, so it
 * all fits down to the 720px minimum window width.
 */
export function TopBar() {
  const pathname = usePathname();
  const inSettings = isUnder(pathname, "/ajustes");
  return (
    <header className="shrink-0">
      <div className={`${FRAME_CLASS} flex h-[76px] items-center gap-3 lg:gap-5`}>
        <Link href="/" aria-label="Inicio" className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60">
          <Logo compact />
        </Link>

        <nav aria-label="Secciones" className="flex min-w-0 items-center gap-1.5">
          {SECTIONS.map((s) => {
            const current = isCurrent(pathname, s);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 ${
                  current
                    ? "border-white bg-white text-black"
                    : "border-white/[0.08] text-white/75 hover:border-white/15 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {s.icon && <NavIcon name={s.icon} className="h-4 w-4" />}
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
          <LibrarySearch />
          <Link
            href="/ajustes"
            aria-label="Ajustes"
            title="Ajustes"
            aria-current={inSettings ? "page" : undefined}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 ${
              inSettings
                ? "border-white bg-white text-black"
                : "border-white/[0.08] text-white/75 hover:border-white/15 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <NavIcon name="settings" />
          </Link>
        </div>
      </div>
    </header>
  );
}
