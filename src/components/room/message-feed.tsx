"use client";

import { useRoomContext } from "@/components/room-provider";
import { Avatar } from "@/components/ui/avatar";
import { useStorage } from "@/hooks/use-storage";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import type { SharedItem } from "@/types/message";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileRow({ item }: { item: SharedItem }) {
  const { requestFile } = useRoomContext();
  const myPeerId = useRoomStore((s) => s.peerId);
  const pct = useMessageStore((s) => s.progress[item.id]);
  const mine = item.peerId === myPeerId;

  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2 text-sm text-accent">
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M7 1v8M3 5l4 4 4-4M1 11v2h12v-2" />
        </svg>
        <span className="truncate">{item.fileName}</span>
        <span className="text-muted-foreground">({formatSize(item.fileSize || 0)})</span>
      </div>
      {mine ? (
        <span className="text-[10px] text-muted-foreground">Sent</span>
      ) : pct === undefined ? (
        <button
          type="button"
          onClick={() => requestFile(item)}
          className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Download
        </button>
      ) : pct >= 1 ? (
        <span className="text-[10px] text-accent">Saved ✓</span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{Math.round(pct * 100)}%</span>
      )}
    </div>
  );
}

export function SharedFeed() {
  const { items } = useStorage();
  const activeRoomId = useUIStore((s) => s.activeRoomId);
  const roomItems = (activeRoomId ? items.filter((i) => i.roomId === activeRoomId) : items)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);

  if (roomItems.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No shared items yet. Share something above!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Shared ({roomItems.length})
      </h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {roomItems.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
          >
            <Avatar name={item.peerName} peerId={item.peerId} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{item.peerName}</span>
                <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
              </div>
              {item.type === "text" ? (
                <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words line-clamp-3">
                  {item.content}
                </p>
              ) : (
                <FileRow item={item} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
