import type { Retention, SharedItem } from "@/types/message";
import Dexie, { type Table } from "dexie";

const RETENTION_MS: Record<Exclude<Retention, "session" | "forever">, number> = {
  "5min": 5 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};
/** Largest valid Date value: "never expires". */
const NEVER = 8_640_000_000_000_000;
/** Avatars of peers we haven't seen for this long are dropped. */
const AVATAR_TTL_MS = 30 * 24 * 60 * 60_000;

/** A saved message plus when it expires (indexed, so cleanup is a range delete). */
type StoredItem = SharedItem & { expiresAt: number };

export interface AvatarRecord {
  peerId: string;
  dataUrl: string;
  /** Last time we received or set this avatar. */
  seen: number;
}

function expiresAt(item: SharedItem): number {
  const ms = RETENTION_MS[item.retention as keyof typeof RETENTION_MS];
  return ms === undefined ? NEVER : item.timestamp + ms;
}

export class ZeroRelayDB extends Dexie {
  messages!: Table<StoredItem, string>;
  avatars!: Table<AvatarRecord, string>;

  constructor() {
    super("zerorelay");
    this.version(4).stores({
      messages: "id, timestamp, peerId, roomId",
      avatars: "peerId",
    });
    this.version(5)
      .stores({
        messages: "id, timestamp, peerId, roomId, expiresAt",
        avatars: "peerId, seen",
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table("messages")
          .toCollection()
          .modify((item: StoredItem) => {
            item.expiresAt = expiresAt(item);
          });
        await tx
          .table("avatars")
          .toCollection()
          .modify((a: AvatarRecord) => {
            a.seen = now;
          });
      });
  }
}

export const db = new ZeroRelayDB();

function strip({ expiresAt: _, ...item }: StoredItem): SharedItem {
  return item;
}

/** Persist a message. Session-only messages are never written. Throws on
 *  storage errors (e.g. quota exceeded) so callers can tell the user. */
export async function saveMessage(item: SharedItem) {
  if (item.retention === "session") return;
  await db.messages.put({ ...item, expiresAt: expiresAt(item) });
}

/** Saved messages (all rooms, or one), oldest first, after dropping expired ones. */
export async function getMessages(roomId?: string): Promise<SharedItem[]> {
  await cleanExpired();
  const rows = roomId
    ? await db.messages.where("roomId").equals(roomId).sortBy("timestamp")
    : await db.messages.orderBy("timestamp").toArray();
  return rows.map(strip);
}

export async function cleanExpired() {
  await db.messages.where("expiresAt").below(Date.now()).delete();
}

export async function deleteMessage(id: string) {
  await db.messages.delete(id);
}

export async function deleteRoomMessages(roomId: string) {
  await db.messages.where("roomId").equals(roomId).delete();
}

export async function countMessages(): Promise<number> {
  return db.messages.count();
}

export async function clearAllData() {
  await Promise.all([db.messages.clear(), db.avatars.clear()]);
}

export async function saveAvatar(peerId: string, dataUrl: string) {
  await db.avatars.put({ peerId, dataUrl, seen: Date.now() });
}

export async function getAllAvatars(): Promise<Record<string, string>> {
  const all = await db.avatars.toArray();
  const map: Record<string, string> = {};
  for (const a of all) map[a.peerId] = a.dataUrl;
  return map;
}

/** Drop avatars of peers not seen for a month (never our own). */
export async function pruneAvatars(keepPeerId: string) {
  await db.avatars
    .where("seen")
    .below(Date.now() - AVATAR_TTL_MS)
    .filter((a) => a.peerId !== keepPeerId)
    .delete();
}
