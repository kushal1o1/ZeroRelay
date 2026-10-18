// Wire protocol shared by the browser client and the signaling worker.
// Bump PROTOCOL_VERSION on any breaking change: old clients get an
// "outdated" error and are asked to refresh instead of failing silently.
import { sha256Hex } from "./sha256";

export const PROTOCOL_VERSION = 2;

/** The default room: everyone behind the same public IP (same router). */
export const NEARBY_ROOM_ID = "global";

export const LIMITS = {
  name: 32,
  roomName: 48,
  password: 128,
  token: 128,
  /** Max size of one WebSocket frame accepted by the server. */
  frameBytes: 64 * 1024,
  nearbyPeers: 100,
  roomPeers: 32,
  lobbyPage: 50,
  lobbyQuery: 32,
} as const;

export const ROOM_ID_RE = /^[a-z0-9]{10,32}$/;
export const PEER_ID_RE = /^[0-9a-f]{32}$/;
export const SECRET_RE = /^[0-9a-f]{64}$/;

/** A peer id is a hash of a client-held secret, so nobody can claim (and
 *  kick) someone else's id without knowing their secret. */
export function derivePeerId(secret: string): string {
  return sha256Hex(`zerorelay-peer:${secret}`).slice(0, 32);
}

// ── Peer / room ──

export interface Peer {
  id: string;
  name: string;
  joinedAt: number;
  /** Opaque per-room network tag. Equal tags = same network (same public IP). */
  net: string;
  /** Client-side only: derived by comparing `net` with our own. */
  locale?: "local" | "remote";
}

export interface RoomInfo {
  id: string;
  name: string;
  hasPassword: boolean;
  /** True for the network-scoped default room. */
  nearby: boolean;
}

/** Whether a peer in the Nearby room is listed in the worldwide lobby. */
export type Visibility = "world" | "hidden";

/** Public lobby entry (never includes network info). */
export interface LobbyPeer {
  id: string;
  name: string;
}

export interface LobbyPage {
  total: number;
  peers: LobbyPeer[];
  next: string | null;
}

// ── WebRTC payloads (no DOM dependency) ──

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

/** Opaque to the server: relayed as-is between two peers. */
export type SignalPayload =
  | { kind: "offer"; sdp: SDP }
  | { kind: "answer"; sdp: SDP }
  | { kind: "ice"; candidate: ICECandidate }
  /** Lobby: ask a peer on another network to connect. */
  | { kind: "invite" }
  | { kind: "invite-reply"; accepted: boolean }
  /** Lobby: end a cross-network link. */
  | { kind: "bye" };

// ── Client → Server ──

export type ClientMessage =
  | {
      type: "join";
      v: number;
      /** 64 hex chars; the server derives the peer id from it. */
      secret: string;
      name: string;
      visibility?: Visibility;
      /** Private rooms only: create the room instead of joining it. */
      create?: { name: string; password?: string };
      password?: string;
      /** Join token from a previous successful join (skips the password). */
      token?: string;
    }
  | { type: "rename"; name: string }
  | { type: "visibility"; visibility: Visibility }
  | { type: "leave" }
  | { type: "delete-room"; ownerToken: string }
  | { type: "signal"; to: string; payload: SignalPayload };

// ── Server → Client ──

export type ErrorCode =
  | "invalid"
  | "outdated"
  | "bad-auth"
  | "not-found"
  | "exists"
  | "rate-limited"
  | "full"
  | "forbidden"
  | "unreachable";

export type ServerMessage =
  | {
      type: "joined";
      self: Peer;
      peers: Peer[];
      room: RoomInfo;
      /** Private rooms: store this to rejoin without the password. */
      joinToken?: string;
      /** Only sent to the creator: required to delete the room. */
      ownerToken?: string;
    }
  | { type: "peer-joined"; peer: Peer }
  | { type: "peer-left"; peerId: string }
  | { type: "peer-updated"; peer: Peer }
  | {
      type: "signal";
      from: string;
      payload: SignalPayload;
      /** "world" when relayed from a peer on another network via the lobby. */
      via: "room" | "world";
      fromPeer?: LobbyPeer;
    }
  | { type: "error"; code: ErrorCode; message: string; peerId?: string }
  | { type: "room-deleted"; roomId: string };
