"use client";

import { useUIStore } from "@/stores/ui-store";

export function RoomSwitcher() {
  const { rooms, activeRoomId, setActiveRoomId, setDialog } = useUIStore();

  return (
    <aside className="flex w-52 flex-col border-r border-border bg-muted/30">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Rooms
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setDialog("create")}
            className="flex h-6 items-center justify-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            + New
          </button>
          <button
            type="button"
            onClick={() => setDialog("join")}
            className="flex h-6 items-center justify-center rounded-md px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Join
          </button>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {rooms.map((room) => (
          <button
            type="button"
            key={room.id}
            onClick={() => setActiveRoomId(room.id)}
            className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              activeRoomId === room.id
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span
              className={`size-2 rounded-full ${room.id === "global" ? "bg-accent" : "bg-muted-foreground"}`}
            />
            <span className="truncate">{room.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
