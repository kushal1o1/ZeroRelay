"use client";

import { type DragEvent, useState } from "react";

/**
 * Shared file drop-target behaviour for radar nodes. Tracks hover state and
 * extracts the first dropped file. Stops propagation so a drop on a node does
 * not also bubble to the canvas broadcast handler.
 */
export function useDropTarget(onDropFile: (file: File) => void) {
  const [isOver, setIsOver] = useState(false);

  const handlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(true);
    },
    onDragLeave: () => setIsOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onDropFile(file);
    },
  };

  return { isOver, handlers };
}
