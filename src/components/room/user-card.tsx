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
      <Avatar name={peer.name} peerId={peer.id} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground truncate">{peer.name}</p>
          {peer.locale === "local" && (
            <span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              LAN
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Online</p>
      </div>
    </button>
  );
}
