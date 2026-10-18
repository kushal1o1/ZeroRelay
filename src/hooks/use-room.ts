"use client";
import { useSignaling } from "@/hooks/use-signaling";
import { useWebRTC } from "@/hooks/use-webrtc";
import { type Incoming, applyChunk, finalizeDownload, sendFileInChunks } from "@/lib/file-transfer";
import { ensureLocalIPs } from "@/lib/ice";
import { generateId } from "@/lib/id";
import { useAvatarStore } from "@/stores/avatar-store";
import { useMarkdownPreviewStore } from "@/stores/markdown-preview-store";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import type {
  AvatarMessage,
  DataMessage,
  FileRequest,
  ItemType,
  PeerMessage,
  Retention,
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
  const previewRequestsRef = useRef<Set<string>>(new Set());
  const discardedPreviewIdsRef = useRef<Set<string>>(new Set());
  const previewTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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
    const roomState = useRoomStore.getState();

    // In global room, silently drop shares from remote peers.
    if (
      roomState.roomId === "global" &&
      (msg?.type === "share" || msg?.type === "avatar") &&
      roomState.peers.find((p) => p.id === fromPeerId)?.locale === "remote"
    ) {
      return;
    }
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
        } else {
          const response = {
            type: "file-error",
            sharedItemId: msg.sharedItemId,
            message: "The sender no longer has this file available.",
          };
          rtcRef.current.sendToPeer(fromPeerId, JSON.stringify(response));
        }
        break;
      }
      case "file-error": {
        const isPreview = previewRequestsRef.current.has(msg.sharedItemId);
        const timeout = previewTimeoutsRef.current.get(msg.sharedItemId);
        if (timeout) clearTimeout(timeout);
        previewTimeoutsRef.current.delete(msg.sharedItemId);
        incomingRef.current.delete(msg.sharedItemId);
        previewRequestsRef.current.delete(msg.sharedItemId);
        discardedPreviewIdsRef.current.delete(msg.sharedItemId);
        if (isPreview) {
          useMarkdownPreviewStore.getState().setError(msg.sharedItemId);
        } else if (store.transfers[msg.sharedItemId] === "download") {
          store.clearProgress(msg.sharedItemId);
        }
        store.setTransferMode(msg.sharedItemId, null);
        break;
      }
      case "file-chunk": {
        if (discardedPreviewIdsRef.current.has(msg.sharedItemId)) break;
        const timeout = previewTimeoutsRef.current.get(msg.sharedItemId);
        if (timeout) {
          clearTimeout(timeout);
          previewTimeoutsRef.current.delete(msg.sharedItemId);
        }
        const { entry, done } = applyChunk(incomingRef.current, msg);
        const isPreview = previewRequestsRef.current.has(msg.sharedItemId);
        if (!isPreview) {
          store.setProgress(msg.sharedItemId, entry.total > 0 ? entry.received / entry.total : 1);
        }
        if (done) {
          const timeout = previewTimeoutsRef.current.get(msg.sharedItemId);
          if (timeout) clearTimeout(timeout);
          previewTimeoutsRef.current.delete(msg.sharedItemId);
          previewRequestsRef.current.delete(msg.sharedItemId);
          store.setTransferMode(msg.sharedItemId, null);
          const item = store.items.find((i) => i.id === msg.sharedItemId);
          if (isPreview) {
            new Blob(entry.parts, { type: item?.mime || "text/markdown" })
              .text()
              .then((content) =>
                useMarkdownPreviewStore.getState().setContent(msg.sharedItemId, content),
              )
              .catch(() => useMarkdownPreviewStore.getState().setError(msg.sharedItemId));
          } else {
            finalizeDownload(entry, item?.fileName || "download", item?.mime || "");
          }
        } else if (isPreview) {
          const timeout = setTimeout(() => {
            incomingRef.current.delete(msg.sharedItemId);
            previewRequestsRef.current.delete(msg.sharedItemId);
            previewTimeoutsRef.current.delete(msg.sharedItemId);
            discardedPreviewIdsRef.current.add(msg.sharedItemId);
            useMessageStore.getState().setTransferMode(msg.sharedItemId, null);
            useMarkdownPreviewStore.getState().setError(msg.sharedItemId);
          }, 20_000);
          previewTimeoutsRef.current.set(msg.sharedItemId, timeout);
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
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        address?: string | null;
      },
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

  // When we learn a peer's locale from ICE candidates, tag them in the store.
  const onPeerLocale = useCallback((targetId: string, locale: "local" | "remote") => {
    useRoomStore.getState().setPeerLocale(targetId, locale);
  }, []);

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
    retryPendingLocale,
  } = useWebRTC(peerId, sendSignaling, onData, onChannelOpen, onPeerLocale);

  // Kick off LAN IP detection early; retry any pending locale classifications.
  useEffect(() => {
    ensureLocalIPs()
      .then(() => retryPendingLocale())
      .catch(() => {});
  }, [retryPendingLocale]);

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
    (item: SharedItem, target?: string | string[]): boolean => {
      const msg: DataMessage = {
        type: "share",
        item,
        targetPeerId: Array.isArray(target) ? undefined : target,
      };
      const payload = JSON.stringify(msg);
      const state = useRoomStore.getState();
      let delivered = false;
      if (Array.isArray(target)) {
        // Direct-send to a specific set of peers (echoed into our own feed once).
        for (const id of target) {
          if (sendToPeer(id, payload)) delivered = true;
        }
      } else if (target) {
        delivered = sendToPeer(target, payload);
      } else if (state.roomId === "global") {
        // Global room: only share with local-LAN peers.
        for (const peer of state.peers) {
          if (peer.id === state.peerId) continue;
          if (peer.locale === "remote") continue;
          if (sendToPeer(peer.id, payload)) delivered = true;
        }
      } else {
        delivered = broadcast(payload).length > 0;
      }
      useMessageStore.getState().addItem(item);
      if (!delivered) console.warn("Share not delivered (no open data channel yet)");
      return delivered;
    },
    [sendToPeer, broadcast],
  );

  const shareText = useCallback(
    (
      content: string,
      targetPeerId?: string | string[],
      type: ItemType = "text",
      retention: Retention = "session",
    ) => {
      const state = useRoomStore.getState();
      const item: SharedItem = {
        id: generateId(),
        roomId: state.roomId || "global",
        peerId,
        peerName: state.name,
        type,
        retention,
        content,
        timestamp: Date.now(),
      };
      dispatchShare(item, targetPeerId);
    },
    [peerId, dispatchShare],
  );

  const shareFile = useCallback(
    (file: File, targetPeerId?: string | string[], retention: Retention = "forever") => {
      const state = useRoomStore.getState();
      const item: SharedItem = {
        id: generateId(),
        roomId: state.roomId || "global",
        peerId,
        peerName: state.name,
        type: "file",
        retention,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
        timestamp: Date.now(),
      };
      outgoingFilesRef.current.set(item.id, file);
      dispatchShare(item, targetPeerId);
    },
    [peerId, dispatchShare],
  );

  const shareFiles = useCallback(
    (files: File[], targetPeerId?: string | string[], retention: Retention = "forever") => {
      for (const file of files) shareFile(file, targetPeerId, retention);
    },
    [shareFile],
  );

  // Receiver: ask the owner peer to stream a file's bytes; onData handles the
  // incoming chunks and triggers the browser download on completion.
  const requestFile = useCallback(
    (item: SharedItem, purpose: "download" | "preview" = "download") => {
      if (item.type !== "file") return;
      const store = useMessageStore.getState();
      if (store.transfers[item.id]) {
        if (purpose === "preview") {
          useMarkdownPreviewStore.getState().beginFile(item);
          useMarkdownPreviewStore.getState().setError(item.id);
        }
        return;
      }
      if (purpose === "preview") {
        if (previewRequestsRef.current.has(item.id)) return;
        discardedPreviewIdsRef.current.delete(item.id);
        useMarkdownPreviewStore.getState().beginFile(item);
        if (item.peerId === peerId) {
          const file = outgoingFilesRef.current.get(item.id);
          if (!file) {
            useMarkdownPreviewStore.getState().setError(item.id);
            return;
          }
          file
            .text()
            .then((content) => useMarkdownPreviewStore.getState().setContent(item.id, content))
            .catch(() => useMarkdownPreviewStore.getState().setError(item.id));
          return;
        }
        previewRequestsRef.current.add(item.id);
      } else {
        discardedPreviewIdsRef.current.delete(item.id);
        store.setProgress(item.id, 0);
      }
      store.setTransferMode(item.id, purpose);
      const req: FileRequest = { type: "file-request", sharedItemId: item.id, purpose };
      if (!sendToPeer(item.peerId, JSON.stringify(req))) {
        console.warn("Cannot request file: no open channel to owner");
        store.setTransferMode(item.id, null);
        if (purpose === "preview") {
          previewRequestsRef.current.delete(item.id);
          useMarkdownPreviewStore.getState().setError(item.id);
        } else {
          store.clearProgress(item.id);
        }
        return;
      }
      if (purpose === "preview") {
        const timeout = setTimeout(() => {
          incomingRef.current.delete(item.id);
          previewRequestsRef.current.delete(item.id);
          previewTimeoutsRef.current.delete(item.id);
          discardedPreviewIdsRef.current.add(item.id);
          useMessageStore.getState().setTransferMode(item.id, null);
          useMarkdownPreviewStore.getState().setError(item.id);
        }, 20_000);
        previewTimeoutsRef.current.set(item.id, timeout);
      }
    },
    [sendToPeer, peerId],
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
    const roomId = useRoomStore.getState().roomId;
    disconnectAll();
    leaveRoom();
    if (roomId) useMessageStore.getState().removeRoomItems(roomId);
  }, [disconnectAll, leaveRoom]);

  return {
    joinRoom,
    leaveRoom: leaveRoomWithCleanup,
    rename,
    sendSignaling,
    disconnectAll,
    shareText,
    shareFile,
    shareFiles,
    requestFile,
    updateAvatar,
  };
}
