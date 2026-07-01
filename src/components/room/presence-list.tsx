"use client";

import { UserCard } from "@/components/room/user-card";
import { Avatar } from "@/components/ui/avatar";
import { useRoomStore } from "@/stores/room-store";

interface PresenceListProps {
  selectedPeerId: string | null;
  onSelectPeer: (peerId: string | null) => void;
}

export function PresenceList({ selectedPeerId, onSelectPeer }: PresenceListProps) {
  const peers = useRoomStore((s) => s.peers);
  const myPeerId = useRoomStore((s) => s.peerId);
  const myName = useRoomStore((s) => s.name);
  const setName = useRoomStore((s) => s.setName);
  const connected = useRoomStore((s) => s.connected);

  const filteredPeers = peers.filter((p) => p.id !== myPeerId);

  const handleRename = () => {
    const next = prompt("Enter new name:", myName);
    if (next?.trim()) {
      setName(next.trim());
      localStorage.setItem("zerorelay-name", next.trim());
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Peers ({filteredPeers.length})
        </h3>
        {selectedPeerId && (
          <button
            type="button"
            onClick={() => onSelectPeer(null)}
            className="text-xs text-accent hover:underline"
          >
            Broadcast
          </button>
        )}
      </div>

      {connected && (
        <button
          type="button"
          onClick={handleRename}
          className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-left transition-colors hover:border-accent/50"
        >
          <Avatar name={myName} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{myName}</p>
            <p className="text-xs text-muted-foreground">You — click to rename</p>
          </div>
        </button>
      )}

      {filteredPeers.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Waiting for others to join...
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {filteredPeers.map((peer) => (
            <UserCard
              key={peer.id}
              peer={peer}
              isSelected={selectedPeerId === peer.id}
              onClick={() => onSelectPeer(selectedPeerId === peer.id ? null : peer.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
