"use client";
import { useSignaling } from "@/hooks/use-signaling";
import { useWebRTC } from "@/hooks/use-webrtc";
import { type Incoming, applyChunk, sendFileInChunks, triggerDownload } from "@/lib/file-transfer";
import { generateId } from "@/lib/id";
import { useAvatarStore } from "@/stores/avatar-store";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import type {
  AvatarMessage,
  DataMessage,
  FileRequest,
  PeerMessage,
  SharedItem,
} from "@/types/message";
import { useCallback, useEffect, useRef } from "react";
import type { SDP, ServerMessage } from "../../shared/types";

export function useRoom() {
  const peerId = useRoomStore((s) => s.peerId);

  // Files we've offered (sharedItemId -> File) so we can serve bytes on request.
  const outgoingFilesRef = useRef<Map<string, File>>(new Map());
  // In-progress incoming file reassembly (sharedItemId -> buffer/state).
  const incomingRef = useRef<Map<string, Incoming>>(new Map());
  // WebRTC send fns, filled after useWebRTC — breaks the onData<->send cycle.
  const rtcRef = useRef<{
    sendToPeer: (peerId: string, data: string) => boolean;
    bufferedAmount: (peerId: string) => number;
  }>({ sendToPeer: () => false, bufferedAmount: () => 0 });

  // Parse incoming data-channel payloads: share items + file-transfer control.
  const onData = useCallback((fromPeerId: string, data: string) => {
    let msg: PeerMessage;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.warn("Received malformed peer message", err);
      return;
    }
    const store = useMessageStore.getState();
    switch (msg?.type) {
      case "share":
        store.addItem(msg.item);
        break;
      case "file-request": {
        const file = outgoingFilesRef.current.get(msg.sharedItemId);
        if (file) {
          sendFileInChunks(
            file,
            msg.sharedItemId,
            fromPeerId,
            rtcRef.current.sendToPeer,
            rtcRef.current.bufferedAmount,
          ).catch((err) => console.warn("File send failed", err));
        }
        break;
      }
      case "file-chunk": {
        const { entry, done } = applyChunk(incomingRef.current, msg);
        store.setProgress(msg.sharedItemId, entry.total > 0 ? entry.received / entry.total : 1);
        if (done) {
          const item = store.items.find((i) => i.id === msg.sharedItemId);
          triggerDownload(item?.fileName || "download", item?.mime || "", entry.buf);
        }
        break;
      }
      case "avatar":
        useAvatarStore.getState().setAvatar(fromPeerId, msg.dataUrl);
        break;
      default:
        console.warn("Received unknown peer message", msg);
    }
  }, []);

  // Webrtc refs — set after useWebRTC is called.
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

  // Defined before useWebRTC to break the circular dep — reads sendToPeer
  // from rtcRef, which is wired up right after useWebRTC returns.
  const onChannelOpen = useCallback(
    (targetPeerId: string) => {
      const myAvatar = useAvatarStore.getState().map[peerId];
      if (myAvatar) {
        const msg: AvatarMessage = { type: "avatar", dataUrl: myAvatar };
        rtcRef.current.sendToPeer(targetPeerId, JSON.stringify(msg));
      }
    },
    [peerId],
  );

  const {
    connectToPeer,
    disconnectFromPeer,
    disconnectAll,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    sendToPeer,
    broadcast,
    bufferedAmount,
  } = useWebRTC(peerId, sendSignaling, onData, onChannelOpen);

  // Set refs so msgHandler / onData always use the latest functions.
  webrtcRef.current = { handleOffer, handleAnswer, handleIceCandidate };
  rtcRef.current = { sendToPeer, bufferedAmount };

  // When room state changes, connect/disconnect WebRTC peers.
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

  // Send a share to a specific peer or everyone, and echo it into the local
  // feed so the sender sees it immediately (even if no peer is connected yet).
  const dispatchShare = useCallback(
    (item: SharedItem, targetPeerId?: string): boolean => {
      const msg: DataMessage = { type: "share", item, targetPeerId };
      const payload = JSON.stringify(msg);
      const delivered = targetPeerId
        ? sendToPeer(targetPeerId, payload)
        : broadcast(payload).length > 0;
      useMessageStore.getState().addItem(item);
      if (!delivered) console.warn("Share not delivered (no open data channel yet)");
      return delivered;
    },
    [sendToPeer, broadcast],
  );

  const shareText = useCallback(
    (content: string, targetPeerId?: string) => {
      const state = useRoomStore.getState();
      const item: SharedItem = {
        id: generateId(),
        roomId: state.roomId || "global",
        peerId,
        peerName: state.name,
        type: "text",
        content,
        timestamp: Date.now(),
      };
      dispatchShare(item, targetPeerId);
    },
    [peerId, dispatchShare],
  );

  const shareFile = useCallback(
    (file: File, targetPeerId?: string) => {
      const state = useRoomStore.getState();
      const item: SharedItem = {
        id: generateId(),
        roomId: state.roomId || "global",
        peerId,
        peerName: state.name,
        type: "file",
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        timestamp: Date.now(),
      };
      // Keep the File around so we can stream its bytes when a peer requests it.
      outgoingFilesRef.current.set(item.id, file);
      dispatchShare(item, targetPeerId);
    },
    [peerId, dispatchShare],
  );

  // Receiver: ask the owner peer to stream a file's bytes; onData handles the
  // incoming chunks and triggers the browser download on completion.
  const requestFile = useCallback(
    (item: SharedItem) => {
      if (item.type !== "file") return;
      const req: FileRequest = { type: "file-request", sharedItemId: item.id };
      useMessageStore.getState().setProgress(item.id, 0);
      if (!sendToPeer(item.peerId, JSON.stringify(req))) {
        console.warn("Cannot request file: no open channel to owner");
      }
    },
    [sendToPeer],
  );

  const updateAvatar = useCallback(
    (dataUrl: string) => {
      useAvatarStore.getState().setAvatar(peerId, dataUrl);
      const msg: AvatarMessage = { type: "avatar", dataUrl };
      broadcast(JSON.stringify(msg));
    },
    [peerId, broadcast],
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
    shareText,
    shareFile,
    requestFile,
    updateAvatar,
  };
}
