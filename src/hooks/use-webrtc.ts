"use client";

import { useCallback, useRef } from "react";
import type { ClientMessage, SDP } from "../../shared/types";

type DataHandler = (peerId: string, data: string) => void;

export function useWebRTC(
  peerId: string,
  sendSignaling: (msg: ClientMessage) => void,
  onData: DataHandler,
) {
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const handlersRef = useRef({ onData, sendSignaling });
  handlersRef.current = { onData, sendSignaling };

  const config: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  };

  const flushPendingIce = useCallback((targetId: string) => {
    const pending = pendingIceRef.current.get(targetId);
    if (!pending) return;
    const pc = connectionsRef.current.get(targetId);
    if (!pc?.currentRemoteDescription) return;
    for (const c of pending) {
      try {
        pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {}
    }
    pendingIceRef.current.delete(targetId);
  }, []);

  const handleDataChannel = useCallback((targetId: string, channel: RTCDataChannel) => {
    channelsRef.current.set(targetId, channel);
    channel.onmessage = (e) => {
      handlersRef.current.onData(targetId, e.data);
    };
  }, []);

  const createConnection = useCallback(
    (targetId: string) => {
      if (connectionsRef.current.has(targetId)) return null;

      const pc = new RTCPeerConnection(config);
      connectionsRef.current.set(targetId, pc);

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const msg: ClientMessage = {
          type: "ice-candidate",
          roomId: "",
          from: peerId,
          to: targetId,
          candidate: {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
            usernameFragment: e.candidate.usernameFragment,
          },
        };
        handlersRef.current.sendSignaling(msg);
      };

      pc.ondatachannel = (e) => {
        handleDataChannel(targetId, e.channel);
      };

      return pc;
    },
    [peerId, handleDataChannel],
  );

  const initiateConnection = useCallback(
    async (targetId: string) => {
      const pc = createConnection(targetId);
      if (!pc) return;

      const channel = pc.createDataChannel("data");
      handleDataChannel(targetId, channel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const msg: ClientMessage = {
        type: "offer",
        roomId: "",
        from: peerId,
        to: targetId,
        sdp: { type: offer.type || "offer", sdp: offer.sdp || "" },
      };
      handlersRef.current.sendSignaling(msg);
    },
    [peerId, createConnection, handleDataChannel],
  );

  const handleOffer = useCallback(
    async (from: string, sdp: SDP) => {
      const pc = createConnection(from);
      if (!pc) return;
      if (pc.signalingState !== "stable") return;

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      flushPendingIce(from);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const msg: ClientMessage = {
        type: "answer",
        roomId: "",
        from: peerId,
        to: from,
        sdp: { type: answer.type || "answer", sdp: answer.sdp || "" },
      };
      handlersRef.current.sendSignaling(msg);
    },
    [peerId, createConnection, flushPendingIce],
  );

  const handleAnswer = useCallback(
    async (from: string, sdp: SDP) => {
      const pc = connectionsRef.current.get(from);
      if (!pc) return;
      if (pc.signalingState !== "have-local-offer") return;

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      flushPendingIce(from);
    },
    [flushPendingIce],
  );

  const handleIceCandidate = useCallback(
    (
      from: string,
      candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null },
    ) => {
      const pc = connectionsRef.current.get(from);
      if (!pc) return;

      if (!pc.currentRemoteDescription) {
        const buf = pendingIceRef.current.get(from) || [];
        buf.push(candidate);
        pendingIceRef.current.set(from, buf);
        return;
      }

      try {
        pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    },
    [],
  );

  const connectToPeer = useCallback(
    (targetId: string) => {
      if (targetId === peerId) return;
      if (connectionsRef.current.has(targetId)) return;
      if (peerId < targetId) {
        initiateConnection(targetId);
      }
    },
    [peerId, initiateConnection],
  );

  const disconnectFromPeer = useCallback((targetId: string) => {
    pendingIceRef.current.delete(targetId);
    const channel = channelsRef.current.get(targetId);
    if (channel) {
      channel.close();
      channelsRef.current.delete(targetId);
    }
    const pc = connectionsRef.current.get(targetId);
    if (pc) {
      pc.close();
      connectionsRef.current.delete(targetId);
    }
  }, []);

  const disconnectAll = useCallback(() => {
    for (const pid of connectionsRef.current.keys()) {
      disconnectFromPeer(pid);
    }
  }, [disconnectFromPeer]);

  return {
    connectToPeer,
    disconnectFromPeer,
    disconnectAll,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
  };
}
