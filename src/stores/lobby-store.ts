import { create } from "zustand";

/**
 * Links with people on other networks, found through the lobby.
 *  - outgoing: we invited them, waiting for an answer
 *  - incoming: they invited us, waiting for our answer
 *  - linked:   both agreed; a direct connection may be set up
 *  - declined / unanswered / unreachable / failed: shown briefly, then removed
 *    (failed = both agreed but no direct path between the two networks)
 */
export type WorldLinkStatus =
  | "outgoing"
  | "incoming"
  | "linked"
  | "declined"
  | "unanswered"
  | "unreachable"
  | "failed";

export interface WorldLink {
  id: string;
  name: string;
  status: WorldLinkStatus;
  since: number;
}

interface LobbyState {
  links: Record<string, WorldLink>;
  open: boolean;

  setLink: (id: string, name: string, status: WorldLinkStatus) => void;
  removeLink: (id: string) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  links: {},
  open: false,

  setLink: (id, name, status) =>
    set((s) => ({ links: { ...s.links, [id]: { id, name, status, since: Date.now() } } })),
  removeLink: (id) =>
    set((s) => {
      if (!s.links[id]) return s;
      const links = { ...s.links };
      delete links[id];
      return { links };
    }),
  clear: () => set({ links: {} }),
  setOpen: (open) => set({ open }),
}));

export const isLinked = (id: string) => useLobbyStore.getState().links[id]?.status === "linked";
