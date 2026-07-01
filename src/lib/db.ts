import type { Retention, SharedItem } from "@/types/message";
import Dexie, { type Table } from "dexie";

const RETENTION_MS: Record<Exclude<Retention, "session" | "forever">, number> = {
  "5min": 5 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

export interface AvatarRecord {
  peerId: string;
  dataUrl: string;
}

export class ZeroRelayDB extends Dexie {
  messages!: Table<SharedItem, string>;
  avatars!: Table<AvatarRecord, string>;

  constructor() {
    super("zerorelay");
    this.version(4).stores({
      messages: "id, timestamp, peerId, roomId",
      avatars: "peerId",
    });
  }
}

export const db = new ZeroRelayDB();

export async function saveMessage(item: SharedItem) {
  if (item.retention === "session") return;
  await db.messages.put(item);
}

export async function getMessages(roomId?: string): Promise<SharedItem[]> {
  await cleanExpired();
  let query = db.messages.where("timestamp").above(0);
  if (roomId) {
    query = query.filter((item) => item.roomId === roomId) as typeof query;
  }
  return query.toArray();
}

export async function getRoomMessages(roomId: string): Promise<SharedItem[]> {
  return getMessages(roomId);
}

export async function cleanExpired() {
  const now = Date.now();
  const items = await db.messages.toArray();
  const toDelete: string[] = [];
  for (const item of items) {
    const ms = RETENTION_MS[item.retention as keyof typeof RETENTION_MS];
    if (ms !== undefined && now - item.timestamp > ms) {
      toDelete.push(item.id);
    }
  }
  if (toDelete.length > 0) await db.messages.bulkDelete(toDelete);
}

export async function deleteRoomMessages(roomId: string) {
  const items = await db.messages.where("roomId").equals(roomId).toArray();
  const ids = items.map((i) => i.id);
  if (ids.length > 0) await db.messages.bulkDelete(ids);
}

export async function saveAvatar(peerId: string, dataUrl: string) {
  await db.avatars.put({ peerId, dataUrl });
}

export async function getAvatar(peerId: string): Promise<string | undefined> {
  return (await db.avatars.get(peerId))?.dataUrl;
}

export async function getAllAvatars(): Promise<Record<string, string>> {
  const all = await db.avatars.toArray();
  const map: Record<string, string> = {};
  for (const a of all) map[a.peerId] = a.dataUrl;
  return map;
}
