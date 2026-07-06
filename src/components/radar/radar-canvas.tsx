"use client";

import { useRadarLayout } from "@/hooks/use-radar-layout";
import { useRoomStore } from "@/stores/room-store";
import {
  type CSSProperties,
  type DragEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { PeerNode } from "./peer-node";
import { RadarRings } from "./radar-rings";
import { YouNode } from "./you-node";

export interface RadarHandle {
  /** Play send feedback: null = broadcast (ripple + packet to every peer); a
   * single id or a list of ids fires a packet to each of those peers. */
  playSend: (target: string | string[] | null) => void;
  /** Play receive feedback: a packet flies from the sender's node into the sun,
   * plus an arrival ping at the centre. */
  playReceive: (fromPeerId: string) => void;
}

interface RadarCanvasProps {
  selectedPeerIds: string[];
  onTogglePeer: (id: string) => void;
  onRename: () => void;
  /** Business action only — the canvas plays its own animation. */
  onSendFile: (file: File, targetPeerId: string | null) => void;
}

interface Packet {
  id: number;
  // start (from) and end (to) points — send flies centre→peer, receive peer→centre
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

let fxId = 0;

// Deterministic starfield (no Math.random → no hydration mismatch). Only shown
// in dark mode via the --star-display token on .zr-star.
const STARS = Array.from({ length: 70 }, (_, i) => ({
  left: (i * 47.3) % 100,
  top: (i * 71.7) % 100,
  size: (i % 3) * 0.6 + 0.6,
  tw: 1.5 + (i % 5) * 0.5,
}));

export const RadarCanvas = forwardRef<RadarHandle, RadarCanvasProps>(function RadarCanvas(
  { selectedPeerIds, onTogglePeer, onRename, onSendFile },
  ref,
) {
  const peers = useRoomStore((s) => s.peers);
  const myPeerId = useRoomStore((s) => s.peerId);
  const myName = useRoomStore((s) => s.name);

  const others = peers.filter((p) => p.id !== myPeerId);

  // Gently orbit the whole system so it feels alive. Advancing every peer's
  // angle (vs. CSS-rotating a wrapper) keeps labels upright and connector lines
  // + drop targets in sync for free.
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = 0;
    const speed = (Math.PI * 2) / 90_000; // one revolution per 90s
    const loop = (now: number) => {
      if (last) setRotation((r) => (r + speed * (now - last)) % (Math.PI * 2));
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { containerRef, size, center, points } = useRadarLayout(others, rotation);

  const [ripples, setRipples] = useState<number[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const playSend = useCallback(
    (target: string | string[] | null) => {
      const from = { fx: center.x, fy: center.y };
      if (target === null) {
        // Broadcast: ripple + a packet to every peer.
        setRipples((r) => [...r, ++fxId]);
        setPackets((p) => [
          ...p,
          ...points.map((pt) => ({ id: ++fxId, ...from, tx: pt.x, ty: pt.y })),
        ]);
        return;
      }
      const ids = Array.isArray(target) ? target : [target];
      const pts = points.filter((p) => ids.includes(p.peer.id));
      setPackets((p) => [...p, ...pts.map((pt) => ({ id: ++fxId, ...from, tx: pt.x, ty: pt.y }))]);
    },
    [points, center.x, center.y],
  );

  // Mirror of playSend: a packet travels from the sender's node into the sun,
  // then a ping at the centre marks the arrival.
  const playReceive = useCallback(
    (fromPeerId: string) => {
      const pt = points.find((p) => p.peer.id === fromPeerId);
      if (pt) {
        setPackets((p) => [...p, { id: ++fxId, fx: pt.x, fy: pt.y, tx: center.x, ty: center.y }]);
      }
      setRipples((r) => [...r, ++fxId]);
    },
    [points, center.x, center.y],
  );

  useImperativeHandle(ref, () => ({ playSend, playReceive }), [playSend, playReceive]);

  const handleContainerDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSendFile(file, null);
      playSend(null);
    }
  };

  // Keep in sync with MAX_DIM in use-radar-layout / radar-rings so the send
  // ripple stays a tidy dial instead of ballooning across the whole stage.
  const minDim = Math.min(size.width, size.height, 820);

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleContainerDrop}
      className={`relative h-full w-full overflow-hidden transition-colors ${
        dragActive ? "bg-signal/5" : ""
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {STARS.map((s) => (
          <span
            key={`${s.left}-${s.top}`}
            className="zr-star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              ["--tw" as string]: `${s.tw}s`,
            }}
          />
        ))}
      </div>
      {size.width > 0 && size.height > 0 && (
        <>
          <RadarRings
            width={size.width}
            height={size.height}
            center={center}
            points={points}
            selectedPeerIds={selectedPeerIds}
          />

          {ripples.map((id) => (
            <span
              key={id}
              aria-hidden
              onAnimationEnd={() => setRipples((r) => r.filter((x) => x !== id))}
              className="zr-ripple pointer-events-none absolute rounded-full border-2 border-signal"
              style={{ left: center.x, top: center.y, width: minDim * 0.8, height: minDim * 0.8 }}
            />
          ))}

          {packets.map((pk) => (
            <span
              key={pk.id}
              aria-hidden
              onAnimationEnd={() => setPackets((p) => p.filter((x) => x.id !== pk.id))}
              className="zr-packet pointer-events-none absolute left-0 top-0 size-2.5 rounded-full bg-signal shadow-[0_0_10px_var(--color-signal)]"
              style={
                {
                  "--zr-fx": `${pk.fx}px`,
                  "--zr-fy": `${pk.fy}px`,
                  "--zr-tx": `${pk.tx}px`,
                  "--zr-ty": `${pk.ty}px`,
                } as CSSProperties
              }
            />
          ))}

          <YouNode
            name={myName}
            x={center.x}
            y={center.y}
            onRename={onRename}
            onDropFile={(f) => {
              onSendFile(f, null);
              playSend(null);
            }}
          />

          {points.map((p) => (
            <PeerNode
              key={p.peer.id}
              peer={p.peer}
              x={p.x}
              y={p.y}
              selected={selectedPeerIds.includes(p.peer.id)}
              onSelect={() => onTogglePeer(p.peer.id)}
              onDropFile={(f) => {
                onSendFile(f, p.peer.id);
                playSend(p.peer.id);
              }}
            />
          ))}

          {others.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground">
              Waiting for peers on your network…
            </p>
          )}
        </>
      )}
    </div>
  );
});
