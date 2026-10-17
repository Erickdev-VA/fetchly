import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function VideosPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader title="Videos" />
      <EmptyState icon="video" text="Aún no tienes videos. Ve a Descargar." action={{ href: "/", label: "Ir a Descargar" }} />
    </div>
  );
}
