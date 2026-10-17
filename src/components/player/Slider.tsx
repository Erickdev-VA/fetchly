"use client";

import { useState } from "react";

/**
 * A thin horizontal slider (progress, volume). While the pointer drags it
 * shows the dragged value and only reports it on release, so seeking
 * doesn't stutter through every position on the way; arrow keys apply
 * right away.
 */
export function Slider({
  value,
  max,
  onCommit,
  label,
  valueText,
  disabled,
  className,
}: {
  value: number;
  max: number;
  onCommit: (value: number) => void;
  label: string;
  valueText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = dragValue ?? value;
  const fill = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0;

  const finishDrag = () => {
    if (dragValue !== null) onCommit(dragValue);
    setDragValue(null);
  };

  return (
    <input
      type="range"
      min={0}
      max={max > 0 ? max : 1}
      step="any"
      value={max > 0 ? shown : 0}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ "--fill": `${fill}%` } as React.CSSProperties}
      onPointerDown={(e) => setDragValue(Number(e.currentTarget.value))}
      onChange={(e) => {
        const next = Number(e.currentTarget.value);
        if (dragValue !== null) setDragValue(next);
        else onCommit(next);
      }}
      onPointerUp={finishDrag}
      onLostPointerCapture={finishDrag}
      className={`fetchly-range ${className ?? ""}`}
    />
  );
}
