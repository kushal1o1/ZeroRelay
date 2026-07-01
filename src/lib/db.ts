import type { SharedItem } from "@/types/message";
import Dexie, { type Table } from "dexie";

const EXPIRY_MS = 24 * 60 * 60 * 1000;

export class ZeroRelayDB extends Dexie {
  messages!: Table<SharedItem, string>;

  constructor() {
    super("zerorelay");
    this.version(1).stores({
      messages: "id, timestamp, peerId",
    });
  }
}

export const db = new ZeroRelayDB();

export async function saveMessage(item: SharedItem) {
  await db.messages.put(item);
}

export async function getMessages(): Promise<SharedItem[]> {
  const cutoff = Date.now() - EXPIRY_MS;
  await db.messages.where("timestamp").below(cutoff).delete();
  return db.messages.where("timestamp").above(cutoff).toArray();
}

export async function clearExpired() {
  const cutoff = Date.now() - EXPIRY_MS;
  await db.messages.where("timestamp").below(cutoff).delete();
}
