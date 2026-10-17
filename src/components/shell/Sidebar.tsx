"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "../Logo";
import { NavIcon, type NavIconName } from "./NavIcon";

const SECTIONS: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/", label: "Descargar", icon: "download" },
  { href: "/musica", label: "Música", icon: "music" },
  { href: "/videos", label: "Videos", icon: "video" },
  { href: "/playlists", label: "Playlists", icon: "playlist" },
  { href: "/ajustes", label: "Ajustes", icon: "settings" },
];

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Left menu. Below 1024px wide it shrinks to icons only (labels move to the
 * tooltip), so the page keeps enough room at the 720px minimum window width.
 */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="flex w-16 shrink-0 flex-col gap-1 border-r border-white/[0.06] px-2 py-4 lg:w-52 lg:px-3">
      <div className="mb-5 flex justify-center px-1 lg:justify-start lg:px-2">
        <Logo compact />
      </div>
      {SECTIONS.map((s) => {
        const current = isCurrent(pathname, s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            title={s.label}
            aria-current={current ? "page" : undefined}
            className={`flex items-center justify-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60 lg:justify-start ${
              current ? "bg-white/[0.08] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/85"
            }`}
          >
            <NavIcon name={s.icon} className={current ? "text-[var(--accent)]" : undefined} />
            <span className="hidden lg:inline">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
