import type { FileChunk } from "@/types/message";
import { base64ToBytes, bytesToBase64 } from "./base64";

const CHUNK_SIZE = 16 * 1024;
const MAX_BUFFERED = 1_000_000;

/** Stream a file to one peer. Reads one 16 KB slice at a time instead of
 *  loading the whole file into memory. Sends backpressure via bufferedAmount. */
export async function sendFileInChunks(
  file: File,
  sharedItemId: string,
  targetPeerId: string,
  send: (peerId: string, data: string) => boolean,
  bufferedAmount: (peerId: string) => number,
): Promise<void> {
  const total = file.size;

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    while (bufferedAmount(targetPeerId) > MAX_BUFFERED) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const blob = file.slice(offset, Math.min(offset + CHUNK_SIZE, total));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk: FileChunk = {
      type: "file-chunk",
      sharedItemId,
      offset,
      total,
      data: bytesToBase64(bytes),
    };
    if (!send(targetPeerId, JSON.stringify(chunk))) return;
  }

  if (total === 0) {
    const marker: FileChunk = { type: "file-chunk", sharedItemId, offset: 0, total: 0, data: "" };
    send(targetPeerId, JSON.stringify(marker));
  }
}

export interface Incoming {
  parts: Blob[];
  received: number;
  total: number;
}

/** Accumulate one chunk into the reassembly map. The receiver never holds the
 *  full file in memory — each decoded chunk becomes a separate Blob part that
 *  the browser can flush independently. */
export function applyChunk(
  incoming: Map<string, Incoming>,
  chunk: FileChunk,
): { entry: Incoming; done: boolean } {
  let entry = incoming.get(chunk.sharedItemId);
  if (!entry) {
    entry = { parts: [], received: 0, total: chunk.total };
    incoming.set(chunk.sharedItemId, entry);
  }
  if (chunk.data) {
    const bytes = base64ToBytes(chunk.data);
    entry.parts.push(new Blob([bytes.slice()]));
    entry.received += bytes.length;
  }
  const done = entry.received >= entry.total;
  if (done) incoming.delete(chunk.sharedItemId);
  return { entry, done };
}

/** Build the final Blob from accumulated parts and trigger the browser
 *  download. Parts are concatenated lazily — no full-file copy. */
export function finalizeDownload(entry: Incoming, fileName: string, mime: string): void {
  const blob = new Blob(entry.parts, { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
