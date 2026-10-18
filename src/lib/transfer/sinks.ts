import { formatSize } from "@/lib/format";

// Where received file bytes go. Large files are written to the Origin Private
// File System (on disk, invisible to the user) so a phone never has to hold a
// whole video in RAM; small files, or browsers without OPFS writes (and plain
// http pages, where OPFS isn't available), use memory.

export interface FileSink {
  write(chunk: ArrayBuffer): Promise<void>;
  /** Finish writing and return the file (disk-backed for OPFS). */
  finish(): Promise<Blob>;
  /** Stop and throw away what was written. */
  abort(): Promise<void>;
}

const INCOMING_DIR = "zerorelay-incoming";
/** Files up to this size stay in memory even when OPFS is available. */
const MEMORY_PREFERRED_MAX = 8 * 1024 * 1024;
/** Without OPFS, refuse files bigger than this rather than crash the tab. */
const MEMORY_HARD_MAX = 512 * 1024 * 1024;
/** Keep this much storage free on top of the file itself. */
const SPACE_MARGIN = 50 * 1024 * 1024;

function supportsOpfsWrites(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    "createWritable" in FileSystemFileHandle.prototype
  );
}

async function incomingDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(INCOMING_DIR, { create: true });
}

class MemorySink implements FileSink {
  private parts: Blob[] = [];
  constructor(private readonly mime: string) {}
  async write(chunk: ArrayBuffer) {
    this.parts.push(new Blob([chunk]));
  }
  async finish() {
    return new Blob(this.parts, { type: this.mime });
  }
  async abort() {
    this.parts = [];
  }
}

class OpfsSink implements FileSink {
  private constructor(
    private readonly dir: FileSystemDirectoryHandle,
    private readonly name: string,
    private readonly handle: FileSystemFileHandle,
    private readonly writable: FileSystemWritableFileStream,
    private readonly mime: string,
  ) {}

  static async create(id: string, mime: string): Promise<OpfsSink> {
    const dir = await incomingDir();
    const handle = await dir.getFileHandle(id, { create: true });
    const writable = await handle.createWritable();
    return new OpfsSink(dir, id, handle, writable, mime);
  }

  async write(chunk: ArrayBuffer) {
    await this.writable.write(chunk);
  }

  async finish() {
    await this.writable.close();
    const file = await this.handle.getFile();
    // Re-typed view over the same on-disk bytes (no copy).
    return file.slice(0, file.size, this.mime);
  }

  async abort() {
    await this.writable.abort().catch(() => {});
    await this.dir.removeEntry(this.name).catch(() => {});
  }
}

/** Pick a sink for a file of `size` bytes. Throws a user-facing message if the
 *  device can't take it. */
export async function createSink(id: string, size: number, mime: string): Promise<FileSink> {
  if (size > MEMORY_PREFERRED_MAX && supportsOpfsWrites()) {
    await assertFreeSpace(size);
    return OpfsSink.create(id, mime);
  }
  if (size > MEMORY_HARD_MAX) {
    throw new Error(
      `This browser can't save files over ${formatSize(MEMORY_HARD_MAX)} here. Try Chrome or Edge over https.`,
    );
  }
  return new MemorySink(mime);
}

async function assertFreeSpace(size: number) {
  const est = await navigator.storage.estimate?.().catch(() => undefined);
  if (!est?.quota || est.usage === undefined) return;
  const free = est.quota - est.usage;
  if (free < size + SPACE_MARGIN) {
    throw new Error(
      `Not enough free space: needs ${formatSize(size)}, ${formatSize(Math.max(0, free))} available.`,
    );
  }
}

/** Remove leftover received files (they're only kept for the session). */
export async function clearIncoming(): Promise<void> {
  if (!supportsOpfsWrites()) return;
  const root = await navigator.storage.getDirectory().catch(() => null);
  await root?.removeEntry(INCOMING_DIR, { recursive: true }).catch(() => {});
}
