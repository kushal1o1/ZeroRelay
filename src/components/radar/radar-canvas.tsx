"use client";

import { useRadarLayout } from "@/hooks/use-radar-layout";
import { useRoomStore } from "@/stores/room-store";
import {
  type CSSProperties,
  type DragEvent,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import { PeerNode } from "./peer-node";
import { RadarRings } from "./radar-rings";
import { YouNode } from "./you-node";

export interface RadarHandle {
  /** Play send feedback: null = broadcast (ripple + packet to every peer). */
  playSend: (targetId: string | null) => void;
}

interface RadarCanvasProps {
  selectedPeerId: string | null;
  onSelectPeer: (id: string | null) => void;
  onRename: () => void;
  /** Business action only — the canvas plays its own animation. */
  onSendFile: (file: File, targetPeerId: string | null) => void;
}

interface Packet {
  id: number;
  x: number;
  y: number;
}

let fxId = 0;

export const RadarCanvas = forwardRef<RadarHandle, RadarCanvasProps>(function RadarCanvas(
  { selectedPeerId, onSelectPeer, onRename, onSendFile },
  ref,
) {
  const peers = useRoomStore((s) => s.peers);
  const myPeerId = useRoomStore((s) => s.peerId);
  const myName = useRoomStore((s) => s.name);

  const others = peers.filter((p) => p.id !== myPeerId);
  const { containerRef, size, center, points } = useRadarLayout(others);

  const [ripples, setRipples] = useState<number[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const playSend = useCallback(
    (targetId: string | null) => {
      if (targetId === null) {
        setRipples((r) => [...r, ++fxId]);
        setPackets((p) => [...p, ...points.map((pt) => ({ id: ++fxId, x: pt.x, y: pt.y }))]);
      } else {
        const pt = points.find((p) => p.peer.id === targetId);
        if (pt) setPackets((p) => [...p, { id: ++fxId, x: pt.x, y: pt.y }]);
      }
    },
    [points],
  );

  useImperativeHandle(ref, () => ({ playSend }), [playSend]);

  const handleContainerDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSendFile(file, null);
      playSend(null);
    }
  };

  const minDim = Math.min(size.width, size.height);

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleContainerDrop}
      className={`relative h-full w-full overflow-hidden rounded-2xl border transition-colors ${
        dragActive ? "border-signal bg-signal/5" : "border-border bg-muted/20"
      }`}
    >
      {size.width > 0 && size.height > 0 && (
        <>
          <RadarRings
            width={size.width}
            height={size.height}
            center={center}
            points={points}
            selectedPeerId={selectedPeerId}
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
                  "--zr-fx": `${center.x}px`,
                  "--zr-fy": `${center.y}px`,
                  "--zr-tx": `${pk.x}px`,
                  "--zr-ty": `${pk.y}px`,
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
              selected={selectedPeerId === p.peer.id}
              onSelect={() => onSelectPeer(selectedPeerId === p.peer.id ? null : p.peer.id)}
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
