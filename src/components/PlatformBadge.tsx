import type { Platform } from "@/lib/platform/types";

const PLATFORM_META: Record<Platform, { label: string; dotClass: string }> = {
  youtube: { label: "YouTube", dotClass: "bg-red-500" },
  tiktok: { label: "TikTok", dotClass: "bg-cyan-400" },
  instagram: { label: "Instagram", dotClass: "bg-fuchsia-500" },
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/60">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}
