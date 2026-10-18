"use client";

import type { LinkState } from "@/lib/peer-mesh";
import { useConnectionStore } from "@/stores/connection-store";
import { useLobbyStore } from "@/stores/lobby-store";
import { useRoomStore } from "@/stores/room-store";
import { useMemo } from "react";
import type { Peer } from "../../shared/types";

/** A peer as the UI shows it: a room member or an accepted lobby link. */
export interface ViewPeer extends Peer {
  /** Linked through the lobby (on another network), not a room member. */
  world?: boolean;
  /** State of the direct link, if one has been attempted. */
  link?: LinkState;
}

/** Everyone you can send to right now, except yourself. */
export function useVisiblePeers(): ViewPeer[] {
  const peers = useRoomStore((s) => s.peers);
  const selfId = useRoomStore((s) => s.peerId);
  const lobbyLinks = useLobbyStore((s) => s.links);
  const linkStates = useConnectionStore((s) => s.links);

  return useMemo(() => {
    const roomPeers: ViewPeer[] = peers
      .filter((p) => p.id !== selfId)
      .map((p) => ({ ...p, link: linkStates[p.id] }));
    const roomIds = new Set(roomPeers.map((p) => p.id));
    const worldPeers: ViewPeer[] = Object.values(lobbyLinks)
      .filter((l) => l.status === "linked" && !roomIds.has(l.id))
      .map((l) => ({
        id: l.id,
        name: l.name,
        joinedAt: l.since,
        net: "",
        locale: "remote",
        world: true,
        link: linkStates[l.id],
      }));
    return [...roomPeers, ...worldPeers];
  }, [peers, selfId, lobbyLinks, linkStates]);
}
