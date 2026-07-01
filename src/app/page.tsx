"use client";

import { CreateRoomDialog } from "@/components/create-room-dialog";
import { NamePrompt } from "@/components/name-prompt";
import { RoomSwitcher } from "@/components/room-switcher";
import { RoomView } from "@/components/room/room-view";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useRoom } from "@/hooks/use-room";
import { useRoomStore } from "@/stores/room-store";
import { useEffect } from "react";

export default function Home() {
  const name = useRoomStore((s) => s.name);
  const peerId = useRoomStore((s) => s.peerId);
  const connected = useRoomStore((s) => s.connected);
  const roomId = useRoomStore((s) => s.roomId);
  const { joinRoom } = useRoom();

  useEffect(() => {
    if (name !== "Anonymous" && peerId && !connected && !roomId) {
      joinRoom("global");
    }
  }, [name, peerId, connected, roomId, joinRoom]);

  return (
    <div className="flex h-screen">
      <NamePrompt />
      <RoomSwitcher />
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-end px-6 py-2 border-b border-border">
          <ThemeToggle />
        </header>
        <RoomView />
      </main>
      <CreateRoomDialog />
    </div>
  );
}
