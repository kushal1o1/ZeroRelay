"use client";

import { useRoomStore } from "@/stores/room-store";

export function ConnectionStatus() {
  const { connected } = useRoomStore();

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`size-2 rounded-full ${connected ? "bg-green-500" : "bg-destructive"}`} />
      {connected ? "Connected" : "Disconnected"}
    </div>
  );
}
