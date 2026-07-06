"use client";

import { useRoomContext } from "@/components/room-provider";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useCallback, useEffect, useRef, useState } from "react";

export function RoomSwitcher() {
  const { rooms, activeRoomId, setActiveRoomId, setDialog, removeRoom } = useUIStore();
  const { joinRoom, leaveRoom, sendSignaling } = useRoomContext();
  const connected = useRoomStore((s) => s.connected);
  const connectedRoomId = useRoomStore((s) => s.roomId);
  const peerId = useRoomStore((s) => s.peerId);
  const peers = useRoomStore((s) => s.peers);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  const handleSwitch = (roomId: string) => {
    setOpen(false);
    setActiveRoomId(roomId);
    if (roomId !== connectedRoomId) {
      const room = rooms.find((r) => r.id === roomId);
      joinRoom(roomId, room?.password || undefined);
    }
  };

  const handleLeave = useCallback(
    (roomId: string) => {
      setOpen(false);
      if (roomId === connectedRoomId) leaveRoom();
      removeRoom(roomId);
    },
    [connectedRoomId, leaveRoom, removeRoom],
  );

  const handleDelete = useCallback(
    (roomId: string) => {
      setOpen(false);
      if (window.confirm("Delete this room?")) {
        sendSignaling({ type: "delete-room", roomId, peerId });
        removeRoom(roomId);
      }
    },
    [peerId, sendSignaling, removeRoom],
  );

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline shrink-0 font-mono text-sm font-bold tracking-tight text-accent">
          0Relay
        </span>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          <span
            className={`size-2 shrink-0 rounded-full ${
              activeRoomId === "global"
                ? "bg-signal zr-pulse"
                : connected
                  ? "bg-green-500"
                  : "bg-destructive"
            }`}
          />
          <span className="text-foreground">{activeRoom?.name || "Global"}</span>
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {peers.length > 0 && `(${peers.length})`}
          </span>
          <svg
            className="size-3 text-muted-foreground"
            aria-hidden="true"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setDialog("create")}
          className="hidden sm:inline shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          + New
        </button>
        <button
          type="button"
          onClick={() => setDialog("join")}
          className="hidden sm:inline shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Join
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {rooms.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">No rooms</p>
            )}
            {rooms.map((room) => {
              const isActive = activeRoomId === room.id;
              return (
                <div
                  key={room.id}
                  className={`flex items-center gap-1 px-1 ${isActive ? "bg-accent/5" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => handleSwitch(room.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        room.id === "global"
                          ? "bg-signal"
                          : isActive && connected
                            ? "bg-green-500"
                            : "bg-muted-foreground"
                      }`}
                    />
                    <span className="truncate text-foreground">{room.name}</span>
                    {room.hasPassword && (
                      <span className="shrink-0 text-xs text-muted-foreground">🔒</span>
                    )}
                    {isActive && connected && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {peers.length} peer{peers.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                  {room.id !== "global" && (
                    <div className="flex shrink-0 items-center gap-0.5 pr-1">
                      <button
                        type="button"
                        onClick={() => handleLeave(room.id)}
                        className="rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Leave
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(room.id)}
                        className="rounded px-1.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                      >
                        Del
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
