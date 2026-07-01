"use client";

import { useRoomContext } from "@/components/room-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import { useState } from "react";

export function CreateRoomDialog() {
  const { dialog, setDialog, addRoom } = useUIStore();
  const { joinRoom } = useRoomContext();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const isOpen = dialog === "create" || dialog === "join";
  const isCreate = dialog === "create";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = name.toLowerCase().replace(/\s+/g, "-");
    addRoom({ id, name, hasPassword: !!password });
    joinRoom(id, password || undefined);
    setDialog(null);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => setDialog(null)}
      title={isCreate ? "Create Room" : "Join Room"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="room-name"
          label="Room name"
          placeholder="e.g. my-room"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          id="room-password"
          label="Password (optional)"
          type="password"
          placeholder="leave blank for open room"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button type="submit">{isCreate ? "Create" : "Join"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
