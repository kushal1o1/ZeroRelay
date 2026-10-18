import {
  cleanExpired,
  clearAllData,
  deleteMessage,
  deleteRoomMessages,
  getMessages,
  saveMessage,
} from "@/lib/db";
import { useRoomStore } from "@/stores/room-store";
import type { SharedItem } from "@/types/message";
import { create } from "zustand";

interface MessageState {
  items: SharedItem[];
  loaded: boolean;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  addItem: (item: SharedItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  removeRoomItems: (roomId: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

/**
 * Single source of truth for shared items. Both the writer (useRoom, on
 * send/receive) and the reader (SharedFeed) subscribe here, so the feed
 * updates live instead of only on reload. Dexie is the persistence layer.
 */
export const useMessageStore = create<MessageState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const items = await getMessages();
    set({ items, loaded: true });
  },

  refresh: async () => {
    await cleanExpired();
    const fromDb = await getMessages();
    const sessionItems = get().items.filter((i) => i.retention === "session");
    set({ items: [...sessionItems, ...fromDb] });
  },

  addItem: async (item) => {
    // De-dupe by id: the sender echoes its own share locally, and a broadcast
    // could otherwise arrive back through more than one path.
    if (get().items.some((i) => i.id === item.id)) return;
    // Show it first: a storage problem must never make a message disappear.
    set((s) => ({ items: [item, ...s.items] }));
    try {
      await saveMessage(item);
    } catch (err) {
      console.warn("Saving message failed", err);
      useRoomStore
        .getState()
        .setError(
          "Couldn't save a message on this device (storage may be full). It's shown for now but won't be kept after a reload.",
        );
    }
  },

  removeItem: async (id) => {
    await deleteMessage(id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  removeRoomItems: async (roomId) => {
    await deleteRoomMessages(roomId);
    set((s) => ({ items: s.items.filter((i) => i.roomId !== roomId) }));
  },

  clearAll: async () => {
    await clearAllData();
    set({ items: [], loaded: false });
  },
}));
