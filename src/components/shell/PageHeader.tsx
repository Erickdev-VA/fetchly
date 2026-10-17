/**
 * The frame of a library page (Música, a playlist, Videos): it fills the
 * window, with side margins that grow with it, up to a cap that keeps rows
 * readable on very wide screens.
 */
export const PAGE_CLASS = "mx-auto w-full max-w-[1800px] px-6 py-8 lg:px-10 2xl:px-14";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-white/45">{subtitle}</p>}
    </header>
  );
}
