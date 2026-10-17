import { Sidebar } from "@/components/shell/Sidebar";
import { PlayerBar } from "@/components/shell/PlayerBar";

/**
 * The main window: menu on the left, the current section on the right and
 * the playback bar along the bottom. This layout stays mounted while moving
 * between sections, which is what will keep the music playing across them.
 * The floating mini player (/mini) lives outside this group, without it.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <PlayerBar />
    </div>
  );
}
