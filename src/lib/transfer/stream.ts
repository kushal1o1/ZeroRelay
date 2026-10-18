import { parseTransferFrame } from "@/lib/peer-protocol";
import type { TransferFrame } from "@/types/message";
import type { FileSink } from "./sinks";

// Byte streaming over a dedicated RTCDataChannel. Binary chunks carry the
// file; small JSON frames (see TransferFrame) bracket it. The receiver acks
// what it has *written*, and the sender never runs more than WINDOW bytes
// ahead of that, so a slow disk can't make data pile up in memory.

/** Safe for every browser's SCTP message limit (Safari's is 64 KiB). */
const DEFAULT_CHUNK = 64 * 1024;
const WINDOW = 8 * 1024 * 1024;
const ACK_EVERY = 1024 * 1024;
const BUFFER_HIGH = 4 * 1024 * 1024;
const BUFFER_LOW = 1024 * 1024;
/** No data (receiver) or no ack (sender) for this long = stalled. */
const IDLE_MS = 30_000;

export class TransferError extends Error {
  constructor(
    message: string,
    readonly cancelled = false,
  ) {
    super(message);
  }
}

const sendFrame = (ch: RTCDataChannel, frame: TransferFrame) => {
  if (ch.readyState === "open") ch.send(JSON.stringify(frame));
};

function whenOpen(ch: RTCDataChannel): Promise<void> {
  if (ch.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    ch.addEventListener("open", () => resolve(), { once: true });
    ch.addEventListener("close", () => reject(new TransferError("Connection lost")), {
      once: true,
    });
  });
}

/** A handle on a running transfer. */
export interface Running {
  done: Promise<Blob | undefined>;
  cancel(reason?: string): void;
}

/** Send `file` over `ch`. `onAck` reports bytes the receiver has stored. */
export function sendFile(
  ch: RTCDataChannel,
  file: Blob,
  opts: { onAck: (bytes: number) => void; maxMessageSize?: number },
): Running {
  ch.binaryType = "arraybuffer";
  ch.bufferedAmountLowThreshold = BUFFER_LOW;
  const chunk = Math.min(DEFAULT_CHUNK, opts.maxMessageSize || DEFAULT_CHUNK);

  let acked = 0;
  let failure: TransferError | null = null;
  let wake: (() => void) | null = null;
  const nudge = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const fail = (err: TransferError) => {
    failure ??= err;
    nudge();
  };

  let idle: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => fail(new TransferError("The receiver stopped responding")), IDLE_MS);
  };

  ch.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    const frame = parseTransferFrame(e.data);
    if (frame?.t === "ack") {
      acked = Math.max(acked, frame.bytes);
      opts.onAck(acked);
      touch();
      nudge();
    } else if (frame?.t === "cancel") {
      fail(new TransferError(frame.reason, true));
    }
  };
  ch.onbufferedamountlow = nudge;
  ch.onclose = () => fail(new TransferError("Connection lost"));

  /** Wait until `ready()` holds, an event nudges us, or the transfer fails. */
  const waitUntil = async (ready: () => boolean) => {
    while (!ready()) {
      if (failure) throw failure;
      await new Promise<void>((r) => {
        wake = r;
      });
    }
    if (failure) throw failure;
  };

  const done = (async () => {
    try {
      await whenOpen(ch);
      touch();
      sendFrame(ch, { t: "start", size: file.size });
      for (let offset = 0; offset < file.size; offset += chunk) {
        await waitUntil(() => offset - acked < WINDOW && ch.bufferedAmount < BUFFER_HIGH);
        const bytes = await file.slice(offset, offset + chunk).arrayBuffer();
        if (failure) throw failure;
        ch.send(bytes);
      }
      sendFrame(ch, { t: "end" });
      await waitUntil(() => acked >= file.size);
      return undefined;
    } finally {
      clearTimeout(idle);
      ch.onmessage = null;
      ch.onclose = null;
      ch.onbufferedamountlow = null;
      ch.close();
    }
  })();

  return {
    done,
    cancel(reason = "Cancelled by sender") {
      sendFrame(ch, { t: "cancel", reason });
      fail(new TransferError(reason, true));
    },
  };
}

/** Receive a file of `size` bytes from `ch` into `sink`. */
export function receiveFile(
  ch: RTCDataChannel,
  sink: FileSink,
  opts: { size: number; onProgress: (bytes: number) => void },
): Running {
  ch.binaryType = "arraybuffer";
  let received = 0;
  let written = 0;
  let lastAck = 0;
  let writes = Promise.resolve();
  let settled = false;

  let resolveDone!: (b: Blob) => void;
  let rejectDone!: (e: TransferError) => void;
  const done = new Promise<Blob>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  let idle: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => fail(new TransferError("The sender stopped responding")), IDLE_MS);
  };

  const cleanup = () => {
    settled = true;
    clearTimeout(idle);
    ch.onmessage = null;
    ch.onclose = null;
  };
  const fail = (err: TransferError, notify = true) => {
    if (settled) return;
    cleanup();
    if (notify) sendFrame(ch, { t: "cancel", reason: err.message });
    ch.close();
    void sink.abort();
    rejectDone(err);
  };

  ch.onmessage = (e) => {
    if (settled) return;
    touch();
    if (typeof e.data !== "string") {
      const buf = e.data as ArrayBuffer;
      received += buf.byteLength;
      if (received > opts.size) return fail(new TransferError("Received more data than expected"));
      writes = writes.then(async () => {
        await sink.write(buf);
        written += buf.byteLength;
        opts.onProgress(written);
        if (written - lastAck >= ACK_EVERY) {
          lastAck = written;
          sendFrame(ch, { t: "ack", bytes: written });
        }
      });
      writes.catch(() =>
        fail(new TransferError("Couldn't save the file (storage full or unavailable)")),
      );
      return;
    }
    const frame = parseTransferFrame(e.data);
    if (frame?.t === "start" && frame.size !== opts.size) {
      fail(new TransferError("File size doesn't match what was shared"));
    } else if (frame?.t === "cancel") {
      fail(new TransferError(frame.reason, true), false);
    } else if (frame?.t === "end") {
      void writes.then(async () => {
        if (settled) return;
        if (written !== opts.size) return fail(new TransferError("Transfer ended early"));
        const blob = await sink.finish();
        sendFrame(ch, { t: "ack", bytes: written });
        cleanup();
        resolveDone(blob);
      });
    }
  };
  ch.onclose = () => fail(new TransferError("Connection lost"), false);
  void whenOpen(ch).then(touch, () => fail(new TransferError("Connection lost"), false));

  return {
    done,
    cancel(reason = "Cancelled") {
      fail(new TransferError(reason, true));
    },
  };
}
