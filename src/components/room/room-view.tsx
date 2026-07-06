"use client";
import { useRoomContext } from "@/components/room-provider";
import { SharedFeed } from "@/components/room/message-feed";
import { PresenceList } from "@/components/room/presence-list";
import { SharePanel } from "@/components/room/share-panel";
import { useRoomStore } from "@/stores/room-store";
import type { ItemType, Retention } from "@/types/message";
import { useEffect, useState } from "react";

export function RoomView() {
  const { peers, connected, error } = useRoomStore();
  const { shareText, shareFile } = useRoomContext();
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const targetPeer = selectedPeerId ? peers.find((p) => p.id === selectedPeerId) : null;

  useEffect(() => {
    if (selectedPeerId && !peers.some((p) => p.id === selectedPeerId)) {
      setSelectedPeerId(null);
    }
  }, [peers, selectedPeerId]);

  const handleSend = (text: string, type: ItemType, retention: Retention) =>
    shareText(text, selectedPeerId || undefined, type, retention);
  const handleSendFile = (file: File, retention: Retention) =>
    shareFile(file, selectedPeerId || undefined, retention);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {error && (
        <div className="mx-4 mt-2 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {connected && peers.length === 0 && !error && (
        <div className="mx-4 mt-2 rounded-lg bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
          No peers in this room
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2 sm:flex-row sm:gap-6 sm:p-6">
        <div className="flex flex-1 flex-col gap-2 overflow-hidden min-h-0 sm:flex-row sm:gap-6">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:w-72 sm:shrink-0">
            <div className="hidden sm:block overflow-y-auto">
              <PresenceList selectedPeerId={selectedPeerId} onSelectPeer={setSelectedPeerId} />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <SharedFeed />
            </div>
          </div>
          <div className="shrink-0 sm:w-auto sm:flex-1 sm:overflow-y-auto">
            {selectedPeerId && (
              <div className="mb-2 rounded-lg bg-muted px-2 py-1 text-center text-xs text-muted-foreground sm:hidden">
                Sharing to: {targetPeer?.name || "selected peer"}
              </div>
            )}
            <SharePanel
              targetName={targetPeer?.name || null}
              onSend={handleSend}
              onSendFile={handleSendFile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
