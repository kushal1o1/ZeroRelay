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
/** Cap the radar's size so it stays a tidy dial on a huge stage instead of
 * sprawling (and dragging the sweep arc off into the corner). */
const MAX_DIM = 820;
/* Ring geometry (shared with radar-rings.tsx — keep in sync). The first ring
 * sits well clear of the sun so peers never crowd the centre. */
const BASE_RADIUS_F = 0.3;
const RING_GAP_F = 0.1;
/** Absolute floor (px) so no peer ever crowds the sun, even on a narrow radar
 * where the sun is large relative to the dial. sun≈37 + peer≈22 + a clear gap. */
const MIN_RADIUS = 118;

/**
 * Single source of radar geometry. Measures its container and maps `peers` to
 * absolute {x, y} pixel positions on concentric rings, with small deterministic
 * per-peer jitter (from the peer id) so nodes feel constellation-like and stay
 * stable across renders. Consumed by nodes, connector lines, ripple + packets.
 */
export function useRadarLayout(peers: Peer[], rotation = 0) {
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
    const minDim = Math.min(size.width, size.height, MAX_DIM);
    const baseRadius = minDim * BASE_RADIUS_F;
    const ringGap = minDim * RING_GAP_F;

    return peers.map((peer, i) => {
      const ring = Math.floor(i / MAX_PER_RING);
      const idxInRing = i % MAX_PER_RING;
      const countInRing = Math.min(MAX_PER_RING, peers.length - ring * MAX_PER_RING);
      const baseAngle = (idxInRing / countInRing) * Math.PI * 2 - Math.PI / 2;

      const h = hashString(peer.id);
      const angleJitter = ((h % 100) / 100 - 0.5) * (Math.PI / countInRing) * 0.7;
      // Vary each peer's distance (some near, some far) so the field reads as a
      // spread-out constellation, but never closer than MIN_RADIUS to the sun.
      const radiusFactor = 1 + (((h >> 3) % 100) / 100) * 0.55; // ~1.0 – 1.55
      const radius = Math.max(MIN_RADIUS, (baseRadius + ring * ringGap) * radiusFactor);
      // `rotation` slowly advances every peer's angle so the whole system orbits.
      const angle = baseAngle + angleJitter + rotation;

      return {
        peer,
        angle,
        ring,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
  }, [peers, size.width, size.height, center.x, center.y, rotation]);

  return { containerRef, size, center, points };
}
