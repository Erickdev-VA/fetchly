"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const EDGE_GAP = 8;

/**
 * Floating menu for a library item, opened from its ⋯ button or with a
 * right click. It opens at (x, y), flips to stay inside the window, and
 * closes on Escape, a click elsewhere, scrolling or resizing.
 */
export function ItemMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: x + width + EDGE_GAP > window.innerWidth ? Math.max(EDGE_GAP, x - width) : x,
      top: y + height + EDGE_GAP > window.innerHeight ? Math.max(EDGE_GAP, y - height) : y,
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const moveFocus = (step: 1 | -1) => {
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      style={position}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(e.key === "ArrowDown" ? 1 : -1);
        }
      }}
      className="fixed z-50 min-w-48 animate-[fadeIn_0.12s_ease] rounded-xl border border-white/10 bg-[#17171b] p-1 shadow-2xl shadow-black/60"
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            onClose();
            action.onSelect();
          }}
          className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] outline-none transition disabled:cursor-default disabled:opacity-35 ${
            action.danger
              ? "text-red-300 hover:bg-red-500/10 focus-visible:bg-red-500/10"
              : "text-white/85 hover:bg-white/[0.07] focus-visible:bg-white/[0.07]"
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
