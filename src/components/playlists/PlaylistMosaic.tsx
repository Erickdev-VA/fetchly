import { LibraryThumb } from "../library/LibraryThumb";
import { NavIcon } from "../shell/NavIcon";

/** A playlist's cover: four song covers in a 2×2 grid, one big cover when it has fewer, or an icon. */
export function PlaylistMosaic({ coverIds, className }: { coverIds: string[]; className?: string }) {
  const base = `overflow-hidden bg-white/[0.06] ${className ?? ""}`;
  if (coverIds.length === 0) {
    return (
      <div className={`flex items-center justify-center ${base}`}>
        <NavIcon name="playlist" className="h-1/3 w-1/3 text-white/25" />
      </div>
    );
  }
  if (coverIds.length < 4) {
    return <LibraryThumb id={coverIds[0]} hasThumbnail fallbackIcon="music" className={base} />;
  }
  return (
    <div className={`grid grid-cols-2 grid-rows-2 ${base}`}>
      {coverIds.slice(0, 4).map((id) => (
        <LibraryThumb key={id} id={id} hasThumbnail fallbackIcon="music" className="h-full w-full" />
      ))}
    </div>
  );
}
