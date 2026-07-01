"use client";

import { useSignaling } from "@/hooks/use-signaling";
import { useWebRTC } from "@/hooks/use-webrtc";
import { useRoomStore } from "@/stores/room-store";
import { useCallback, useEffect, useRef } from "react";
import type { SDP, ServerMessage } from "../../shared/types";

export function useRoom() {
  const peerId = useRoomStore((s) => s.peerId);

  const onData = useCallback((_peerId: string, data: string) => {
    console.log("Data from", _peerId, data);
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
  } = useWebRTC(peerId, sendSignaling, onData);

  // Set refs so msgHandler uses latest functions
  webrtcRef.current = { handleOffer, handleAnswer, handleIceCandidate };

  // When room state changes, connect/disconnect WebRTC peers
  useEffect(() => {
    const unsub = useRoomStore.subscribe((state, prev) => {
      if (state.connected && !prev.connected) {
        for (const peer of state.peers) {
          if (peer.id !== state.peerId) {
            connectToPeer(peer.id);
          }
        }
      }

      if (state.peers.length > prev.peers.length) {
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
  }, [connectToPeer, disconnectFromPeer]);

  return { joinRoom, leaveRoom, rename, sendSignaling, disconnectAll };
}
