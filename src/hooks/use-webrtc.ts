"use client";
import { useRoomStore } from "@/stores/room-store";
import { useCallback, useEffect, useRef } from "react";
import type { ClientMessage, SDP } from "../../shared/types";

type DataHandler = (peerId: string, data: string) => void;

export function useWebRTC(
  peerId: string,
  sendSignaling: (msg: ClientMessage) => void,
  onData: DataHandler,
  onChannelOpen?: (peerId: string) => void,
) {
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const handlersRef = useRef({ onData, sendSignaling, onChannelOpen });
  handlersRef.current = { onData, sendSignaling, onChannelOpen };

  // Recovery bookkeeping (Fix 4/5). Refs break the mutual reference between
  // createConnection's event handlers and the initiate/restart callbacks.
  const redialRef = useRef<Map<string, number>>(new Map());
  const initiateRef = useRef<(targetId: string) => void>(() => {});
  const restartRef = useRef<(targetId: string) => void>(() => {});

  const config: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      // NOTE: STUN-only will fail behind symmetric NATs / restrictive
      // firewalls. Add a TURN server here for reliable connectivity, e.g.:
      // {
      //   urls: "turn:your-turn-server.example.com:3478",
      //   username: "user",
      //   credential: "pass",
      // },
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
      } catch (err) {
        console.warn(`Failed to add buffered ICE candidate for ${targetId}`, err);
      }
    }
    pendingIceRef.current.delete(targetId);
  }, []);

  const handleDataChannel = useCallback((targetId: string, channel: RTCDataChannel) => {
    channelsRef.current.set(targetId, channel);
    channel.onmessage = (e) => {
      handlersRef.current.onData(targetId, e.data);
    };
    channel.onopen = () => {
      handlersRef.current.onChannelOpen?.(targetId);
    };
    channel.onclose = () => {
      // Avoid holding a reference to a dead channel.
      if (channelsRef.current.get(targetId) === channel) {
        channelsRef.current.delete(targetId);
      }
    };
    channel.onerror = (e) => {
      console.warn(`Data channel error for peer ${targetId}`, e);
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
          roomId: useRoomStore.getState().roomId || "",
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

      // Fix 4: on ICE failure the *initiator* drives an in-place ICE restart
      // (a fresh offer with iceRestart), which recovers the link while keeping
      // the existing data channel alive.
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed" && peerId < targetId) {
          restartRef.current(targetId);
        }
      };

      // Fix 5: a terminal connection failure tears the peer down and — if it's
      // still present — the initiator redials a fresh connection (capped, with
      // backoff). A clean "closed" only cleans up; "connected" clears the
      // redial counter.
      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") {
          redialRef.current.delete(targetId);
          return;
        }
        if (st !== "failed" && st !== "closed") return;

        connectionsRef.current.delete(targetId);
        channelsRef.current.delete(targetId);
        pendingIceRef.current.delete(targetId);

        if (st !== "failed" || peerId >= targetId) return;
        const present = useRoomStore.getState().peers.some((p) => p.id === targetId);
        const attempts = redialRef.current.get(targetId) ?? 0;
        if (!present || attempts >= 3) return;
        redialRef.current.set(targetId, attempts + 1);
        setTimeout(
          () => {
            if (useRoomStore.getState().peers.some((p) => p.id === targetId)) {
              initiateRef.current(targetId);
            }
          },
          1000 * (attempts + 1),
        );
      };

      return pc;
    },
    [peerId, handleDataChannel],
  );

  const initiateConnection = useCallback(
    async (targetId: string) => {
      const pc = createConnection(targetId);
      if (!pc) return;
      try {
        const channel = pc.createDataChannel("data");
        handleDataChannel(targetId, channel);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // Trickle ICE: send the offer immediately; candidates follow via
        // onicecandidate (no more up-to-3s gathering wait).
        const local = pc.localDescription;
        if (!local) return;
        handlersRef.current.sendSignaling({
          type: "offer",
          roomId: useRoomStore.getState().roomId || "",
          from: peerId,
          to: targetId,
          sdp: { type: local.type, sdp: local.sdp },
        });
      } catch (err) {
        console.error(`Failed to initiate connection to ${targetId}`, err);
        pc.close();
        connectionsRef.current.delete(targetId);
      }
    },
    [peerId, createConnection, handleDataChannel],
  );

  // Fix 4: in-place ICE restart on the existing connection (initiator side).
  const restartConnection = useCallback(
    async (targetId: string) => {
      const pc = connectionsRef.current.get(targetId);
      if (!pc || pc.signalingState !== "stable") return;
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        const local = pc.localDescription;
        if (!local) return;
        handlersRef.current.sendSignaling({
          type: "offer",
          roomId: useRoomStore.getState().roomId || "",
          from: peerId,
          to: targetId,
          sdp: { type: local.type, sdp: local.sdp },
        });
      } catch (err) {
        console.warn(`ICE restart failed for ${targetId}`, err);
      }
    },
    [peerId],
  );

  // Wire the recovery refs now that the callbacks exist (Fix 4/5).
  initiateRef.current = initiateConnection;
  restartRef.current = restartConnection;

  const handleOffer = useCallback(
    async (from: string, sdp: SDP) => {
      if (from === peerId) return;

      const pc = connectionsRef.current.get(from) ?? createConnection(from) ?? undefined;
      if (!pc) return;

      // Glare handling: if we already have a local offer out and the
      // remote's id sorts lower than ours, we yield and accept theirs
      // (mirrors the "lower peerId initiates" convention used elsewhere).
      if (pc.signalingState === "have-local-offer") {
        if (peerId < from) {
          // We're the initiator by convention; ignore their offer, ours wins.
          return;
        }
        // Roll back our offer and accept theirs.
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch (err) {
          console.warn(`Rollback failed for ${from}`, err);
          return;
        }
      } else if (pc.signalingState !== "stable") {
        console.warn(`Dropping offer from ${from}: unexpected state ${pc.signalingState}`);
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        flushPendingIce(from);
        const answerDesc = await pc.createAnswer();
        await pc.setLocalDescription(answerDesc);
        const local = pc.localDescription;
        if (!local) return;
        handlersRef.current.sendSignaling({
          type: "answer",
          roomId: useRoomStore.getState().roomId || "",
          from: peerId,
          to: from,
          sdp: { type: local.type, sdp: local.sdp },
        });
      } catch (err) {
        console.error(`Failed to handle offer from ${from}`, err);
      }
    },
    [peerId, createConnection, flushPendingIce],
  );

  const handleAnswer = useCallback(
    async (from: string, sdp: SDP) => {
      const pc = connectionsRef.current.get(from);
      if (!pc) return;
      if (pc.signalingState !== "have-local-offer") {
        console.warn(`Dropping answer from ${from}: unexpected state ${pc.signalingState}`);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        flushPendingIce(from);
      } catch (err) {
        console.error(`Failed to handle answer from ${from}`, err);
      }
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
      } catch (err) {
        console.warn(`Failed to add ICE candidate from ${from}`, err);
      }
    },
    [],
  );

  const connectToPeer = useCallback(
    (targetId: string) => {
      if (targetId === peerId) return;
      if (connectionsRef.current.has(targetId)) return;
      // Deterministic tie-break: lower peerId initiates the offer.
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
      pc.onicecandidate = null;
      pc.ondatachannel = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.close();
      connectionsRef.current.delete(targetId);
    }
  }, []);

  const disconnectAll = useCallback(() => {
    for (const pid of Array.from(connectionsRef.current.keys())) {
      disconnectFromPeer(pid);
    }
  }, [disconnectFromPeer]);

  // Send a string payload to a single connected peer over its data channel.
  // Returns true if the send was attempted (channel was open), false otherwise.
  const sendToPeer = useCallback((targetId: string, data: string): boolean => {
    const channel = channelsRef.current.get(targetId);
    if (!channel || channel.readyState !== "open") {
      console.warn(`Cannot send to ${targetId}: no open data channel`);
      return false;
    }
    try {
      channel.send(data);
      return true;
    } catch (err) {
      console.warn(`Failed to send to ${targetId}`, err);
      return false;
    }
  }, []);

  // Current outbound buffer for a peer's channel — used to apply backpressure
  // while streaming file chunks (Fix 6).
  const bufferedAmount = useCallback((targetId: string): number => {
    return channelsRef.current.get(targetId)?.bufferedAmount ?? 0;
  }, []);

  // Send a string payload to every connected peer. Returns the list of
  // peer ids the send actually succeeded for.
  const broadcast = useCallback((data: string): string[] => {
    const sentTo: string[] = [];
    for (const [targetId, channel] of channelsRef.current.entries()) {
      if (channel.readyState !== "open") continue;
      try {
        channel.send(data);
        sentTo.push(targetId);
      } catch (err) {
        console.warn(`Failed to broadcast to ${targetId}`, err);
      }
    }
    return sentTo;
  }, []);

  // Clean up all peer connections on unmount to avoid leaking connections
  // when the component using this hook goes away.
  useEffect(() => {
    return () => {
      disconnectAll();
    };
  }, [disconnectAll]);

  return {
    connectToPeer,
    disconnectFromPeer,
    disconnectAll,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    sendToPeer,
    broadcast,
    bufferedAmount,
  };
}
