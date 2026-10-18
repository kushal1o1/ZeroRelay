import type { LinkState } from "@/lib/peer-mesh";
import { create } from "zustand";

/** Live state of the direct (WebRTC) link to each peer, for the UI. */
interface ConnectionState {
  links: Record<string, LinkState>;
  set: (peerId: string, state: LinkState | null) => void;
  clear: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  links: {},
  set: (peerId, state) =>
    set((s) => {
      if ((s.links[peerId] ?? null) === state) return s;
      const links = { ...s.links };
      if (state) links[peerId] = state;
      else delete links[peerId];
      return { links };
    }),
  clear: () => set({ links: {} }),
}));
