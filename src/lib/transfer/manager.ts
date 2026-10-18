import { generateId } from "@/lib/id";
import type { PeerMesh } from "@/lib/peer-mesh";
import { TRANSFER_CHANNEL_PREFIX } from "@/lib/peer-protocol";
import { type Transfer, useTransferStore } from "@/stores/transfer-store";
import type { FileError, FileRequest, SharedItem, TransferPurpose } from "@/types/message";
import { type FileSink, createSink } from "./sinks";
import { type Running, TransferError, receiveFile, sendFile } from "./stream";

// Orchestrates file transfers in both directions:
//   receiver: request() → owner opens "xfer:<id>" channel → receiveFile() → sink
//   owner:    serve()   → authorize → openChannel() → sendFile()
// Every transfer is mirrored into the transfer store for the UI.

/** After a request, the owner must open the transfer channel within this. */
const CHANNEL_WAIT_MS = 30_000;
const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const PROGRESS_EVERY_MS = 200;

export interface TransferDeps {
  mesh: PeerMesh;
  /** Open (or wait for) a link to a peer we're allowed to dial. */
  ensure: (peerId: string) => Promise<boolean>;
  /** Is this peer currently in room `roomId` with us? */
  inRoom: (peerId: string, roomId: string) => boolean;
  peerName: (peerId: string) => string;
}

interface Offered {
  file: File;
  roomId: string;
  /** Direct share: only these peers may fetch it. `null` = anyone in the room. */
  recipients: Set<string> | null;
}

interface Pending {
  item: SharedItem;
  sink: FileSink;
  timer: ReturnType<typeof setTimeout>;
  resolve: (blob: Blob) => void;
  reject: (err: TransferError) => void;
}

const store = () => useTransferStore.getState();

export class TransferManager {
  private offered = new Map<string, Offered>();
  private pending = new Map<string, Pending>();
  private running = new Map<string, Running>();
  /** Receives cancelled while still being set up (before they're pending). */
  private cancelled = new Set<string>();

  constructor(private readonly deps: TransferDeps) {}

  // ── Owner side ──

  /** Remember a file we shared so we can serve it on request. */
  offer(itemId: string, file: File, roomId: string, recipients: string[] | null) {
    this.offered.set(itemId, { file, roomId, recipients: recipients && new Set(recipients) });
  }

  localFile(itemId: string): File | undefined {
    return this.offered.get(itemId)?.file;
  }

  serve(from: string, req: FileRequest) {
    const offered = this.offered.get(req.sharedItemId);
    if (!offered) {
      return this.refuse(from, req, "The sender no longer has this file.", true);
    }
    const allowed = offered.recipients
      ? offered.recipients.has(from)
      : this.deps.inRoom(from, offered.roomId);
    if (!allowed) return this.refuse(from, req, "This file wasn't shared with you.");

    const ch = this.deps.mesh.openChannel(from, TRANSFER_CHANNEL_PREFIX + req.transferId);
    if (!ch) return;

    const t: Transfer = {
      id: req.transferId,
      itemId: req.sharedItemId,
      peerId: from,
      peerName: this.deps.peerName(from),
      direction: "send",
      purpose: req.purpose,
      bytes: 0,
      total: offered.file.size,
      startedAt: Date.now(),
      status: "active",
    };
    store().upsert(t);
    const running = sendFile(ch, offered.file, {
      onAck: this.progress(t.id),
      maxMessageSize: this.deps.mesh.maxMessageSize(from),
    });
    this.track(t.id, running);
  }

  // ── Receiver side ──

