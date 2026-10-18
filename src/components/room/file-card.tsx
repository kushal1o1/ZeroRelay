"use client";

import { useRoomContext } from "@/components/room-provider";
import { formatSize } from "@/lib/format";
import { isMarkdownFileName } from "@/lib/markdown";
import { useLobbyStore } from "@/stores/lobby-store";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import { type Transfer, isRunning, latestReceive, useTransferStore } from "@/stores/transfer-store";
import type { SharedItem } from "@/types/message";
import { useMemo } from "react";

const pillBtn =
  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition-opacity hover:opacity-90";
const primaryBtn = `${pillBtn} bg-accent text-accent-foreground`;
const ghostBtn = `${pillBtn} border border-border text-foreground hover:bg-muted`;

function speed(t: Transfer): string {
  const secs = (Date.now() - t.startedAt) / 1000;
  return secs > 0.5 && t.bytes > 0 ? `${formatSize(t.bytes / secs)}/s` : "";
}

function ProgressBar({ t, label }: { t: Transfer; label: string }) {
  const pct = t.total > 0 ? Math.min(100, Math.round((t.bytes / t.total) * 100)) : 0;
  return (
    <div className="min-w-0 flex-1">
      <div className="zr-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">
          {label} · {pct}%
        </span>
        <span className="shrink-0">{speed(t)}</span>
      </div>
    </div>
  );
}

/** A shared file: download / preview for receivers, live send status for the owner. */
export function FileCard({ item }: { item: SharedItem }) {
  const myPeerId = useRoomStore((s) => s.peerId);
  const mine = item.peerId === myPeerId;

  return (
    <div className="zr-filecard">
      <div className="flex items-center gap-2.5">
        <div className="zr-fc-ico">📄</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{item.fileName}</div>
          <div className="text-[11px] text-muted-foreground">{formatSize(item.fileSize || 0)}</div>
        </div>
        {item.retention === "forever" && (
          <button
            type="button"
            title="Delete from this device"
            aria-label="Delete from this device"
            onClick={() => useMessageStore.getState().removeItem(item.id)}
            className="shrink-0 self-start rounded px-1 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            🗑
          </button>
        )}
      </div>
      {mine ? <SendStatus item={item} /> : <ReceiveActions item={item} />}
    </div>
  );
}

/** Owner view: who is downloading this file right now. */
function SendStatus({ item }: { item: SharedItem }) {
  const { cancelTransfer } = useRoomContext();
  const all = useTransferStore((s) => s.transfers);
  const sends = useMemo(
    () =>
      Object.values(all)
        .filter((t) => t.itemId === item.id && t.direction === "send" && t.purpose === "download")
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 4),
    [all, item.id],
  );

  if (sends.length === 0) return <div className="mt-2 text-[10px] text-muted-foreground">Sent</div>;
  return (
    <div className="mt-2 space-y-1.5">
      {sends.map((t) =>
        isRunning(t) ? (
          <div key={t.id} className="flex items-center gap-2">
            <ProgressBar t={t} label={`Sending to ${t.peerName}`} />
            <button type="button" className={ghostBtn} onClick={() => cancelTransfer(t.id)}>
              Cancel
            </button>
          </div>
        ) : (
          <div key={t.id} className="text-[10px] text-muted-foreground">
            {t.status === "done"
              ? `Sent to ${t.peerName} ✓`
              : `${t.peerName}: ${t.status === "cancelled" ? "cancelled" : t.error || "failed"}`}
          </div>
        ),
      )}
    </div>
  );
}

/** Receiver view: download, progress, cancel, retry, save again. */
function ReceiveActions({ item }: { item: SharedItem }) {
  const { requestFile, cancelTransfer } = useRoomContext();
  const t = useTransferStore((s) => latestReceive(s.transfers, item.id));
  const saved = useTransferStore((s) => Boolean(s.saved[item.id]));
  const unavailable = useTransferStore((s) => s.unavailable[item.id]);
  const inRoom = useRoomStore((s) => s.peers.some((p) => p.id === item.peerId));
  const linked = useLobbyStore((s) => s.links[item.peerId]?.status === "linked");
  const ownerHere = inRoom || linked;
  const markdown = isMarkdownFileName(item.fileName);

  const previewBtn = markdown && !isRunning(t) && (
    <button type="button" className={ghostBtn} onClick={() => requestFile(item, "preview")}>
      Preview MD
    </button>
  );

  if (isRunning(t) && t) {
    const label =
      t.purpose === "preview"
        ? "Fetching preview"
        : t.status === "requesting"
          ? `Asking ${t.peerName}…`
          : "Downloading";
    return (
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar t={t} label={label} />
        <button type="button" className={ghostBtn} onClick={() => cancelTransfer(t.id)}>
          Cancel
        </button>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-accent">Downloaded ✓</span>
        <button type="button" className={primaryBtn} onClick={() => requestFile(item)}>
          Save again
        </button>
        {previewBtn}
      </div>
    );
  }

  if (unavailable) {
    return <div className="mt-2 text-[10px] text-muted-foreground">Unavailable: {unavailable}</div>;
  }

  if (!ownerHere && item.peerId) {
    return (
      <div className="mt-2 text-[10px] text-muted-foreground">
        {item.peerName} is offline. Ask them to share it again.
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className={primaryBtn} onClick={() => requestFile(item)}>
        {t?.status === "failed" ? "↻ try again" : "↓ download"}
      </button>
      {previewBtn}
      {t?.status === "failed" && t.error && (
        <span className="w-full text-[10px] text-destructive">{t.error}</span>
      )}
    </div>
  );
}
