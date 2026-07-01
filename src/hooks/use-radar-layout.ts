"use client";

import { hashString } from "@/lib/hash";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Peer } from "../../shared/types";

export interface RadarPoint {
  peer: Peer;
  x: number;
  y: number;
  angle: number;
  ring: number;
}

const MAX_PER_RING = 8;

/**
 * Single source of radar geometry. Measures its container and maps `peers` to
 * absolute {x, y} pixel positions on concentric rings, with small deterministic
 * per-peer jitter (from the peer id) so nodes feel constellation-like and stay
 * stable across renders. Consumed by nodes, connector lines, ripple + packets.
 */
export function useRadarLayout(peers: Peer[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const center = useMemo(
    () => ({ x: size.width / 2, y: size.height / 2 }),
    [size.width, size.height],
  );

  const points = useMemo<RadarPoint[]>(() => {
    if (size.width === 0 || size.height === 0) return [];
    const minDim = Math.min(size.width, size.height);
    const baseRadius = minDim * 0.2;
    const ringGap = minDim * 0.16;

    return peers.map((peer, i) => {
      const ring = Math.floor(i / MAX_PER_RING);
      const idxInRing = i % MAX_PER_RING;
      const countInRing = Math.min(MAX_PER_RING, peers.length - ring * MAX_PER_RING);
      const baseAngle = (idxInRing / countInRing) * Math.PI * 2 - Math.PI / 2;

      const h = hashString(peer.id);
      const angleJitter = ((h % 100) / 100 - 0.5) * (Math.PI / countInRing) * 0.5;
      const radiusJitter = (((h >> 3) % 100) / 100 - 0.5) * ringGap * 0.35;
      const radius = baseRadius + ring * ringGap + radiusJitter;
      const angle = baseAngle + angleJitter;

      return {
        peer,
        angle,
        ring,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
  }, [peers, size.width, size.height, center.x, center.y]);

  return { containerRef, size, center, points };
}
