import { NEARBY_ROOM_ID } from "../../shared/types";

/** Base WebSocket URL of the signaling worker, e.g. wss://host/api/ws. */
export function signalingBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    // An https page can't open an insecure ws:// socket (mixed content).
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.hostname}:8787/api/ws`;
  }
  return "ws://localhost:8787/api/ws";
}

export function roomSocketUrl(roomId: string): string {
  const base = signalingBaseUrl();
  return roomId === NEARBY_ROOM_ID
    ? `${base}/global`
    : `${base}/room/${encodeURIComponent(roomId)}`;
}

/** HTTP URL of the worldwide lobby endpoint (same worker, http scheme). */
export function lobbyUrl(): string {
  return signalingBaseUrl()
    .replace(/^ws/, "http")
    .replace(/\/api\/ws$/, "/api/lobby");
}
