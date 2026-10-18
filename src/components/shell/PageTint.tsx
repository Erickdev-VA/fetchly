"use client";

import { createContext, useContext, useEffect, useState } from "react";

const TintContext = createContext<{ tint: string | null; setTint: (tint: string | null) => void }>({
  tint: null,
  setTint: () => {},
});

/**
 * The color a page paints behind the top bar (a playlist's cover color), so
 * it reaches the top of the window. Null everywhere else: the bar stays dark.
 */
export function PageTintProvider({ children }: { children: React.ReactNode }) {
  const [tint, setTint] = useState<string | null>(null);
  return <TintContext.Provider value={{ tint, setTint }}>{children}</TintContext.Provider>;
}

export function usePageTint(): string | null {
  return useContext(TintContext).tint;
}

/** Paints `tint` behind the top bar while the calling page is shown. */
export function useSetPageTint(tint: string | null) {
  const { setTint } = useContext(TintContext);
  useEffect(() => {
    setTint(tint);
    return () => setTint(null);
  }, [tint, setTint]);
}
