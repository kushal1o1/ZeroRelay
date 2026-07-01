import type { SharedItem } from "@/types/message";
import Dexie, { type Table } from "dexie";

const EXPIRY_MS = 24 * 60 * 60 * 1000;

export class ZeroRelayDB extends Dexie {
  messages!: Table<SharedItem, string>;

  constructor() {
    super("zerorelay");
    this.version(2).stores({
      messages: "id, timestamp, peerId, roomId",
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
