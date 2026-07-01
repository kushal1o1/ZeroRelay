"use client";

import { ConnectionStatus } from "@/components/connection-status";
import { CreateRoomDialog } from "@/components/create-room-dialog";
import { NamePrompt } from "@/components/name-prompt";
import { useRoomContext } from "@/components/room-provider";
import { RoomSwitcher } from "@/components/room-switcher";
import { RoomView } from "@/components/room/room-view";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useRoomStore } from "@/stores/room-store";
import { useEffect } from "react";

export default function Home() {
  const name = useRoomStore((s) => s.name);
  const peerId = useRoomStore((s) => s.peerId);
  const connected = useRoomStore((s) => s.connected);
  const roomId = useRoomStore((s) => s.roomId);
  const { joinRoom } = useRoomContext();

  useEffect(() => {
    if (name !== "Anonymous" && peerId && !connected && !roomId) {
      joinRoom("global");
    }
  }, [name, peerId, connected, roomId, joinRoom]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <NamePrompt />
      <header className="flex items-center gap-4 border-b border-border px-4 py-2">
        <span className="shrink-0 font-mono text-sm font-bold tracking-tight text-accent">
          0Relay
        </span>
        <div className="min-w-0 flex-1">
          <RoomSwitcher />
        </div>
        <ConnectionStatus />
        <ThemeToggle />
      </header>
      <main className="min-h-0 flex-1">
        <RoomView />
      </main>
      <CreateRoomDialog />
    </div>
  );
}
