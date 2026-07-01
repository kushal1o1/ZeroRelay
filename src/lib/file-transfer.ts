import type { FileChunk } from "@/types/message";
import { base64ToBytes, bytesToBase64 } from "./base64";

const CHUNK_SIZE = 16 * 1024;
// Pause streaming while the channel's send buffer is above this, so a large
// file can't blow up memory / get dropped.
const MAX_BUFFERED = 1_000_000;

/** Stream a file to one peer as ordered base64 `file-chunk` messages. */
export async function sendFileInChunks(
  file: File,
  sharedItemId: string,
  targetPeerId: string,
  send: (peerId: string, data: string) => boolean,
  bufferedAmount: (peerId: string) => number,
): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const total = bytes.length;

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    while (bufferedAmount(targetPeerId) > MAX_BUFFERED) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const slice = bytes.subarray(offset, offset + CHUNK_SIZE);
    const chunk: FileChunk = {
      type: "file-chunk",
      sharedItemId,
      offset,
      total,
      data: bytesToBase64(slice),
    };
    if (!send(targetPeerId, JSON.stringify(chunk))) return; // channel gone
  }

  // Empty file: send a single zero-length marker so the receiver completes.
  if (total === 0) {
    const marker: FileChunk = { type: "file-chunk", sharedItemId, offset: 0, total: 0, data: "" };
    send(targetPeerId, JSON.stringify(marker));
  }
}

export interface Incoming {
  buf: Uint8Array<ArrayBuffer>;
  received: number;
  total: number;
}

/** Fold one chunk into the reassembly map; returns the (running) entry and
 * whether the file is now complete. */
export function applyChunk(
  incoming: Map<string, Incoming>,
  chunk: FileChunk,
): { entry: Incoming; done: boolean } {
  let entry = incoming.get(chunk.sharedItemId);
  if (!entry) {
    entry = { buf: new Uint8Array(chunk.total), received: 0, total: chunk.total };
    incoming.set(chunk.sharedItemId, entry);
  }
  if (chunk.data) {
    const bytes = base64ToBytes(chunk.data);
    entry.buf.set(bytes, chunk.offset);
    entry.received += bytes.length;
  }
  const done = entry.received >= entry.total;
  if (done) incoming.delete(chunk.sharedItemId);
  return { entry, done };
}

/** Turn reassembled bytes into a browser download. */
export function triggerDownload(
  fileName: string,
  mime: string,
  buf: Uint8Array<ArrayBuffer>,
): void {
  const blob = new Blob([buf], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
