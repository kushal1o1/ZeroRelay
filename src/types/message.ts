// P2P Data Channel message types
export type Retention = "session" | "5min" | "1h" | "1d" | "forever";

export const RETENTION_LABELS: Record<Retention, string> = {
  session: "Session",
  "5min": "5 min",
  "1h": "1 hr",
  "1d": "1 day",
  forever: "Forever",
};

/** Longest text that can be sent as a message; bigger text goes as a file. */
export const MAX_TEXT_CHARS = 256 * 1024;

export type ItemType = "text" | "code" | "note" | "markdown" | "file";

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  text: "Chat",
  code: "Code",
  note: "Note",
  markdown: "Markdown",
  file: "File",
};

export interface SharedItem {
  id: string;
  roomId: string;
  peerId: string;
  peerName: string;
  type: ItemType;
  retention: Retention;
  content?: string;
  fileName?: string;
  fileSize?: number;
  mime?: string;
  timestamp: number;
}

export type TransferPurpose = "download" | "preview";

// ── Control messages on the main "data" channel (JSON text) ──

export interface DataMessage {
  type: "share";
  item: SharedItem;
  targetPeerId?: string;
}

/** Receiver → owner: please open a transfer channel and send this file. */
export interface FileRequest {
  type: "file-request";
  sharedItemId: string;
  transferId: string;
  purpose: TransferPurpose;
}

/** Owner → receiver: the request can't be served. */
export interface FileError {
  type: "file-error";
  sharedItemId: string;
  transferId: string;
  message: string;
  /** The owner doesn't hold the file any more (e.g. they reloaded). */
  gone?: boolean;
}

export interface AvatarMessage {
  type: "avatar";
  dataUrl: string;
}

// Anything that can arrive over the main peer data channel.
export type PeerMessage = DataMessage | FileRequest | FileError | AvatarMessage;

// ── Frames on a per-transfer channel ("xfer:<transferId>") ──
// File bytes travel as binary ArrayBuffer frames; these JSON frames frame them.

export type TransferFrame =
  /** Sender → receiver, first frame. */
  | { t: "start"; size: number }
  /** Sender → receiver, after the last chunk. */
  | { t: "end" }
  /** Receiver → sender: bytes written so far (drives progress + flow control). */
  | { t: "ack"; bytes: number }
  /** Either side: stop the transfer. */
  | { t: "cancel"; reason: string };
