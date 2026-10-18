"use client";

import { useRoomContext } from "@/components/room-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { generateRoomCode, normalizeRoomCode } from "@/lib/id";
import { useUIStore } from "@/stores/ui-store";
import { useEffect, useState } from "react";
import { LIMITS, ROOM_ID_RE } from "../../shared/types";

/** Create a private room (gets a random code) or join one by its code.
 *  The room only appears in the switcher once the server accepts the join. */
export function CreateRoomDialog() {
  const dialog = useUIStore((s) => s.dialog);
  const dialogRoomId = useUIStore((s) => s.dialogRoomId);
  const setDialog = useUIStore((s) => s.setDialog);
  const { joinRoom } = useRoomContext();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const isOpen = dialog === "create" || dialog === "join";
  const isCreate = dialog === "create";

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setCode(dialogRoomId ?? "");
    setPassword("");
    setCodeError(null);
  }, [isOpen, dialogRoomId]);

  const close = () => setDialog(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreate) {
      joinRoom(generateRoomCode(), {
        create: { name: name.trim(), password: password || undefined },
      });
    } else {
      const roomId = normalizeRoomCode(code);
      if (!ROOM_ID_RE.test(roomId)) {
        setCodeError("That doesn't look like a room code");
        return;
      }
      joinRoom(roomId, { password: password || undefined });
    }
    close();
  };

  return (
    <Dialog open={isOpen} onClose={close} title={isCreate ? "Create Room" : "Join Room"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isCreate ? (
          <Input
            id="room-name"
            label="Room name"
            placeholder="e.g. design team"
            value={name}
            maxLength={LIMITS.roomName}
            onChange={(e) => setName(e.target.value)}
            required
          />
        ) : (
          <div className="space-y-1">
            <Input
              id="room-code"
              label="Room code"
              placeholder="ask the room creator for it"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(null);
              }}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              required
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
          </div>
        )}
        <Input
          id="room-password"
          label={isCreate ? "Password (optional)" : "Password (if the room has one)"}
          type="password"
          placeholder={isCreate ? "leave blank for an open room" : ""}
          value={password}
          maxLength={LIMITS.password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">{isCreate ? "Create" : "Join"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
