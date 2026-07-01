"use client";

import { useUIStore } from "@/stores/ui-store";

export function RoomSwitcher() {
  const { rooms, activeRoomId, setActiveRoomId, setDialog } = useUIStore();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {rooms.map((room) => {
        const active = activeRoomId === room.id;
        return (
          <button
            type="button"
            key={room.id}
            onClick={() => setActiveRoomId(room.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm transition-colors ${
              active
                ? "bg-accent/10 text-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                room.id === "global" ? "zr-pulse bg-signal" : "bg-muted-foreground"
              }`}
            />
            <span className="truncate">{room.name}</span>
            {room.hasPassword && <span className="text-xs opacity-60">🔒</span>}
          </button>
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
