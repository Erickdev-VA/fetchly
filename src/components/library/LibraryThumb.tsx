"use client";

import { useState } from "react";
import { libraryThumbnailUrl } from "@/lib/api";
import { NavIcon, type NavIconName } from "../shell/NavIcon";

/** The saved cover, or a plain placeholder when there is none. */
export function LibraryThumb({
  id,
  hasThumbnail,
  fallbackIcon,
  className,
}: {
  id: string;
  hasThumbnail: boolean;
  fallbackIcon: NavIconName;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-white/[0.06] ${className ?? ""}`}>
      {hasThumbnail && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={libraryThumbnailUrl(id)}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <NavIcon name={fallbackIcon} className="text-white/25" />
      )}
    </div>
  );
}
