"use client";

import { Avatar } from "@/components/ui/avatar";
import { useStorage } from "@/hooks/use-storage";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SharedFeed() {
  const { items } = useStorage();

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No shared items yet. Share something above!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Shared ({items.length})
      </h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
          >
            <Avatar name={item.peerName} size="sm" />
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
                <div className="mt-1 flex items-center gap-2 text-sm text-accent">
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
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
