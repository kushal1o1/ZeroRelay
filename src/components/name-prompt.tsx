"use client";

import { Button } from "@/components/ui/button";
import { useRoomStore } from "@/stores/room-store";
import { useState } from "react";

export function NamePrompt() {
  const name = useRoomStore((s) => s.name);
  const setName = useRoomStore((s) => s.setName);
  const [input, setInput] = useState("");
  const peerId = useRoomStore((s) => s.peerId);

  if (name !== "Anonymous" || peerId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const final = input.trim() || `User-${Math.random().toString(36).slice(2, 6)}`;
    setName(final);
    localStorage.setItem("zerorelay-name", final);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg space-y-4"
      >
        <h2 className="text-lg font-semibold text-foreground">Welcome to ZeroRelay</h2>
        <p className="text-sm text-muted-foreground">Pick a display name to get started</p>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Your name"
          maxLength={32}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <Button type="submit" className="w-full">
          Join Global Room
        </Button>
      </form>
    </div>
  );
}
