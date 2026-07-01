// P2P Data Channel message types
export interface SharedItem {
  id: string;
  peerId: string;
  peerName: string;
  type: "text" | "file";
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

// Anything that can arrive over a peer data channel.
export type PeerMessage = DataMessage | FileRequest | FileChunk;
