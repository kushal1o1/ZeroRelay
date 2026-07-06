"use client";

import { RadarCanvas, type RadarHandle } from "@/components/radar/radar-canvas";
import { useRoomContext } from "@/components/room-provider";
import { ChatFeed } from "@/components/room/message-feed";
import { Composer } from "@/components/room/share-panel";
import { SideBoard } from "@/components/room/side-board";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import type { ItemType, Retention } from "@/types/message";
import { useEffect, useRef, useState } from "react";

type MobileView = "radar" | "board" | "chat";

const MOBILE_TABS: { k: MobileView; label: string }[] = [
  { k: "radar", label: "◍ Radar" },
  { k: "board", label: "📌 Board" },
  { k: "chat", label: "💬 Chat" },
];

/** The room body: solar-system radar · pinned board · chat dock. All three read
 * the same store, so the radar always reflects the current room's members. */
export function RoomView({ onEditProfile }: { onEditProfile: () => void }) {
  const peers = useRoomStore((s) => s.peers);
  const myPeerId = useRoomStore((s) => s.peerId);
  const connected = useRoomStore((s) => s.connected);
  const activeRoomId = useUIStore((s) => s.activeRoomId);
  const { shareText, shareFile } = useRoomContext();

  // A message can target several peers at once (empty = broadcast to everyone).
  const [selectedPeerIds, setSelectedPeerIds] = useState<string[]>([]);
  const [radarOff, setRadarOff] = useState(false);
  const [view, setView] = useState<MobileView>("chat");
  const radarRef = useRef<RadarHandle>(null);

  const others = peers.filter((p) => p.id !== myPeerId);

  const togglePeer = (id: string) =>
    setSelectedPeerIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Drop any selected peers that have since left (or when the room changes).
  useEffect(() => {
    setSelectedPeerIds((ids) => {
      const next = ids.filter((id) => peers.some((p) => p.id === id));
      return next.length === ids.length ? ids : next;
    });
  }, [peers]);

  // Play the incoming radar animation (packet → sun + ping) when a message
  // arrives from someone else. We track seen ids so existing history on first
  // load — and our own sent messages — don't retrigger it.
  const items = useMessageStore((s) => s.items);
  const seenIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(items.map((i) => i.id));
      return;
    }
    const seen = seenIdsRef.current;
    for (const it of items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      if (it.peerId !== myPeerId && it.roomId === activeRoomId) {
        radarRef.current?.playReceive(it.peerId);
      }
    }
  }, [items, myPeerId, activeRoomId]);

  const handleSend = (text: string, type: ItemType, retention: Retention) => {
    const targets = selectedPeerIds.length ? selectedPeerIds : undefined;
    shareText(text, targets, type, retention);
    radarRef.current?.playSend(targets ?? null);
  };
  const handleSendFile = (file: File, retention: Retention) => {
    const targets = selectedPeerIds.length ? selectedPeerIds : undefined;
    shareFile(file, targets, retention);
    radarRef.current?.playSend(targets ?? null);
  };

  const roomLabel = activeRoomId === "global" ? "global" : activeRoomId;
  const glass = { background: "var(--panel)" } as const;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Radar collapsed → a slim rail to reopen it (its own column, so it
            never overlaps the board tabs) */}
        {radarOff && (
          <button
            type="button"
            onClick={() => setRadarOff(false)}
            title="Show radar"
            aria-label="Show radar"
            className="hidden shrink-0 items-center justify-center border-r border-border font-mono text-xs text-accent transition-colors hover:bg-muted md:flex md:w-12"
            style={glass}
          >
            <span className="rotate-180 tracking-wide [writing-mode:vertical-rl]">
              ◍ show radar
            </span>
          </button>
        )}
        {/* Radar stage */}
        <section
          className={`relative min-h-0 flex-1 ${radarOff ? "md:hidden" : ""} ${
            view === "radar" ? "" : "max-md:hidden"
          }`}
        >
          <RadarCanvas
            ref={radarRef}
            selectedPeerIds={selectedPeerIds}
            onTogglePeer={togglePeer}
            onRename={onEditProfile}
            /* drops target the dropped-on peer; the canvas plays its own animation */
            onSendFile={(file, targetPeerId) =>
              shareFile(file, targetPeerId ?? undefined, "forever")
            }
          />
          <button
            type="button"
            onClick={() => setRadarOff(true)}
            title="Hide radar"
            className="zr-tactile absolute left-3 top-3 z-10 hidden items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur md:inline-flex"
            style={glass}
          >
            ◍ hide radar
          </button>
        </section>

        {/* Pinned board */}
        <aside
          className={`min-h-0 w-full shrink-0 border-l border-border backdrop-blur-md md:w-80 ${
            view === "board" ? "" : "max-md:hidden"
          }`}
          style={glass}
        >
          <SideBoard />
        </aside>

        {/* Chat dock */}
        <aside
          className={`flex min-h-0 w-full shrink-0 flex-col border-l border-border backdrop-blur-md md:w-[420px] ${
            radarOff ? "md:flex-1" : ""
          } ${view === "chat" ? "" : "max-md:hidden"}`}
          style={glass}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div>
              <b className="text-sm text-foreground">Chat</b>{" "}
              <span className="font-mono text-sm text-accent">#{roomLabel}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {connected ? `${others.length} online` : "connecting…"}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatFeed />
          </div>
          <Composer
            peers={others.map((p) => ({ id: p.id, name: p.name }))}
            selectedPeerIds={selectedPeerIds}
            onTogglePeer={togglePeer}
            onClearTargets={() => setSelectedPeerIds([])}
            onSend={handleSend}
            onSendFile={handleSendFile}
          />
        </aside>
      </div>

      {/* Mobile view switch */}
      <nav
        className="flex h-14 shrink-0 border-t border-border backdrop-blur-md md:hidden"
        style={glass}
      >
        {MOBILE_TABS.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setView(t.k)}
            className={`flex-1 font-mono text-sm ${
              view === t.k ? "text-accent" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
