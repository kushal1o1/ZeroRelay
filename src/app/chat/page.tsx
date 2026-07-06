"use client";

import { ConnectionStatus } from "@/components/connection-status";
import { CreateRoomDialog } from "@/components/create-room-dialog";
import { useRoomContext } from "@/components/room-provider";
import { RoomSwitcher } from "@/components/room-switcher";
import { RoomView } from "@/components/room/room-view";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useEffect } from "react";

export default function Home() {
  const peerId = useRoomStore((s) => s.peerId);
  const connected = useRoomStore((s) => s.connected);
  const roomId = useRoomStore((s) => s.roomId);
  const hydrated = useUIStore((s) => s.hydrated);
  const activeRoomId = useUIStore((s) => s.activeRoomId);
  const { joinRoom } = useRoomContext();

  useEffect(() => {
    if (!hydrated) return;
    if (peerId && !connected && !roomId) {
      joinRoom(activeRoomId || "global");
    }
  }, [hydrated, peerId, connected, roomId, activeRoomId, joinRoom]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <RoomSwitcher />
        <div className="ml-auto flex items-center gap-2">
          <ConnectionStatus />
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <RoomView />
      </main>
      <CreateRoomDialog />
    </div>
  );
}
