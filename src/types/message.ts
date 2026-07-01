// P2P Data Channel message types
export type Retention = "session" | "5min" | "1h" | "1d" | "forever";

export const RETENTION_LABELS: Record<Retention, string> = {
  session: "Session",
  "5min": "5 min",
  "1h": "1 hr",
  "1d": "1 day",
  forever: "Forever",
};

export type ItemType = "text" | "code" | "note" | "file";

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  text: "Chat",
  code: "Code",
  note: "Note",
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

export interface DataMessage {
  type: "share";
  item: SharedItem;
  targetPeerId?: string;
}

export interface FileRequest {
  type: "file-request";
  sharedItemId: string;
}

export interface FileChunk {
  type: "file-chunk";
  sharedItemId: string;
  offset: number;
  total: number;
  data: string; // base64 encoded chunk
}

export interface AvatarMessage {
  type: "avatar";
  dataUrl: string;
}

// Anything that can arrive over a peer data channel.
export type PeerMessage = DataMessage | FileRequest | FileChunk | AvatarMessage;
