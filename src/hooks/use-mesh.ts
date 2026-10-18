"use client";

import { type LinkState, PeerMesh } from "@/lib/peer-mesh";
import { WorldLinks } from "@/lib/world-links";
import { useConnectionStore } from "@/stores/connection-store";
import { isLinked } from "@/stores/lobby-store";
import { useRoomStore } from "@/stores/room-store";
import { useEffect, useRef } from "react";
import type { SignalPayload } from "../../shared/types";

/** Rooms up to this size link everyone up front; bigger rooms link on demand
 *  (when you send to someone or open something they shared). */
const AUTO_LINK_MAX_PEERS = 8;
/** Keep a working link this long after the peer drops off signaling, so a
 *  short signaling blip on their side doesn't cut the direct connection. */
const LEAVE_GRACE_MS = 20_000;

interface MeshHandlers {
  sendSignal: (to: string, payload: SignalPayload) => void;
  onData: (from: string, data: string) => void;
  onOpen: (peerId: string) => void;
  /** An extra channel opened by a peer (file transfers). */
  onChannel: (peerId: string, channel: RTCDataChannel) => void;
  onLinkState: (peerId: string, state: LinkState | null) => void;
}

const isRoomPeer = (id: string) => useRoomStore.getState().peers.some((p) => p.id === id);

/**
 * Creates the device's PeerMesh + WorldLinks once and keeps them in step with
 * the room: who to link, when to let go, and re-checking after the device wakes.
 */
export function useMesh(selfId: string, handlers: MeshHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const ref = useRef<{ mesh: PeerMesh; world: WorldLinks } | null>(null);
  if (!ref.current) {
    let world: WorldLinks | null = null;
    const mesh = new PeerMesh(selfId, {
      signal: (to, payload) => handlersRef.current.sendSignal(to, payload),
      data: (from, data) => handlersRef.current.onData(from, data),
      open: (peerId) => handlersRef.current.onOpen(peerId),
      channel: (peerId, channel) => handlersRef.current.onChannel(peerId, channel),
      state: (peerId, state) => {
        useConnectionStore.getState().set(peerId, state);
        world?.onLinkState(peerId, state);
        handlersRef.current.onLinkState(peerId, state);
      },
      wanted: (peerId) => isRoomPeer(peerId) || isLinked(peerId),
    });
    world = new WorldLinks(mesh, (to, payload) => handlersRef.current.sendSignal(to, payload));
    ref.current = { mesh, world };
  }
  const { mesh, world } = ref.current;

  // Follow the room: link new peers, release departed ones, reset on room switch.
  useEffect(() => {
    const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const cancelGrace = (id: string) => {
      const t = graceTimers.get(id);
      if (t) clearTimeout(t);
      graceTimers.delete(id);
    };

    const autoLink = (peers: { id: string }[]) => {
      if (peers.length > AUTO_LINK_MAX_PEERS) return;
      const failed = useConnectionStore.getState().links;
      for (const p of peers) {
        // A failed peer waits for a manual retry instead of redialing forever.
        if (failed[p.id] !== "failed") mesh.connect(p.id);
      }
    };

    const unsub = useRoomStore.subscribe((state, prev) => {
      if (state.roomId !== prev.roomId) {
        for (const id of graceTimers.keys()) cancelGrace(id);
        world.reset();
        mesh.disconnectAll();
        useConnectionStore.getState().clear();
        return;
      }
      if (state.peers === prev.peers) return;

      const now = new Set(state.peers.map((p) => p.id));
      for (const p of prev.peers) {
        if (now.has(p.id) || isLinked(p.id)) continue;
        if (!mesh.isOpen(p.id)) {
          mesh.disconnect(p.id);
          continue;
        }
        cancelGrace(p.id);
        graceTimers.set(
          p.id,
          setTimeout(() => {
            graceTimers.delete(p.id);
            if (!isRoomPeer(p.id)) mesh.disconnect(p.id);
          }, LEAVE_GRACE_MS),
        );
      }
      for (const p of state.peers) cancelGrace(p.id);
      if (state.connected) autoLink(state.peers);
    });

    return () => {
      unsub();
      for (const id of graceTimers.keys()) cancelGrace(id);
    };
  }, [mesh, world]);

  // Phones freeze background tabs; re-check every link when we come back.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") mesh.wake();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      mesh.disconnectAll();
    };
  }, [mesh]);

  return { mesh, world };
}
