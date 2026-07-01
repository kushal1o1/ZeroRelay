"use client";

import { useRoomContext } from "@/components/room-provider";
import { UserCard } from "@/components/room/user-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRoomStore } from "@/stores/room-store";
import { useRef, useState } from "react";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface PresenceListProps {
  selectedPeerId: string | null;
  onSelectPeer: (peerId: string | null) => void;
}

export function PresenceList({ selectedPeerId, onSelectPeer }: PresenceListProps) {
  const peers = useRoomStore((s) => s.peers);
  const myPeerId = useRoomStore((s) => s.peerId);
  const myName = useRoomStore((s) => s.name);
  const connected = useRoomStore((s) => s.connected);
  const { rename, updateAvatar } = useRoomContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [editName, setEditName] = useState(myName);
  const [editAvatar, setEditAvatar] = useState<string | null>(null);

  const filteredPeers = peers.filter((p) => p.id !== myPeerId);

  const openProfile = () => {
    setEditName(myName);
    setEditAvatar(null);
    setProfileOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 500 * 1024) return;
    readFileAsDataURL(file).then(setEditAvatar);
    e.target.value = "";
  };

  const handleSave = () => {
    if (editName.trim() && editName.trim() !== myName) rename(editName.trim());
    if (editAvatar) updateAvatar(editAvatar);
    setProfileOpen(false);
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
          onClick={openProfile}
          className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-left transition-colors hover:border-accent/50"
        >
          <Avatar name={myName} peerId={myPeerId} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{myName}</p>
            <p className="text-xs text-muted-foreground">You — tap to edit profile</p>
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

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} title="Edit Profile">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              {editAvatar ? (
                <img src={editAvatar} alt="Preview" className="size-20 rounded-full object-cover" />
              ) : (
                <Avatar name={editName} size="lg" />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground shadow"
              >
                +
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Input
            id="profile-name"
            label="Display name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={32}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setProfileOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
