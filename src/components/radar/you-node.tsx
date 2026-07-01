"use client";

import { RadarNode } from "./radar-node";

interface YouNodeProps {
  name: string;
  x: number;
  y: number;
  onRename?: () => void;
  /** Dropping a file on yourself broadcasts to everyone. */
  onDropFile?: (file: File) => void;
}

export function YouNode({ name, x, y, onRename, onDropFile }: YouNodeProps) {
  return (
    <RadarNode
      name={name}
      x={x}
      y={y}
      sublabel="you · rename"
      pulse
      size="lg"
      onClick={onRename}
      onDropFile={onDropFile}
    />
  );
}
