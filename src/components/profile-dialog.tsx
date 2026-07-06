"use client";

import { useRoomContext } from "@/components/room-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAvatarStore } from "@/stores/avatar-store";
import { useRoomStore } from "@/stores/room-store";
import { useEffect, useRef, useState } from "react";

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Edit your display name + avatar (persisted on-device, broadcast to peers). */
export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const myPeerId = useRoomStore((s) => s.peerId);
  const myName = useRoomStore((s) => s.name);
  const { rename, updateAvatar } = useRoomContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editName, setEditName] = useState(myName);
  const [editAvatar, setEditAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEditName(myName);
      setEditAvatar(useAvatarStore.getState().map[myPeerId] || null);
    }
  }, [open, myName, myPeerId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.size > 500 * 1024) return;
    readFileAsDataURL(file).then((dataUrl) => {
      setEditAvatar(dataUrl);
      updateAvatar(dataUrl);
    });
    e.target.value = "";
  };

  const handleSave = () => {
    if (editName.trim() && editName.trim() !== myName) rename(editName.trim());
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
        <Input
          id="profile-name"
          label="Display name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          maxLength={32}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
