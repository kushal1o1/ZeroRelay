"use client";

import { Avatar } from "@/components/ui/avatar";
import { useDropTarget } from "@/hooks/use-drop-target";
import type { MouseEvent } from "react";

interface RadarNodeProps {
  name: string;
  x: number;
  y: number;
  sublabel?: string;
  selected?: boolean;
  pulse?: boolean;
  size?: "md" | "lg";
  onClick?: () => void;
  onDropFile?: (file: File) => void;
}

const noop = () => {};

/**
 * Base radar node: an absolutely-positioned avatar + label centered on (x, y).
 * Shared by YouNode (center, broadcast target) and PeerNode (orbit, direct
 * target) so drop/hover/selection behaviour lives in one place.
 */
export function RadarNode({
  name,
  x,
  y,
  sublabel,
  selected = false,
  pulse = false,
  size = "md",
  onClick,
  onDropFile,
}: RadarNodeProps) {
  const { isOver, handlers } = useDropTarget(onDropFile ?? noop);
  const dropProps = onDropFile ? handlers : {};

  const ringClass = isOver
    ? "ring-signal scale-125"
    : selected
      ? "ring-accent scale-110"
      : "ring-transparent";

  return (
    <button
      type="button"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        onClick?.();
      }}
      {...dropProps}
      style={{ left: x, top: y }}
      className="zr-node-in absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 outline-none focus-visible:opacity-80"
    >
      <span className="relative inline-flex items-center justify-center">
        {pulse && <span aria-hidden className="zr-pulse absolute inset-0 rounded-full bg-signal" />}
        <span
          className={`relative inline-flex rounded-full ring-2 transition-transform ${ringClass}`}
        >
          <Avatar name={name} size={size === "lg" ? "lg" : "md"} />
        </span>
      </span>
      <span className="flex flex-col items-center leading-tight">
        <span className="max-w-32 truncate text-xs font-medium text-foreground">{name}</span>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </span>
    </button>
  );
}
