import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function PlaylistsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader title="Playlists" />
      <EmptyState icon="playlist" text="Aún no tienes playlists." />
    </div>
  );
}
