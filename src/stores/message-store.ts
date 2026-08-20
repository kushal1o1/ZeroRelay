import {
  cleanExpired,
  clearAllData,
  deleteMessage,
  deleteRoomMessages,
  getMessages,
  saveMessage,
} from "@/lib/db";
import type { SharedItem } from "@/types/message";
import { create } from "zustand";

interface MessageState {
  items: SharedItem[];
  loaded: boolean;
  /** sharedItemId -> download progress 0..1 (used by file transfer, Fix 6). */
  progress: Record<string, number>;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  addItem: (item: SharedItem) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  removeRoomItems: (roomId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  setProgress: (id: string, value: number) => void;
}

/**
 * Single source of truth for shared items. Both the writer (useRoom, on
 * send/receive) and the reader (SharedFeed) subscribe here, so the feed
 * updates live instead of only on reload. Dexie is the persistence layer.
 */
export const useMessageStore = create<MessageState>((set, get) => ({
  items: [],
  loaded: false,
  progress: {},

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
    await saveMessage(item);
    set((s) => ({ items: [item, ...s.items] }));
  },

  removeItem: async (id) => {
    await deleteMessage(id);
    set((s) => {
      const progress = { ...s.progress };
      delete progress[id];
      return { items: s.items.filter((i) => i.id !== id), progress };
    });
  },

  removeRoomItems: async (roomId) => {
    await deleteRoomMessages(roomId);
    set((s) => ({ items: s.items.filter((i) => i.roomId !== roomId) }));
  },

  clearAll: async () => {
    await clearAllData();
    set({ items: [], loaded: false, progress: {} });
  },

  setProgress: (id, value) => set((s) => ({ progress: { ...s.progress, [id]: value } })),
}));
