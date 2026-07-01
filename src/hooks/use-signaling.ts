"use client";

import { SignalingClient } from "@/lib/signaling";
import { useRoomStore } from "@/stores/room-store";
import { useEffect, useRef } from "react";
import type { ClientMessage, ServerMessage } from "../../shared/types";

function resolveUrl(): string {
  const env = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (env) return env;
  if (typeof window !== "undefined") {
    // Match the page's security context: an HTTPS page cannot open an
    // insecure ws:// socket (mixed content), so use wss:// there.
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.hostname}:8787/api/ws`;
  }
  return "ws://localhost:8787/api/ws";
}

let globalClient: SignalingClient | null = null;

function getClient(): SignalingClient {
  if (!globalClient) {
    globalClient = new SignalingClient(resolveUrl());
  }
  return globalClient;
}

type MessageHandler = (msg: ServerMessage) => void;

export function useSignaling(onMessage?: MessageHandler) {
  const clientRef = useRef<SignalingClient>(getClient());
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const client = clientRef.current;

    client.setOnDisconnect(() => {
      const s = useRoomStore.getState();
      s.setConnected(false);
      s.setError("Connection lost. Reconnecting...");
    });

    const unsub = client.onMessage((msg) => {
      const state = useRoomStore.getState();
      switch (msg.type) {
        case "joined":
          state.setPeerId(msg.peerId);
          state.setPeers(msg.peers);
          state.setConnected(true);
          state.setError(null);
          break;
        case "presence":
          state.setPeers(msg.peers);
          break;
        case "peer-joined":
          state.addPeer(msg.peer);
          break;
        case "peer-left":
          state.removePeer(msg.peerId);
          break;
        case "peer-renamed":
          state.renamePeer(msg.peerId, msg.name);
          break;
        case "error":
          state.setError(msg.message);
          break;
      }

      handlerRef.current?.(msg);
    });

    client.connect();

    return () => {
      unsub();
    };
  }, []);

  const joinRoom = (roomId: string, password?: string) => {
    const client = clientRef.current;
    const state = useRoomStore.getState();
    state.setRoomId(roomId);
    state.setError(null);
    const msg: ClientMessage = {
      type: "join",
      roomId,
      password,
      peerId: state.peerId,
      name: state.name,
    };
    client.send(msg);
  };

  const leaveRoom = () => {
    const client = clientRef.current;
    const state = useRoomStore.getState();
    if (state.roomId) {
      const msg: ClientMessage = { type: "leave", roomId: state.roomId, peerId: state.peerId };
      client.send(msg);
    }
    state.setRoomId(null);
    state.setPeers([]);
  };

  const rename = (name: string) => {
    const client = clientRef.current;
    const state = useRoomStore.getState();
    state.setName(name);
    if (state.roomId) {
      const msg: ClientMessage = {
        type: "rename",
        roomId: state.roomId,
        peerId: state.peerId,
        name,
      };
      client.send(msg);
    }
  };

  const sendSignaling = (msg: ClientMessage) => {
    clientRef.current.send(msg);
  };

  return { joinRoom, leaveRoom, rename, sendSignaling, getClient: () => clientRef.current };
}
