import type { SharedItem } from "@/types/message";
import Dexie, { type Table } from "dexie";

const EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface AvatarRecord {
  peerId: string;
  dataUrl: string;
}

export class ZeroRelayDB extends Dexie {
  messages!: Table<SharedItem, string>;
  avatars!: Table<AvatarRecord, string>;

  constructor() {
    super("zerorelay");
    this.version(3).stores({
      messages: "id, timestamp, peerId, roomId",
      avatars: "peerId",
    });
  }
}

export const db = new ZeroRelayDB();

export async function saveMessage(item: SharedItem) {
  await db.messages.put(item);
}

export async function getMessages(roomId?: string): Promise<SharedItem[]> {
  const cutoff = Date.now() - EXPIRY_MS;
  await db.messages.where("timestamp").below(cutoff).delete();
  let query = db.messages.where("timestamp").above(cutoff);
  if (roomId) {
    query = query.filter((item) => item.roomId === roomId) as typeof query;
  }
  return query.toArray();
}

export async function getRoomMessages(roomId: string): Promise<SharedItem[]> {
  return getMessages(roomId);
}

export async function clearExpired() {
  const cutoff = Date.now() - EXPIRY_MS;
  await db.messages.where("timestamp").below(cutoff).delete();
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
