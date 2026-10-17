/** Bottom playback bar. Only reserves its space for now; the player fills it in. */
export function PlayerBar() {
  return (
    <footer className="flex h-[72px] shrink-0 items-center gap-3 border-t border-white/[0.06] bg-white/[0.02] px-4">
      <div className="h-12 w-12 shrink-0 rounded-lg bg-white/[0.05]" />
      <p className="text-sm text-white/35">Nada en reproducción</p>
    </footer>
  );
}
