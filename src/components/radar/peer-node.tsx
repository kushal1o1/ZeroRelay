"use client";

import type { Peer } from "../../../shared/types";
import { RadarNode } from "./radar-node";

interface PeerNodeProps {
  peer: Peer;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  /** Dropping a file on a peer sends it directly to them. */
  onDropFile: (file: File) => void;
}

export function PeerNode({ peer, x, y, selected, onSelect, onDropFile }: PeerNodeProps) {
  const sublabel = selected
    ? "target"
    : peer.locale === "local"
      ? "LAN"
      : peer.locale === "remote"
        ? "remote"
        : "online";

  return (
    <RadarNode
      name={peer.name}
      peerId={peer.id}
      x={x}
      y={y}
      sublabel={sublabel}
      selected={selected}
      onClick={onSelect}
      onDropFile={onDropFile}
    />
  );
}
