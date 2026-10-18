import { countMessages } from "@/lib/db";
import { incomingSize } from "@/lib/transfer/sinks";

// Device storage: whether the browser may evict our data, and how much we use.

export type PersistState = "persisted" | "best-effort" | "unsupported";

export async function persistState(): Promise<PersistState> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
  return (await navigator.storage.persisted().catch(() => false)) ? "persisted" : "best-effort";
}

let requested = false;

/** Ask the browser to keep our data (Safari otherwise deletes it after 7 days
 *  without a visit). Call it from a user action: some browsers show a prompt. */
export async function requestPersistence(): Promise<PersistState> {
  const state = await persistState();
  if (state !== "best-effort" || requested) return state;
  requested = true;
  const granted = await navigator.storage.persist().catch(() => false);
  return granted ? "persisted" : "best-effort";
}

export interface StorageReport {
  /** Everything this site stores on the device, in bytes. */
  usage: number;
  /** How much the browser lets this site use, in bytes. */
  quota: number;
  /** Received files kept for this session, in bytes. */
  received: number;
  messages: number;
  persist: PersistState;
}

export async function storageReport(): Promise<StorageReport> {
  const [est, received, messages, persist] = await Promise.all([
    navigator.storage?.estimate?.().catch(() => undefined),
    incomingSize(),
    countMessages().catch(() => 0),
    persistState(),
  ]);
  return { usage: est?.usage ?? 0, quota: est?.quota ?? 0, received, messages, persist };
}
