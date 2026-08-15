export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="9" stroke="var(--accent)" strokeWidth="1.4" />
        <path
          d="M16 9v10.5M16 19.5 11.5 15M16 19.5 20.5 15"
          stroke="var(--accent)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10.5 23h11" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-white">Fetchly</span>
    </div>
  );
}
