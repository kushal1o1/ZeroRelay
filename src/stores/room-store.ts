import { identity } from "@/lib/identity";
import { create } from "zustand";
import type { Peer, RoomInfo } from "../../shared/types";

interface RoomState {
  peerId: string;
  name: string;
  /** Room we're connected to (or currently joining). */
  roomId: string | null;
  room: RoomInfo | null;
  /** Our own network tag in the current room; peers with the same tag are LAN. */
  selfNet: string | null;
  peers: Peer[];
  connected: boolean;
  error: string | null;

  setName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setJoined: (self: Peer, peers: Peer[], room: RoomInfo) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  addPeer: (peer: Peer) => void;
  updatePeer: (peer: Peer) => void;
  removePeer: (peerId: string) => void;
  /** Forget the current room's peers (before switching rooms). */
  reset: () => void;
}

const NAME_KEY = "zerorelay-name";

const initialName = (() => {
  if (typeof localStorage === "undefined") return "";
  const saved = localStorage.getItem(NAME_KEY);
  if (saved) return saved;
  const generated = `User-${Math.random().toString(36).slice(2, 6)}`;
  localStorage.setItem(NAME_KEY, generated);
  return generated;
})();

function withLocale(peer: Peer, selfNet: string | null): Peer {
  return { ...peer, locale: selfNet !== null && peer.net === selfNet ? "local" : "remote" };
}

export const useRoomStore = create<RoomState>((set) => ({
  peerId: identity.peerId,
  name: initialName,
  roomId: null,
  room: null,
  selfNet: null,
  peers: [],
  connected: false,
  error: null,

  setName: (name) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(NAME_KEY, name);
    set({ name });
  },
  setRoomId: (roomId) => set({ roomId }),
  setJoined: (self, peers, room) =>
    set({
      room,
      roomId: room.id,
      selfNet: self.net,
      peers: peers.map((p) => withLocale(p, self.net)),
      connected: true,
      error: null,
    }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
  addPeer: (peer) =>
    set((s) => ({
      peers: [...s.peers.filter((p) => p.id !== peer.id), withLocale(peer, s.selfNet)],
    })),
  updatePeer: (peer) =>
    set((s) => ({
      peers: s.peers.map((p) => (p.id === peer.id ? withLocale(peer, s.selfNet) : p)),
    })),
  removePeer: (peerId) => set((s) => ({ peers: s.peers.filter((p) => p.id !== peerId) })),
  reset: () => set({ peers: [], room: null, selfNet: null, connected: false }),
}));
