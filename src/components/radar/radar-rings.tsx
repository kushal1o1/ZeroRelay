"use client";

import type { RadarPoint } from "@/hooks/use-radar-layout";

interface RadarRingsProps {
  width: number;
  height: number;
  center: { x: number; y: number };
  points: RadarPoint[];
  selectedPeerId: string | null;
}

/** Background geometry: dashed rings, a rotating radar sweep, and center→peer
 * connector lines. Purely decorative (pointer-events-none) and shares the same
 * coordinate space as the nodes via the layout hook. */
export function RadarRings({ width, height, center, points, selectedPeerId }: RadarRingsProps) {
  const minDim = Math.min(width, height);
  const baseRadius = minDim * 0.2;
  const ringGap = minDim * 0.16;
  const ringSteps = [0, 1, 2];
  const sweepSize = (baseRadius + ringGap * 2) * 2;

  return (
    <>
      {/* rotating sweep — outer wrapper positions, inner rotates about its center */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: center.x, top: center.y, transform: "translate(-50%, -50%)" }}
      >
        <div
          className="zr-sweep rounded-full opacity-50"
          style={{
            width: sweepSize,
            height: sweepSize,
            background:
              "conic-gradient(from 0deg, transparent 0deg 300deg, var(--color-signal) 356deg, transparent 360deg)",
            maskImage: "radial-gradient(circle, #000 0%, #000 69%, transparent 71%)",
            WebkitMaskImage: "radial-gradient(circle, #000 0%, #000 69%, transparent 71%)",
          }}
        />
      </div>

      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
      >
        <title>radar</title>
        {ringSteps.map((step) => (
          <circle
            key={`ring-${step}`}
            cx={center.x}
            cy={center.y}
            r={baseRadius + ringGap * step}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="1"
            strokeDasharray="2 7"
          />
        ))}
        {points.map((p) => {
          const on = selectedPeerId === p.peer.id;
          return (
            <line
              key={p.peer.id}
              x1={center.x}
              y1={center.y}
              x2={p.x}
              y2={p.y}
              stroke={on ? "var(--color-accent)" : "var(--color-signal)"}
              strokeWidth={on ? 1.5 : 1}
              strokeOpacity={on ? 0.9 : 0.25}
            />
          );
        })}
      </svg>
    </>
  );
}
