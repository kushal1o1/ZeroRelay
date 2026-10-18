"use client";

import { useRoomContext } from "@/components/room-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { makeAvatar } from "@/lib/avatar";
import { useAvatarStore } from "@/stores/avatar-store";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useEffect, useRef, useState } from "react";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onEraseAll: () => void;
}

/** Edit your display name + avatar (persisted on-device, broadcast to peers). */
export function ProfileDialog({ open, onClose, onEraseAll }: ProfileDialogProps) {
  const myPeerId = useRoomStore((s) => s.peerId);
  const myName = useRoomStore((s) => s.name);
  const visibility = useUIStore((s) => s.visibility);
  const { rename, updateAvatar, setVisibility } = useRoomContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editName, setEditName] = useState(myName);
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [listed, setListed] = useState(visibility === "world");

  useEffect(() => {
    if (open) {
      setEditName(myName);
      setEditAvatar(useAvatarStore.getState().map[myPeerId] || null);
      setListed(useUIStore.getState().visibility === "world");
    }
  }, [open, myName, myPeerId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    makeAvatar(file)
      .then((dataUrl) => {
        setEditAvatar(dataUrl);
        updateAvatar(dataUrl);
      })
      .catch((err: Error) => setAvatarError(err.message));
  };

  const handleSave = () => {
    if (editName.trim() && editName.trim() !== myName) rename(editName.trim());
    const nextVisibility = listed ? "world" : "hidden";
    if (nextVisibility !== visibility) setVisibility(nextVisibility);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Your profile">
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
        {avatarError && <p className="text-center text-xs text-destructive">{avatarError}</p>}
        <Input
          id="profile-name"
          label="Display name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          maxLength={32}
        />
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="text-foreground">Show me to people on other networks</span>
            <span className="block text-xs text-muted-foreground">
              Lists your name in the Global lobby. Nothing is sent to you unless you accept it.
              People on your own network always see you.
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
            Danger zone
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Wipe all local messages, files, avatars, and settings.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0"
              onClick={() => {
                onClose();
                onEraseAll();
              }}
            >
              Erase all data
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
