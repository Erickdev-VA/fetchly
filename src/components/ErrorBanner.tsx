export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex w-full animate-[fadeIn_0.25s_ease] items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-red-400" aria-hidden>
        <path
          d="M12 8v5M12 16h.01M10.29 3.86 2.11 18.04A1 1 0 0 0 3 19.5h18a1 1 0 0 0 .89-1.46L13.71 3.86a1 1 0 0 0-1.72 0Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="flex-1 leading-snug">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 text-red-300/70 transition hover:text-red-200">
          ✕
        </button>
      )}
    </div>
  );
}
