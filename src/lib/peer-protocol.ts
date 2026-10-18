import type { PeerMessage, SharedItem, TransferFrame } from "@/types/message";
import { ITEM_TYPE_LABELS, RETENTION_LABELS } from "@/types/message";

// Runtime validation for everything that arrives from another peer. A peer is
// just another browser: anything it sends is untrusted until checked here.

const ID_MAX = 64;
const TEXT_MAX = 1024 * 1024;
const NAME_MAX = 255;
export const AVATAR_MAX_CHARS = 64 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const isId = (v: unknown): v is string => isStr(v, ID_MAX) && v.length > 0;
const isSize = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const optStr = (v: unknown, max: number) => v === undefined || isStr(v, max);

/** A clean copy of a shared item, or null if anything is off. */
function parseItem(v: unknown): SharedItem | null {
  if (!isObj(v)) return null;
  const ok =
    isId(v.id) &&
    isStr(v.roomId, ID_MAX) &&
    isStr(v.peerId, ID_MAX) &&
    isStr(v.peerName, NAME_MAX) &&
    typeof v.type === "string" &&
    v.type in ITEM_TYPE_LABELS &&
    typeof v.retention === "string" &&
    v.retention in RETENTION_LABELS &&
    typeof v.timestamp === "number" &&
    optStr(v.content, TEXT_MAX) &&
    optStr(v.fileName, NAME_MAX) &&
    optStr(v.mime, NAME_MAX) &&
    (v.fileSize === undefined || isSize(v.fileSize));
  if (!ok) return null;
  return {
    id: v.id as string,
    roomId: v.roomId as string,
    peerId: v.peerId as string,
    peerName: v.peerName as string,
    type: v.type as SharedItem["type"],
    retention: v.retention as SharedItem["retention"],
    timestamp: v.timestamp as number,
    content: v.content as string | undefined,
    fileName: v.fileName as string | undefined,
    fileSize: v.fileSize as number | undefined,
    mime: v.mime as string | undefined,
  };
}

export function parsePeerMessage(data: string): PeerMessage | null {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v.type) {
    case "share": {
      const item = parseItem(v.item);
      if (!item || !optStr(v.targetPeerId, ID_MAX)) return null;
      return { type: "share", item, targetPeerId: v.targetPeerId as string | undefined };
    }
    case "file-request":
      if (!isId(v.sharedItemId) || !isId(v.transferId)) return null;
      if (v.purpose !== "download" && v.purpose !== "preview") return null;
      return {
        type: "file-request",
        sharedItemId: v.sharedItemId,
        transferId: v.transferId,
        purpose: v.purpose,
      };
    case "file-error":
      if (!isId(v.sharedItemId) || !isId(v.transferId) || !isStr(v.message, NAME_MAX)) return null;
      return {
        type: "file-error",
        sharedItemId: v.sharedItemId,
        transferId: v.transferId,
        message: v.message,
        gone: v.gone === true,
      };
    case "avatar":
      if (!isStr(v.dataUrl, AVATAR_MAX_CHARS)) return null;
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(v.dataUrl)) return null;
      return { type: "avatar", dataUrl: v.dataUrl };
    default:
      return null;
  }
}

export function parseTransferFrame(data: string): TransferFrame | null {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v.t) {
    case "start":
      return isSize(v.size) ? { t: "start", size: v.size } : null;
    case "end":
      return { t: "end" };
    case "ack":
      return isSize(v.bytes) ? { t: "ack", bytes: v.bytes } : null;
    case "cancel":
      return { t: "cancel", reason: isStr(v.reason, NAME_MAX) ? v.reason : "Cancelled" };
    default:
      return null;
  }
}

export const TRANSFER_CHANNEL_PREFIX = "xfer:";
