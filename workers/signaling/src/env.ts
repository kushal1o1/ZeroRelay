import type { RoomDO } from "./room-do";
import type { WorldDO } from "./world-do";

export interface Env {
  ROOM_DO: DurableObjectNamespace<RoomDO>;
  WORLD_DO: DurableObjectNamespace<WorldDO>;
  /** Salt for hashing client IPs into network keys (`wrangler secret put IP_SALT`). */
  IP_SALT?: string;
  /** Comma-separated origins allowed to use the worker from a browser. Unset = any. */
  ALLOWED_ORIGINS?: string;
}

/** Internal headers the router sets on requests forwarded to a RoomDO. */
export const HEADER = {
  kind: "X-ZR-Kind",
  room: "X-ZR-Room",
  net: "X-ZR-Net",
} as const;

export type RoomKind = "nearby" | "private";

export const nearbyObjectName = (netKey: string) => `net:${netKey}`;
export const privateObjectName = (roomId: string) => `room:${roomId}`;
export const WORLD_OBJECT_NAME = "world";
