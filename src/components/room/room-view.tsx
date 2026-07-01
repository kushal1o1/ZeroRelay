"use client";
import { ConnectionStatus } from "@/components/connection-status";
import { useRoomContext } from "@/components/room-provider";
import { SharedFeed } from "@/components/room/message-feed";
import { PresenceList } from "@/components/room/presence-list";
import { SharePanel } from "@/components/room/share-panel";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import type { ItemType, Retention } from "@/types/message";
import { useState } from "react";

export function RoomView() {
  const { peers, connected, error } = useRoomStore();
  const { activeRoomId } = useUIStore();
  const { shareText, shareFile } = useRoomContext();
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const targetPeer = selectedPeerId ? peers.find((p) => p.id === selectedPeerId) : null;

  const handleSend = (text: string, type: ItemType, retention: Retention) =>
    shareText(text, selectedPeerId || undefined, type, retention);
  const handleSendFile = (file: File, retention: Retention) =>
    shareFile(file, selectedPeerId || undefined, retention);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {activeRoomId === "global" ? "Global" : activeRoomId}
            </h1>
            <p className="text-xs text-muted-foreground">
              {connected
                ? `${peers.length} peer${peers.length !== 1 ? "s" : ""} online`
                : "Connecting..."}
            </p>
          </div>
        </div>
        <ConnectionStatus />
      </header>
      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-1 gap-6 overflow-hidden p-6">
        <div className="w-72 shrink-0 overflow-y-auto space-y-6">
          <PresenceList selectedPeerId={selectedPeerId} onSelectPeer={setSelectedPeerId} />
          <SharedFeed />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SharePanel
            targetName={targetPeer?.name || null}
            onSend={handleSend}
            onSendFile={handleSendFile}
          />
        </div>
      </div>
    </div>
  );
}
