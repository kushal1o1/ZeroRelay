"use client";

import { roomSocketUrl } from "@/lib/endpoints";
import { identity } from "@/lib/identity";
import { CLOSE, SignalingClient } from "@/lib/signaling";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useCallback, useEffect, useRef } from "react";
import {
  type ClientMessage,
  type ErrorCode,
  NEARBY_ROOM_ID,
  PROTOCOL_VERSION,
  type ServerMessage,
  type SignalPayload,
  type Visibility,
} from "../../shared/types";

export interface JoinOptions {
  /** Create a new private room with this name (and optional password). */
  create?: { name: string; password?: string };
  password?: string;
}

type JoinMessage = Extract<ClientMessage, { type: "join" }>;
type MessageHandler = (msg: ServerMessage) => void;

/** Errors that mean the join itself was rejected. */
const JOIN_ERRORS = new Set<ErrorCode>([
  "bad-auth",
  "not-found",
  "exists",
  "rate-limited",
  "full",
  "outdated",
  "invalid",
]);

function buildJoin(roomId: string, opts: JoinOptions): JoinMessage {
  const ui = useUIStore.getState();
  return {
    type: "join",
    v: PROTOCOL_VERSION,
    secret: identity.secret,
    name: useRoomStore.getState().name,
    visibility: ui.visibility,
    create: opts.create,
    password: opts.password,
    token: ui.rooms.find((r) => r.id === roomId)?.joinToken,
  };
}

export function useSignaling(onMessage?: MessageHandler) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;
  const clientRef = useRef<SignalingClient | null>(null);
  const joinRef = useRef<JoinMessage | null>(null);

  const joinRoom = useCallback((roomId: string, opts: JoinOptions = {}) => {
    const state = useRoomStore.getState();
    if (roomId === state.roomId && state.connected && !opts.create && !opts.password) return;

    // Clear the old room first so useRoom tears down its WebRTC links.
    state.reset();
    state.setRoomId(roomId);
    state.setError(null);
    const join = buildJoin(roomId, opts);
    joinRef.current = join;
    // Before the effect below has created the client, it opens this join itself.
    clientRef.current?.open(roomSocketUrl(roomId), join);
  }, []);

  useEffect(() => {
    const fallBackToNearby = () => {
      useUIStore.getState().setActiveRoomId(NEARBY_ROOM_ID);
      joinRoom(NEARBY_ROOM_ID);
    };

    const handle = (msg: ServerMessage) => {
      const state = useRoomStore.getState();
      const ui = useUIStore.getState();
      switch (msg.type) {
        case "joined": {
          state.setJoined(msg.self, msg.peers, msg.room);
          if (!msg.room.nearby) {
            ui.upsertRoom({
              id: msg.room.id,
              name: msg.room.name,
              hasPassword: msg.room.hasPassword,
              joinToken: msg.joinToken,
              ...(msg.ownerToken ? { ownerToken: msg.ownerToken } : {}),
            });
            ui.setActiveRoomId(msg.room.id);
          }
          // Reconnects replay the join: never re-send create/password, use the token.
          if (joinRef.current) {
            const replay: JoinMessage = {
              ...joinRef.current,
              create: undefined,
              password: undefined,
              token: msg.joinToken,
            };
            joinRef.current = replay;
            clientRef.current?.setJoin(replay);
          }
          break;
        }
        case "peer-joined":
          state.addPeer(msg.peer);
          break;
        case "peer-left":
          state.removePeer(msg.peerId);
          break;
        case "peer-updated":
          state.updatePeer(msg.peer);
          break;
        case "error": {
          // Per-peer signal errors are handled by the WebRTC layer.
          if (msg.peerId) break;
          state.setError(msg.message);
          const rejectedJoin = !state.connected && JOIN_ERRORS.has(msg.code);
          if (!rejectedJoin) break;
          if (msg.code === "outdated") {
            clientRef.current?.close();
            break;
          }
          const roomId = state.roomId;
          if (msg.code === "not-found" && roomId) ui.removeRoom(roomId);
          if (msg.code === "bad-auth" && roomId) {
            // A saved token stopped working: forget it so we ask for the password.
            const saved = ui.rooms.find((r) => r.id === roomId);
            if (saved) ui.upsertRoom({ ...saved, joinToken: undefined });
          }
          if (roomId !== NEARBY_ROOM_ID) fallBackToNearby();
          else clientRef.current?.close();
          break;
        }
        case "room-deleted":
          ui.removeRoom(msg.roomId);
          if (state.roomId === msg.roomId) {
            fallBackToNearby();
            useRoomStore.getState().setError("This room was deleted by its creator.");
          }
          break;
      }
      handlerRef.current?.(msg);
    };

    const client = new SignalingClient({
      onMessage: handle,
      onDisconnect: (code, terminal) => {
        const s = useRoomStore.getState();
        s.setConnected(false);
        if (code === CLOSE.replaced) s.setError("ZeroRelay was opened in another tab.");
        else if (!terminal) s.setError("Connection lost. Reconnecting…");
      },
    });
    clientRef.current = client;
    // Join requested before mount (child effects run first), or a StrictMode remount.
    const pendingRoom = useRoomStore.getState().roomId;
    if (joinRef.current && pendingRoom) client.open(roomSocketUrl(pendingRoom), joinRef.current);

    const wake = () => {
      if (document.visibilityState === "visible") client.wake();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      client.close();
      clientRef.current = null;
    };
  }, [joinRoom]);

  const leaveRoom = useCallback(() => {
    clientRef.current?.send({ type: "leave" });
    useUIStore.getState().setActiveRoomId(NEARBY_ROOM_ID);
    joinRoom(NEARBY_ROOM_ID);
  }, [joinRoom]);

  /** Delete the current private room (creator only). */
  const deleteRoom = useCallback(() => {
    const roomId = useRoomStore.getState().roomId;
    const ownerToken = useUIStore.getState().rooms.find((r) => r.id === roomId)?.ownerToken;
    if (!ownerToken) return false;
    return clientRef.current?.send({ type: "delete-room", ownerToken }) ?? false;
  }, []);

  const rename = useCallback((name: string) => {
    useRoomStore.getState().setName(name);
    if (joinRef.current) joinRef.current = { ...joinRef.current, name };
    if (joinRef.current) clientRef.current?.setJoin(joinRef.current);
    clientRef.current?.send({ type: "rename", name });
  }, []);

  const setVisibility = useCallback((visibility: Visibility) => {
    useUIStore.getState().setVisibility(visibility);
    if (joinRef.current) joinRef.current = { ...joinRef.current, visibility };
    if (joinRef.current) clientRef.current?.setJoin(joinRef.current);
    clientRef.current?.send({ type: "visibility", visibility });
  }, []);

  const sendSignal = useCallback((to: string, payload: SignalPayload) => {
    clientRef.current?.send({ type: "signal", to, payload });
  }, []);

  return { joinRoom, leaveRoom, deleteRoom, rename, setVisibility, sendSignal };
}
