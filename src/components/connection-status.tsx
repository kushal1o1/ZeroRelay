"use client";

import { useRoomStore } from "@/stores/room-store";

export function ConnectionStatus() {
  const connected = useRoomStore((s) => s.connected);
  const peers = useRoomStore((s) => s.peers);
  const error = useRoomStore((s) => s.error);

  const localPeers = peers.filter((p) => p.locale === "local").length;

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={error || undefined}
    >
      <span
        className={`size-2 rounded-full ${
          connected ? "bg-green-500" : error ? "bg-destructive zr-pulse" : "bg-muted-foreground"
        }`}
      />
      {connected ? (
        <span className="hidden sm:inline text-muted-foreground">
          {peers.length} peer{peers.length !== 1 ? "s" : ""}
          {localPeers > 0 && ` (${localPeers} LAN)`}
        </span>
      ) : error ? (
        <span className="hidden sm:inline text-destructive">{error}</span>
      ) : (
        <span className="hidden sm:inline">Connecting...</span>
      )}
    </div>
  );
}
