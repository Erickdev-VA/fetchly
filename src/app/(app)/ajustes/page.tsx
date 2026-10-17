import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="Ajustes" />
      <EmptyState icon="settings" text="Aquí podrás elegir la carpeta de la biblioteca, importar archivos y más." />
    </div>
  );
}
