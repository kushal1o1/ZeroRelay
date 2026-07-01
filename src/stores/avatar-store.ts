import { getAllAvatars, saveAvatar as saveAvatarToDexie } from "@/lib/db";
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
    set({ map });
  },
}));
