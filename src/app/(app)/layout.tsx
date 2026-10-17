import { Sidebar } from "@/components/shell/Sidebar";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import { PlayerBar } from "@/components/player/PlayerBar";
import { QueuePanel } from "@/components/player/QueuePanel";
import { PlaylistPickerProvider } from "@/components/playlists/PlaylistPicker";
import { DownloadPanel } from "@/components/DownloadPanel";

/**
 * The main window: menu on the left, the current section on the right and
 * the playback bar along the bottom. This layout stays mounted while moving
 * between sections, and the player (with its <audio>) lives in it, so the
 * music keeps playing across pages. The floating mini player (/mini) lives
 * outside this group, without it. The Descargar page stays mounted here too
 * (hidden elsewhere), so a download in progress is still there on return.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <PlayerProvider>
      <PlaylistPickerProvider>
        <div className="flex h-full flex-col">
          <div className="relative flex min-h-0 flex-1">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">
              <DownloadPanel />
              {children}
            </main>
            <QueuePanel />
          </div>
          <PlayerBar />
        </div>
      </PlaylistPickerProvider>
    </PlayerProvider>
  );
}
