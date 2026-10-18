import { TopBar } from "@/components/shell/TopBar";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { PlayerBar } from "@/components/player/PlayerBar";
import { QueuePanel } from "@/components/player/QueuePanel";
import { PlaylistPickerProvider } from "@/components/playlists/PlaylistPicker";
import { DownloadPanel } from "@/components/DownloadPanel";
import { PageTintProvider } from "@/components/shell/PageTint";

/**
 * The main window: the navigation bar across the top, the current section
 * below it and the playback bar along the bottom. This layout stays mounted while moving
 * between sections, and the player (with its <audio>) lives in it, so the
 * music keeps playing across pages. The floating mini player (/mini) lives
 * outside this group, without it. The Descargar page stays mounted here too
 * (shown at /descargar, hidden elsewhere), so a download in progress is
 * still there on return.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <PlayerProvider>
      <PlaylistPickerProvider>
        <PageTintProvider>
        <div className="flex h-full flex-col">
          <TopBar />
          <div className="relative flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto">
              <DownloadPanel />
              {children}
            </main>
            <QueuePanel />
          </div>
          <PlayerBar />
        </div>
        </PageTintProvider>
      </PlaylistPickerProvider>
    </PlayerProvider>
  );
}
