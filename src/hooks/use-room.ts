"use client";
import { useSignaling } from "@/hooks/use-signaling";
import { useStorage } from "@/hooks/use-storage";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useRoomStore } from "@/stores/room-store";
import type { DataMessage, SharedItem } from "@/types/message";
import { useCallback, useEffect, useRef } from "react";
import type { SDP, ServerMessage } from "../../shared/types";

export function useRoom() {
  const peerId = useRoomStore((s) => s.peerId);
  const { addItem } = useStorage();

  // Keep a ref to addItem so onData (created once) always calls the latest
  // version without needing to be recreated itself.
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;

  // Parse incoming data-channel payloads and persist any "share" items.
  const onData = useCallback((_peerId: string, data: string) => {
    let msg: DataMessage;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.warn("Received malformed peer message", err);
      return;
    }
    if (msg?.type === "share" && msg.item) {
      addItemRef.current(msg.item);
    } else {
      console.warn("Received unknown peer message type", msg);
    }
  }, []);

  // Webrtc refs — set after useWebRTC is called
  const webrtcRef = useRef<{
    handleOffer: (from: string, sdp: SDP) => Promise<void>;
    handleAnswer: (from: string, sdp: SDP) => Promise<void>;
    handleIceCandidate: (
      from: string,
      candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null },
    ) => void;
  }>({
    handleOffer: async () => {},
    handleAnswer: async () => {},
    handleIceCandidate: () => {},
  });

  const msgHandler = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "offer":
        webrtcRef.current.handleOffer(msg.from, msg.sdp);
        break;
      case "answer":
        webrtcRef.current.handleAnswer(msg.from, msg.sdp);
        break;
      case "ice-candidate":
        webrtcRef.current.handleIceCandidate(msg.from, msg.candidate);
        break;
    }
  }, []);

  const { joinRoom, leaveRoom, rename, sendSignaling } = useSignaling(msgHandler);

  const {
    connectToPeer,
    disconnectFromPeer,
    disconnectAll,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    sendToPeer,
    broadcast,
  } = useWebRTC(peerId, sendSignaling, onData);

  // Set refs so msgHandler uses latest functions
  webrtcRef.current = { handleOffer, handleAnswer, handleIceCandidate };

  // When room state changes, connect/disconnect WebRTC peers
  useEffect(() => {
    const unsub = useRoomStore.subscribe((state, prev) => {
      if (!state.connected && prev.connected) {
        disconnectAll();
      }
      if (state.connected && !prev.connected) {
        for (const peer of state.peers) {
          if (peer.id !== state.peerId) {
            connectToPeer(peer.id);
          }
        }
      }
      if (state.connected && state.peers.length > prev.peers.length) {
        const newPeers = state.peers.filter(
          (p) => !prev.peers.find((op) => op.id === p.id) && p.id !== state.peerId,
        );
        for (const peer of newPeers) {
          connectToPeer(peer.id);
        }
      }
      if (state.peers.length < prev.peers.length) {
        const removed = prev.peers.filter((p) => !state.peers.find((np) => np.id === p.id));
        for (const peer of removed) {
          disconnectFromPeer(peer.id);
        }
      }
    });
    return unsub;
  }, [connectToPeer, disconnectFromPeer, disconnectAll]);

  // Share an item with either a specific peer or everyone connected.
  // Also saves it into local storage so the sender's own feed shows it
  // immediately (matches SharedFeed reading from useStorage()).
  const shareItem = useCallback(
    (item: SharedItem, targetPeerId?: string): boolean => {
      const msg: DataMessage = { type: "share", item, targetPeerId };
      const payload = JSON.stringify(msg);

      let delivered: boolean;
      if (targetPeerId) {
        delivered = sendToPeer(targetPeerId, payload);
      } else {
        const sentTo = broadcast(payload);
        delivered = sentTo.length > 0;
      }

      // Persist locally regardless of delivery so the sender sees their
      // own share in the feed even if no peers are currently connected.
      addItemRef.current(item);

      if (!delivered) {
        console.warn("Share was not delivered to any peer (no open data channel yet)");
      }
      return delivered;
    },
    [sendToPeer, broadcast],
  );

  const leaveRoomWithCleanup = useCallback(() => {
    disconnectAll();
    leaveRoom();
  }, [disconnectAll, leaveRoom]);

  return {
    joinRoom,
    leaveRoom: leaveRoomWithCleanup,
    rename,
    sendSignaling,
    disconnectAll,
    shareItem,
  };
}