  /** Fetch an item's bytes from its owner. Progress and errors go to the store. */
  async request(item: SharedItem, purpose: TransferPurpose): Promise<Blob> {
    const id = generateId();
    const total = item.fileSize ?? 0;
    store().upsert({
      id,
      itemId: item.id,
      peerId: item.peerId,
      peerName: item.peerName,
      direction: "receive",
      purpose,
      bytes: 0,
      total,
      startedAt: Date.now(),
      status: "requesting",
    });

    let sink: FileSink | null = null;
    try {
      if (purpose === "preview" && total > PREVIEW_MAX_BYTES) {
        throw new TransferError("Too large to preview. Download it instead.");
      }
      // Prepare storage before asking, so the first chunk has somewhere to go.
      sink = await createSink(id, total, item.mime || "application/octet-stream").catch(
        (err: Error) => {
          throw new TransferError(err.message);
        },
      );
      this.throwIfCancelled(id);
      if (!(await this.deps.ensure(item.peerId))) {
        throw new TransferError(`Couldn't reach ${item.peerName}.`);
      }
      this.throwIfCancelled(id);
      const ready = sink;
      sink = null; // From here on the pending entry owns (and aborts) it.
      const blob = await new Promise<Blob>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!this.pending.delete(id)) return;
          void ready.abort();
          reject(new TransferError(`${item.peerName} didn't respond.`));
        }, CHANNEL_WAIT_MS);
        this.pending.set(id, { item, sink: ready, timer, resolve, reject });
        const req: FileRequest = {
          type: "file-request",
          sharedItemId: item.id,
          transferId: id,
          purpose,
        };
        if (!this.deps.mesh.send(item.peerId, JSON.stringify(req))) {
          this.settlePending(id, new TransferError(`Couldn't reach ${item.peerName}.`));
        }
      });
      store().patch(id, { status: "done", bytes: blob.size });
      return blob;
    } catch (err) {
      await sink?.abort();
      const e = err instanceof TransferError ? err : new TransferError(String(err));
      store().patch(id, { status: e.cancelled ? "cancelled" : "failed", error: e.message });
      throw e;
    } finally {
      this.cancelled.delete(id);
    }
  }

  /** The owner opened a transfer channel to us. */
  onChannel(from: string, ch: RTCDataChannel) {
    if (!ch.label.startsWith(TRANSFER_CHANNEL_PREFIX)) return ch.close();
    const id = ch.label.slice(TRANSFER_CHANNEL_PREFIX.length);
    const p = this.pending.get(id);
    if (!p || p.item.peerId !== from) return ch.close();
    clearTimeout(p.timer);
    this.pending.delete(id);

    store().patch(id, { status: "active" });
    const running = receiveFile(ch, p.sink, {
      size: p.item.fileSize ?? 0,
      onProgress: this.progress(id),
    });
    this.running.set(id, running);
    running.done.then(
      (blob) => p.resolve(blob as Blob),
      (err: TransferError) => p.reject(err),
    );
    void running.done.catch(() => {}).finally(() => this.running.delete(id));
  }

  onFileError(from: string, msg: FileError) {
    const p = this.pending.get(msg.transferId);
    if (!p || p.item.peerId !== from) return;
    if (msg.gone) store().setUnavailable(p.item.id, msg.message);
    this.settlePending(msg.transferId, new TransferError(msg.message));
  }

  // ── Both sides ──

  cancel(transferId: string) {
    const t = store().transfers[transferId];
    if (t?.direction === "receive" && t.status === "requesting") this.cancelled.add(transferId);
    if (this.pending.has(transferId)) {
      this.settlePending(transferId, new TransferError("Cancelled", true));
    }
    this.running.get(transferId)?.cancel();
  }

  /** A peer's link went away: anything still waiting on them fails now. */
  peerGone(peerId: string) {
    for (const [id, p] of this.pending) {
      if (p.item.peerId === peerId) this.settlePending(id, new TransferError("Connection lost."));
    }
  }

  // ── helpers ──

  private throwIfCancelled(id: string) {
    if (this.cancelled.has(id)) throw new TransferError("Cancelled", true);
  }

  private track(id: string, running: Running) {
    this.running.set(id, running);
    running.done
      .then(() => store().patch(id, { status: "done", bytes: store().transfers[id]?.total ?? 0 }))
      .catch((err: TransferError) =>
        store().patch(id, { status: err.cancelled ? "cancelled" : "failed", error: err.message }),
      )
      .finally(() => this.running.delete(id));
  }

  private settlePending(id: string, err: TransferError) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    void p.sink.abort();
    p.reject(err);
  }

  /** Throttled progress reporter for one transfer. */
  private progress(id: string) {
    let last = 0;
    return (bytes: number) => {
      const now = Date.now();
      const t = store().transfers[id];
      if (now - last < PROGRESS_EVERY_MS && bytes < (t?.total ?? 0)) return;
      last = now;
      store().patch(id, { bytes });
    };
  }

  private refuse(to: string, req: FileRequest, message: string, gone = false) {
    const err: FileError = {
      type: "file-error",
      sharedItemId: req.sharedItemId,
      transferId: req.transferId,
      message,
      gone,
    };
    this.deps.mesh.send(to, JSON.stringify(err));
  }
}
