"use client";

import { useDropTarget } from "@/hooks/use-drop-target";
import { useAvatarStore } from "@/stores/avatar-store";
import { useRoomStore } from "@/stores/room-store";

interface YouNodeProps {
  name: string;
  x: number;
  y: number;
  onRename?: () => void;
  /** Dropping a file on yourself broadcasts to everyone. */
  onDropFile?: (file: File) => void;
}

const noop = () => {};

/** The "sun" at the center of the system — you. Doubles as the broadcast target. */
export function YouNode({ name, x, y, onRename, onDropFile }: YouNodeProps) {
  const myPeerId = useRoomStore((s) => s.peerId);
  const avatar = useAvatarStore((s) => s.map[myPeerId]);
  const { isOver, handlers } = useDropTarget(onDropFile ?? noop);

  return (
    <button
      type="button"
      onClick={onRename}
      {...(onDropFile ? handlers : {})}
      style={{ left: x, top: y }}
      className="zr-node-in absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 outline-none"
    >
      <span
        className={`zr-sun-core transition-transform ${isOver ? "scale-110" : ""}`}
        style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}
      >
        {avatar ? "" : name.charAt(0).toUpperCase()}
      </span>
      <span className="text-center leading-tight">
        <span className="block text-sm font-semibold text-foreground">{name}</span>
        <span className="block font-mono text-[10px] text-muted-foreground">you · tap to edit</span>
      </span>
    </button>
  );
}
