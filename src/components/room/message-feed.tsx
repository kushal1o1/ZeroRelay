"use client";

import { useRoomContext } from "@/components/room-provider";
import { Avatar } from "@/components/ui/avatar";
import { useStorage } from "@/hooks/use-storage";
import { copyText } from "@/lib/clipboard";
import { formatSize } from "@/lib/format";
import { hashString } from "@/lib/hash";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useViewerStore } from "@/stores/viewer-store";
import { RETENTION_LABELS, type Retention, type SharedItem } from "@/types/message";
import { useEffect, useRef, useState } from "react";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function RetentionBadge({ retention }: { retention: Retention }) {
  return (
    <span className={`zr-ret ${retention === "forever" ? "zr-ret-forever" : ""}`}>
      {retention === "forever" ? "∞ forever" : RETENTION_LABELS[retention]}
    </span>
  );
}

const NOTE_COLORS = ["", "zr-note-pink", "zr-note-green", "zr-note-blue"];

export function NoteCard({ item }: { item: SharedItem }) {
  const color = NOTE_COLORS[hashString(item.id) % NOTE_COLORS.length];
  const open = useViewerStore((s) => s.open);
  return (
    <button
      type="button"
      className={`zr-note ${color} block border-0 text-left`}
      title="Click to open"
      onClick={() => open(item)}
    >
      {item.content}
      <span className="zr-note-by">— {item.peerName}</span>
    </button>
  );
}

export function CodeCard({ item }: { item: SharedItem }) {
  const [copied, setCopied] = useState(false);
  const openViewer = useViewerStore((s) => s.open);
  const code = item.content ?? "";
  const long = code.split("\n").length > 6 || code.length > 320;

  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  // A full-card <button> overlay (z-10) makes the whole snippet clickable; the
  // copy button sits in the bar above it (z-20) so it stays independently usable.
  return (
    <div className="zr-term relative">
      <div className="zr-term-bar relative z-20">
        <span className="zr-term-dot" style={{ background: "#6b6b6b" }} />
        <span className="zr-term-dot" style={{ background: "#8a8a8a" }} />
        <span className="zr-term-dot" style={{ background: "#a5a5a5" }} />
        <span className="zr-term-name">{item.fileName || "snippet"}</span>
        <button type="button" className="zr-term-copy" onClick={copy}>
          {copied ? "✓ copied" : "⧉ copy all"}
        </button>
      </div>
      <div className="zr-term-body">
        {code}
        {long && <div className="zr-term-fade" />}
      </div>
      <button
        type="button"
        aria-label="Open snippet"
        title="Click to open"
        onClick={() => openViewer(item)}
        className="absolute inset-0 z-10 cursor-zoom-in"
      />
    </div>
  );
}

export function FileCard({ item }: { item: SharedItem }) {
  const { requestFile } = useRoomContext();
  const myPeerId = useRoomStore((s) => s.peerId);
  const pct = useMessageStore((s) => s.progress[item.id]);
  const mine = item.peerId === myPeerId;
  const handleClick = () => requestFile(item);

  return (
    <div className="zr-filecard">
      <div className="flex items-center gap-2.5">
        <div className="zr-fc-ico">📄</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{item.fileName}</div>
          <div className="text-[11px] text-muted-foreground">{formatSize(item.fileSize || 0)}</div>
        </div>
      </div>
      {mine ? (
        <div className="mt-2 text-[10px] text-muted-foreground">Sent</div>
      ) : pct === undefined ? (
        <button
          type="button"
          onClick={handleClick}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1 font-mono text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          ↓ download
        </button>
      ) : pct >= 1 ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] text-accent">Saved</span>
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 font-mono text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            download again
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <div className="zr-bar">
            <i style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">{Math.round(pct * 100)}%</div>
        </div>
      )}
    </div>
  );
}

function MessageBody({ item, mine }: { item: SharedItem; mine: boolean }) {
  switch (item.type) {
    case "code":
      return <CodeCard item={item} />;
    case "note":
      return <NoteCard item={item} />;
    case "file":
      return <FileCard item={item} />;
    default:
      return (
        <div className={`zr-bubble ${mine ? "zr-bubble-out" : "zr-bubble-in"}`}>{item.content}</div>
      );
  }
}

/** The in-room chat: every shared item for the active room, oldest → newest. */
export function ChatFeed() {
  const { items } = useStorage();
  const myPeerId = useRoomStore((s) => s.peerId);
  const activeRoomId = useUIStore((s) => s.activeRoomId);
  const roomItems = items
    .filter((i) => i.roomId === activeRoomId)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  // Auto-scroll to the newest message so it's always in view without scrolling.
  const bottomRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the message count changes to pin the view to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [roomItems.length]);

  if (roomItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No messages yet — share something below.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {roomItems.map((item) => {
        const mine = item.peerId === myPeerId;
        return (
          <div key={item.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
            {!mine && <Avatar name={item.peerName} peerId={item.peerId} size="sm" />}
            <div className={`flex max-w-[82%] flex-col gap-1 ${mine ? "items-end" : ""}`}>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {!mine && <b className="text-foreground">{item.peerName}</b>}
                <time>{formatTime(item.timestamp)}</time>
                <RetentionBadge retention={item.retention} />
              </div>
              <MessageBody item={item} mine={mine} />
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
