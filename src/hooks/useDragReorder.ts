"use client";

import { useState } from "react";

export interface DropSpot {
  target: string;
  after: boolean;
}

/**
 * Drag and drop to reorder the rows of a list (HTML drag and drop, so the
 * browser scrolls the list when the pointer nears its edge). `group` picks
 * the rows that move with the one grabbed, such as the other selected
 * ones. `onMove` gets them only when the drop changes something.
 */
export function useDragReorder({
  group = (id) => [id],
  label,
  onMove,
}: {
  group?: (id: string) => string[];
  /** Text on the drag image when several rows move, e.g. "3 canciones". */
  label?: (count: number) => string;
  onMove: (moved: string[], spot: DropSpot) => void;
}) {
  const [dragging, setDragging] = useState<string[] | null>(null);
  const [spot, setSpot] = useState<DropSpot | null>(null);

  const reset = () => {
    setDragging(null);
    setSpot(null);
  };

  const rowProps = (id: string) => ({
    draggable: true,
    onDragStart(e: React.DragEvent<HTMLElement>) {
      const moving = group(id);
      setDragging(moving);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", moving.join("\n"));
      if (moving.length > 1 && label) setBadgeImage(e.dataTransfer, label(moving.length));
    },
    onDragOver(e: React.DragEvent<HTMLElement>) {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      if (spot?.target !== id || spot.after !== after) setSpot({ target: id, after });
    },
    onDrop(e: React.DragEvent<HTMLElement>) {
      e.preventDefault();
      if (dragging && spot && !dragging.includes(spot.target)) onMove(dragging, spot);
      reset();
    },
    onDragEnd: reset,
  });

  return {
    rowProps,
    isDragging: (id: string) => dragging?.includes(id) ?? false,
    /** Where the drop line goes on this row, if it's the one under the pointer. */
    marker(id: string): "before" | "after" | null {
      if (!dragging || spot?.target !== id || dragging.includes(id)) return null;
      return spot.after ? "after" : "before";
    },
  };
}

/** A small pill ("3 canciones") under the pointer instead of a picture of one row. */
function setBadgeImage(dataTransfer: DataTransfer, text: string) {
  const badge = document.createElement("div");
  badge.textContent = text;
  Object.assign(badge.style, {
    position: "fixed",
    top: "-100px",
    left: "0",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#1d1d22",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "white",
    font: "500 13px system-ui, sans-serif",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(badge);
  dataTransfer.setDragImage(badge, 12, 12);
  // The browser takes its snapshot during dragstart.
  window.setTimeout(() => badge.remove(), 0);
}
