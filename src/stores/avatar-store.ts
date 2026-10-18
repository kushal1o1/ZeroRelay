import { getAllAvatars, pruneAvatars, saveAvatar as saveAvatarToDexie } from "@/lib/db";
import { identity } from "@/lib/identity";
import { create } from "zustand";

interface AvatarState {
  map: Record<string, string>;
  loaded: boolean;
  setAvatar: (peerId: string, dataUrl: string) => void;
  /** Load saved avatars once per session (later calls are no-ops). */
  loadFromDexie: () => Promise<void>;
  clear: () => void;
}

export const useAvatarStore = create<AvatarState>((set, get) => ({
  map: {},
  loaded: false,
  setAvatar: (peerId, dataUrl) => {
    set((s) => ({ map: { ...s.map, [peerId]: dataUrl } }));
    saveAvatarToDexie(peerId, dataUrl).catch(() => {});
  },
  loadFromDexie: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    const { peerId, legacyPeerId } = identity;
    await pruneAvatars(peerId).catch(() => {});
    const map = await getAllAvatars();
    // Carry our own avatar over from the pre-v2 peer id.
    if (legacyPeerId && map[legacyPeerId] && !map[peerId]) {
      map[peerId] = map[legacyPeerId];
      saveAvatarToDexie(peerId, map[peerId]).catch(() => {});
    }
    set((s) => ({ map: { ...map, ...s.map } }));
  },
  clear: () => set({ map: {} }),
}));
