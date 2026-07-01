import { generateId } from "@/lib/id";
import { create } from "zustand";
import type { Peer } from "../../shared/types";

interface RoomState {
  peerId: string;
  name: string;
  roomId: string | null;
  peers: Peer[];
  connected: boolean;
  error: string | null;

  setPeerId: (id: string) => void;
  setName: (name: string) => void;
  setRoomId: (id: string | null) => void;
  setPeers: (peers: Peer[]) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  addPeer: (peer: Peer) => void;
  removePeer: (peerId: string) => void;
  renamePeer: (peerId: string, name: string) => void;
}

const savedName =
  typeof localStorage !== "undefined" ? localStorage.getItem("zerorelay-name") : null;

export const useRoomStore = create<RoomState>((set) => ({
  peerId: generateId(),
  name: savedName || "Anonymous",
  roomId: null,
  peers: [],
  connected: false,
  error: null,

  setPeerId: (peerId) => set({ peerId }),
  setName: (name) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("zerorelay-name", name);
    set({ name });
  },
  setRoomId: (roomId) => set({ roomId }),
  setPeers: (peers) => set({ peers }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),
  addPeer: (peer) =>
    set((s) => ({ peers: s.peers.some((p) => p.id === peer.id) ? s.peers : [...s.peers, peer] })),
  removePeer: (peerId) => set((s) => ({ peers: s.peers.filter((p) => p.id !== peerId) })),
  renamePeer: (peerId, name) =>
    set((s) => ({ peers: s.peers.map((p) => (p.id === peerId ? { ...p, name } : p)) })),
}));
