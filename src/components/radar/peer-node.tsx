"use client";

import type { ViewPeer } from "@/hooks/use-visible-peers";
import { RadarNode } from "./radar-node";

interface PeerNodeProps {
  peer: ViewPeer;
  x: number;
  y: number;
  selected: boolean;
  onSelect: () => void;
  /** Called instead of onSelect when the direct link has failed. */
  onRetry: () => void;
  /** Dropping a file on a peer sends it directly to them. */
  onDropFile: (file: File) => void;
}

function sublabelFor(peer: ViewPeer, selected: boolean): string {
  if (peer.link === "failed") return "no direct link · tap to retry";
  if (peer.link === "connecting") return "connecting…";
  if (selected) return "target";
  if (peer.world) return "other network";
  return peer.locale === "local" ? "LAN" : "remote";
}

export function PeerNode({ peer, x, y, selected, onSelect, onRetry, onDropFile }: PeerNodeProps) {
  return (
    <RadarNode
      name={peer.name}
      peerId={peer.id}
      x={x}
      y={y}
      sublabel={sublabelFor(peer, selected)}
      selected={selected}
      onClick={peer.link === "failed" ? onRetry : onSelect}
      onDropFile={onDropFile}
    />
  );
}
