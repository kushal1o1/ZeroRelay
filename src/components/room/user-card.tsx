"use client";

import { Avatar } from "@/components/ui/avatar";
import type { Peer } from "../../../shared/types";

interface UserCardProps {
  peer: Peer;
  isSelected?: boolean;
  onClick?: () => void;
}

export function UserCard({ peer, isSelected, onClick }: UserCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors text-left ${
        isSelected ? "border-accent bg-accent/5" : "border-border bg-card hover:border-accent/50"
      }`}
    >
      <Avatar name={peer.name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{peer.name}</p>
        <p className="text-xs text-muted-foreground">Online</p>
      </div>
    </button>
  );
}
