"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMessageStore } from "@/stores/message-store";
import { useUIStore } from "@/stores/ui-store";
import { useState } from "react";

const CONFIRM_PHRASE = "DELETE ALL";

interface SuperDeleteDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Wipes every trace of local data — IndexedDB, localStorage, stores — and
 *  restarts the app fresh, GitHub-style ("type the phrase to confirm"). */
export function SuperDeleteDialog({ open, onClose }: SuperDeleteDialogProps) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmed = phrase === CONFIRM_PHRASE;

  const erase = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await useMessageStore.getState().clearAll();
      localStorage.removeItem("zerorelay-name");
      localStorage.removeItem("zerorelay-peerId");
      localStorage.removeItem("theme");
      useUIStore.persist.clearStorage();
      window.location.reload();
    } catch (err) {
      console.error("Erase all data failed", err);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Erase all data">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This permanently deletes <b className="text-foreground">everything</b> stored on this
          device - all messages, files, avatars, your name, and rooms. This cannot be undone.
        </p>
        <Input
          id="erase-phrase"
          label={`Type "${CONFIRM_PHRASE}" to confirm`}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={erase} disabled={!confirmed || busy}>
            {busy ? "Erasing…" : "Erase everything"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
