import type { TransferPurpose } from "@/types/message";
import { create } from "zustand";

export type TransferStatus = "requesting" | "active" | "done" | "failed" | "cancelled";

export interface Transfer {
  id: string;
  itemId: string;
  /** The other side: who we receive from, or who we send to. */
  peerId: string;
  peerName: string;
  direction: "send" | "receive";
  purpose: TransferPurpose;
  bytes: number;
  total: number;
  startedAt: number;
  status: TransferStatus;
  error?: string;
}

interface TransferState {
  transfers: Record<string, Transfer>;
  /** Finished downloads kept for this session, so "Save again" needs no re-transfer. */
  saved: Record<string, Blob>;
  /** Items whose owner no longer has the file (reason shown on the card). */
  unavailable: Record<string, string>;

  upsert: (t: Transfer) => void;
  patch: (id: string, patch: Partial<Transfer>) => void;
  remove: (id: string) => void;
  setSaved: (itemId: string, blob: Blob) => void;
  setUnavailable: (itemId: string, reason: string) => void;
  /** Forget finished downloads (their temp files are being deleted). */
  clearSaved: () => void;
  clear: () => void;
}

export const useTransferStore = create<TransferState>((set) => ({
  transfers: {},
  saved: {},
  unavailable: {},

  upsert: (t) => set((s) => ({ transfers: { ...s.transfers, [t.id]: t } })),
  patch: (id, patch) =>
    set((s) => {
      const t = s.transfers[id];
      return t ? { transfers: { ...s.transfers, [id]: { ...t, ...patch } } } : s;
    }),
  remove: (id) =>
    set((s) => {
      if (!s.transfers[id]) return s;
      const transfers = { ...s.transfers };
      delete transfers[id];
      return { transfers };
    }),
  setSaved: (itemId, blob) => set((s) => ({ saved: { ...s.saved, [itemId]: blob } })),
  setUnavailable: (itemId, reason) =>
    set((s) => ({ unavailable: { ...s.unavailable, [itemId]: reason } })),
  clearSaved: () => set({ saved: {} }),
  clear: () => set({ transfers: {}, saved: {}, unavailable: {} }),
}));

/** The latest receive (download or preview) for an item, if any. */
export function latestReceive(
  transfers: Record<string, Transfer>,
  itemId: string,
): Transfer | undefined {
  let latest: Transfer | undefined;
  for (const t of Object.values(transfers)) {
    if (t.itemId !== itemId || t.direction !== "receive") continue;
    if (!latest || t.startedAt > latest.startedAt) latest = t;
  }
  return latest;
}

export const isRunning = (t: Transfer | undefined) =>
  t?.status === "requesting" || t?.status === "active";
