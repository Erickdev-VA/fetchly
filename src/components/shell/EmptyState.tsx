import Link from "next/link";
import { NavIcon, type NavIconName } from "./NavIcon";

export function EmptyState({
  icon,
  text,
  action,
}: {
  icon: NavIconName;
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <NavIcon name={icon} className="h-7 w-7 text-white/25" />
      <p className="text-sm text-white/50">{text}</p>
      {action && (
        <Link
          href={action.href}
          className="rounded-xl bg-white/10 px-3.5 py-2 text-sm font-medium text-white/90 transition hover:bg-white/[0.16]"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
