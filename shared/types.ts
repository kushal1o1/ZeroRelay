// ── Peer ──
export interface Peer {
  id: string;
  name: string;
  joinedAt: number;
}

// ── WebRTC types (no DOM dependency) ──
export interface SDP {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp: string;
}

export interface ICECandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

// ── Client → Server ──
export type ClientMessage =
  | { type: "join"; roomId: string; password?: string; peerId: string; name: string }
  | { type: "leave"; roomId: string; peerId: string }
  | { type: "delete-room"; roomId: string; peerId: string }
  | { type: "rename"; roomId: string; peerId: string; name: string }
  | { type: "offer"; roomId: string; from: string; to: string; sdp: SDP }
  | { type: "answer"; roomId: string; from: string; to: string; sdp: SDP }
  | { type: "ice-candidate"; roomId: string; from: string; to: string; candidate: ICECandidate };

// ── Server → Client ──
export type ServerMessage =
  | { type: "joined"; peerId: string; peers: Peer[] }
  | { type: "presence"; peers: Peer[] }
  | { type: "peer-joined"; peer: Peer }
  | { type: "peer-left"; peerId: string }
  | { type: "peer-renamed"; peerId: string; name: string }
  | { type: "offer"; from: string; sdp: SDP }
  | { type: "answer"; from: string; sdp: SDP }
  | { type: "ice-candidate"; from: string; candidate: ICECandidate }
  | { type: "error"; message: string }
  | { type: "room-deleted"; roomId: string };

// ── Shared ──
export type Message = ClientMessage | ServerMessage;
