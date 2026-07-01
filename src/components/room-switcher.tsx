"use client";

import { useRoomContext } from "@/components/room-provider";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useCallback, useEffect, useRef, useState } from "react";

export function RoomSwitcher() {
  const { rooms, activeRoomId, setActiveRoomId, setDialog, removeRoom } = useUIStore();
  const { joinRoom, leaveRoom, sendSignaling } = useRoomContext();
  const connectedRoomId = useRoomStore((s) => s.roomId);
  const peerId = useRoomStore((s) => s.peerId);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openDropdown]);

  const handleSwitch = (roomId: string) => {
    setActiveRoomId(roomId);
    if (roomId !== connectedRoomId) {
      const room = rooms.find((r) => r.id === roomId);
      joinRoom(roomId, room?.password || undefined);
    }
  };

  const handleLeaveRoom = useCallback(
    (roomId: string) => {
      if (roomId === connectedRoomId) {
        leaveRoom();
      }
      removeRoom(roomId);
      setActiveRoomId("global");
      setOpenDropdown(null);
    },
    [connectedRoomId, leaveRoom, removeRoom, setActiveRoomId],
  );

  const canDelete = useCallback(
    (room: { id: string; createdBy?: string }) =>
      room.createdBy !== undefined && room.createdBy === peerId,
    [peerId],
  );

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {rooms.map((room) => {
        const active = activeRoomId === room.id;
        const isGlobal = room.id === "global";
        return (
          <div key={room.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => handleSwitch(room.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span
                className={`size-2 rounded-full ${
                  isGlobal ? "zr-pulse bg-signal" : "bg-muted-foreground"
                }`}
              />
              <span className="truncate">{room.name}</span>
              {room.hasPassword && <span className="text-xs opacity-60">🔒</span>}
            </button>
            {!isGlobal && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === room.id ? null : room.id);
                }}
                className="ml-0.5 rounded px-1 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                style={{ opacity: openDropdown === room.id ? undefined : undefined }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  if (openDropdown !== room.id) {
                    (e.currentTarget as HTMLElement).style.opacity = "0";
                  }
                }}
              >
                ⋮
              </button>
            )}
            {openDropdown === room.id && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => handleLeaveRoom(room.id)}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  Leave
                </button>
                {canDelete(room) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete "${room.name}"?`)) {
                        sendSignaling({ type: "delete-room", roomId: room.id, peerId });
                        removeRoom(room.id);
                        setActiveRoomId("global");
                        setOpenDropdown(null);
                      }
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onClick={() => setDialog("create")}
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        + New
      </button>
      <button
        type="button"
        onClick={() => setDialog("join")}
        className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Join
      </button>
    </nav>
  );
}
