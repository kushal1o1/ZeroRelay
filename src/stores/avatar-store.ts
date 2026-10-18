import { getAllAvatars, saveAvatar as saveAvatarToDexie } from "@/lib/db";
import { identity } from "@/lib/identity";
import { create } from "zustand";

interface AvatarState {
  map: Record<string, string>;
  setAvatar: (peerId: string, dataUrl: string) => void;
  loadFromDexie: () => Promise<void>;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  map: {},
  setAvatar: (peerId, dataUrl) => {
    set((s) => ({ map: { ...s.map, [peerId]: dataUrl } }));
    saveAvatarToDexie(peerId, dataUrl).catch(() => {});
  },
  loadFromDexie: async () => {
    const map = await getAllAvatars();
    // v2 derives a new peer id: carry our own avatar over from the old one.
    const { peerId, legacyPeerId } = identity;
    if (legacyPeerId && map[legacyPeerId] && !map[peerId]) {
      map[peerId] = map[legacyPeerId];
      saveAvatarToDexie(peerId, map[peerId]).catch(() => {});
    }
    set({ map });
  },
}));
