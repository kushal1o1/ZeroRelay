"use client";

import { useRoom } from "@/hooks/use-room";
import { type ReactNode, createContext, useContext } from "react";

type RoomApi = ReturnType<typeof useRoom>;

const RoomContext = createContext<RoomApi | null>(null);

/**
 * Mounts the single `useRoom()` instance for the whole app. Everything
 * (signaling client, the WebRTC mesh, the store subscription) lives here once —
 * consumers read it via `useRoomContext()` instead of calling `useRoom()`
 * themselves, which would spin up duplicate meshes.
 */
export function RoomProvider({ children }: { children: ReactNode }) {
  const room = useRoom();
  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}

export function useRoomContext(): RoomApi {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoomContext must be used within <RoomProvider>");
  return ctx;
}
