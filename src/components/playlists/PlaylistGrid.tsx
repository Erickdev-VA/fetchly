"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePlaylists } from "@/hooks/useLibrary";
import { createPlaylist } from "@/lib/api";
import { ErrorBanner } from "../ErrorBanner";
import { PageHeader } from "../shell/PageHeader";
import { EmptyState } from "../shell/EmptyState";
import { NameDialog } from "./NameDialog";
import { PlaylistMosaic } from "./PlaylistMosaic";
import { playlistMeta } from "./PlaylistPicker";

/** The Playlists page: every playlist as a card, plus "Nueva playlist". */
export function PlaylistGrid() {
  const { playlists, error } = usePlaylists();
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const newButton = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className="rounded-xl bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
    >
      + Nueva playlist
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Playlists"
          subtitle={playlists && playlists.length > 0 ? `${playlists.length} playlist${playlists.length === 1 ? "" : "s"}` : undefined}
        />
        {playlists && playlists.length > 0 && newButton}
      </div>

      {error && !playlists && <ErrorBanner message={error} />}

      {playlists && playlists.length === 0 && (
        <div className="flex flex-col items-center gap-4">
          <EmptyState icon="playlist" text="Aún no tienes playlists. Crea una y añádele canciones desde Música." />
          {newButton}
        </div>
      )}

      {playlists && playlists.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {playlists.map((p) => (
            <li key={p.id}>
              <Link
                href={`/playlists/${p.id}`}
                className="group block rounded-2xl p-2 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
              >
                <PlaylistMosaic coverIds={p.coverIds} className="aspect-square w-full rounded-xl shadow-lg shadow-black/40" />
                <p className="mt-2.5 truncate text-sm font-medium text-white/90" title={p.name}>
                  {p.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-white/40">{playlistMeta(p.count, p.durationSeconds)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NameDialog
          title="Nueva playlist"
          submitLabel="Crear"
          onSubmit={async (name) => {
            const id = await createPlaylist(name);
            setCreating(false);
            router.push(`/playlists/${id}`);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
