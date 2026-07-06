"use client";

import { CodeCard, FileCard } from "@/components/room/message-feed";
import { useStorage } from "@/hooks/use-storage";
import { hashString } from "@/lib/hash";
import { useUIStore } from "@/stores/ui-store";
import { useViewerStore } from "@/stores/viewer-store";
import type { SharedItem } from "@/types/message";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

type BoardTab = "note" | "code" | "file";

const TABS: { k: BoardTab; label: string }[] = [
  { k: "note", label: "📌 Notes" },
  { k: "code", label: "⌨ Code" },
  { k: "file", label: "📄 Files" },
];

const NOTE_COLORS = ["", "zr-note-pink", "zr-note-green", "zr-note-blue"];
const noteColor = (id: string) => NOTE_COLORS[hashString(id) % NOTE_COLORS.length];

interface Pos {
  x: number;
  y: number;
}

/** A default resting spot for a note that hasn't been dragged yet — a loose
 * cascade that wraps so notes don't march off the bottom of the board. */
function defaultPos(i: number): Pos {
  const col = Math.floor(i / 6);
  const row = i % 6;
  return { x: 10 + col * 30 + (row % 2) * 14, y: 10 + row * 86 };
}

/** One sticky note on the corkboard. Drag to reposition, tap (no drag) to open.
 * Mirrors the mockup: pointer-capture + a small move threshold separates a drag
 * from a tap so a click still opens the big viewer. */
function DraggableNote({
  item,
  initialX,
  initialY,
  rotation,
  containerRef,
  onOpen,
  onCommit,
}: {
  item: SharedItem;
  initialX: number;
  initialY: number;
  rotation: number;
  containerRef: RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onCommit: (x: number, y: number) => void;
}) {
  const [pos, setPos] = useState<Pos>({ x: initialX, y: initialY });
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0, lx: 0, ly: 0 });

  useEffect(() => setPos({ x: initialX, y: initialY }), [initialX, initialY]);

  return (
    <button
      type="button"
      draggable={false}
      onClick={() => {
        // Swallow the click that trails a drag; a real tap opens the viewer.
        if (drag.current.moved) {
          drag.current.moved = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={(e) => {
        drag.current = {
          active: true,
          moved: false,
          sx: e.clientX,
          sy: e.clientY,
          ox: pos.x,
          oy: pos.y,
          lx: pos.x,
          ly: pos.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d.active) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
        const cont = containerRef.current;
        const el = e.currentTarget;
        if (!cont) return;
        const nx = Math.max(0, Math.min(d.ox + dx, cont.clientWidth - el.offsetWidth));
        const ny = Math.max(0, Math.min(d.oy + dy, cont.clientHeight - el.offsetHeight));
        d.lx = nx;
        d.ly = ny;
        setPos({ x: nx, y: ny });
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d.active) return;
        d.active = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (d.moved) onCommit(d.lx, d.ly);
      }}
      className={`zr-note ${noteColor(item.id)} absolute touch-none select-none border-0 text-left`}
      style={{ left: pos.x, top: pos.y, transform: `rotate(${rotation}deg)`, cursor: "grab" }}
      title="Drag to move · click to open"
    >
      {item.content}
      <span className="zr-note-by">— {item.peerName}</span>
    </button>
  );
}

/** Free-form corkboard of draggable sticky notes. Positions are remembered per
 * room in localStorage (device-local — they aren't shared data). */
function NoteBoard({ notes, storageKey }: { notes: SharedItem[]; storageKey: string }) {
  const open = useViewerStore((s) => s.open);
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setPositions(raw ? JSON.parse(raw) : {});
    } catch {
      setPositions({});
    }
  }, [storageKey]);

  const commit = useCallback(
    (id: string, x: number, y: number) => {
      setPositions((prev) => {
        const next = { ...prev, [id]: { x, y } };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* storage full / unavailable — position just won't persist */
        }
        return next;
      });
    },
    [storageKey],
  );

  if (notes.length === 0) {
    return (
      <p className="pt-8 text-center text-xs text-muted-foreground">Nothing pinned here yet.</p>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {notes.map((item, i) => {
        const saved = positions[item.id] ?? defaultPos(i);
        return (
          <DraggableNote
            key={item.id}
            item={item}
            initialX={saved.x}
            initialY={saved.y}
            rotation={(hashString(item.id) % 7) - 3}
            containerRef={containerRef}
            onOpen={() => open(item)}
            onCommit={(x, y) => commit(item.id, x, y)}
          />
        );
      })}
    </div>
  );
}

/** Pinned spaces: the same shared items, grouped by type for the active room. */
export function SideBoard() {
  const { items } = useStorage();
  const activeRoomId = useUIStore((s) => s.activeRoomId);
  const [tab, setTab] = useState<BoardTab>("note");

  const list = items
    .filter((i) => i.roomId === activeRoomId && i.type === tab)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={`zr-sb-tab ${tab === t.k ? "zr-sb-tab-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "note" ? (
        <div className="min-h-0 flex-1">
          <NoteBoard notes={list} storageKey={`zr-note-pos:${activeRoomId}`} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {list.length === 0 ? (
            <p className="pt-8 text-center text-xs text-muted-foreground">
              Nothing pinned here yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((item) =>
                tab === "code" ? (
                  <CodeCard key={item.id} item={item} />
                ) : (
                  <FileCard key={item.id} item={item} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
