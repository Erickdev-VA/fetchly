export function AnalyzingIndicator() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-white/50">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50" />
      </span>
      Analyzing link...
    </div>
  );
}
