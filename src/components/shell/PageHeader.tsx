/** The page's side margins and width cap, shared with the top bar so both line up. */
export const FRAME_CLASS = "mx-auto w-full max-w-[1632px] px-6 md:px-10 lg:px-16 xl:px-24";

/**
 * The frame of a library page (Inicio, Música, a playlist, Videos): it fills
 * the window, with side margins that grow with it, up to a cap that keeps
 * rows readable on very wide screens.
 */
export const PAGE_CLASS = `${FRAME_CLASS} py-8`;

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-white lg:text-[28px]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-white/45">{subtitle}</p>}
    </header>
  );
}
