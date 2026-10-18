"use client";
import { useMesh } from "@/hooks/use-mesh";
import { useSignaling } from "@/hooks/use-signaling";
import { type Incoming, applyChunk, finalizeDownload, sendFileInChunks } from "@/lib/file-transfer";
import { generateId } from "@/lib/id";
import { useAvatarStore } from "@/stores/avatar-store";
import { isLinked, useLobbyStore } from "@/stores/lobby-store";
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
import type { LobbyPeer, ServerMessage, SignalPayload } from "../../shared/types";

export function useRoom() {
  const peerId = useRoomStore((s) => s.peerId);

  // Files we've offered (sharedItemId -> File) so we can serve bytes on request.
  const outgoingFilesRef = useRef<Map<string, File>>(new Map());
  // In-progress incoming file reassembly (sharedItemId -> buffer/state).
  const incomingRef = useRef<Map<string, Incoming>>(new Map());
  const previewRequestsRef = useRef<Set<string>>(new Set());
  const discardedPreviewIdsRef = useRef<Set<string>>(new Set());
  const previewTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Set once useMesh has run below; onData needs it to reply to peers.
  const meshRef = useRef<ReturnType<typeof useMesh> | null>(null);

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
          const mesh = meshRef.current?.mesh;
          if (!mesh) break;
          sendFileInChunks(
            file,
            msg.sharedItemId,
            fromPeerId,
            (id, data) => mesh.send(id, data),
            (id) => mesh.bufferedAmount(id),
          ).catch((err) => console.warn("File send failed", err));
        } else {
          const response = {
            type: "file-error",
            sharedItemId: msg.sharedItemId,
            message: "The sender no longer has this file available.",
          };
          meshRef.current?.mesh.send(fromPeerId, JSON.stringify(response));
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

  const msgHandler = useCallback((msg: ServerMessage) => {
    const links = meshRef.current;
    if (!links) return;
    if (msg.type === "signal") {
      if (msg.via === "room") links.mesh.handleSignal(msg.from, msg.payload);
      else links.world.onSignal(msg.from, msg.fromPeer, msg.payload);
    } else if (msg.type === "error" && msg.code === "unreachable" && msg.peerId) {
      links.world.onUnreachable(msg.peerId);
    }
  }, []);

  const { joinRoom, leaveRoom, deleteRoom, rename, setVisibility, sendSignal } =
    useSignaling(msgHandler);

  // Greet each newly opened link with our avatar.
  const onOpen = useCallback(
    (targetPeerId: string) => {
      const myAvatar = useAvatarStore.getState().map[peerId];
      if (!myAvatar) return;
      const msg: AvatarMessage = { type: "avatar", dataUrl: myAvatar };
      meshRef.current?.mesh.send(targetPeerId, JSON.stringify(msg));
    },
    [peerId],
  );

  const links = useMesh(peerId, {
    sendSignal: (to: string, payload: SignalPayload) => sendSignal(to, payload),
    onData,
    onOpen,
  });
  meshRef.current = links;
  const { mesh, world } = links;

  /** Deliver a payload to each peer, linking on demand. Returns who missed it.
   *  Only room members and accepted lobby links are ever dialed. */
  const deliver = useCallback(
    async (peerIds: string[], payload: string): Promise<string[]> => {
      const results = await Promise.all(
        peerIds.map(async (id) => {
          if (!isReachable(id)) return id;
          return (await mesh.ensure(id)) && mesh.send(id, payload) ? null : id;
        }),
      );
      return results.filter((id): id is string => id !== null);
    },
    [mesh],
  );

  // Send a share to a specific peer or everyone, and echo it into the local
  // feed so the sender sees it immediately (even if no peer is connected yet).
  const dispatchShare = useCallback(
    (item: SharedItem, target?: string | string[]) => {
      const msg: DataMessage = {
        type: "share",
        item,
        targetPeerId: Array.isArray(target) ? undefined : target,
      };
      const state = useRoomStore.getState();
      // "Everyone" means everyone in the room; lobby links only get direct sends.
      const recipients = target
        ? Array.isArray(target)
          ? target
          : [target]
        : state.peers.map((p) => p.id).filter((id) => id !== state.peerId);
      useMessageStore.getState().addItem(item);
      void deliver(recipients, JSON.stringify(msg)).then((missed) => {
        if (missed.length === 0) return;
        const names = missed.map((id) => peerName(id)).join(", ");
        useRoomStore.getState().setError(`Couldn't reach ${names} directly.`);
      });
    },
    [deliver],
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
    async (item: SharedItem, purpose: "download" | "preview" = "download") => {
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
      const missed = await deliver([item.peerId], JSON.stringify(req));
      if (missed.length > 0) {
        store.setTransferMode(item.id, null);
        if (purpose === "preview") {
          previewRequestsRef.current.delete(item.id);
          useMarkdownPreviewStore.getState().setError(item.id);
        } else {
          store.clearProgress(item.id);
          useRoomStore.getState().setError(`Couldn't reach ${item.peerName} to get the file.`);
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
    [deliver, peerId],
  );

  const updateAvatar = useCallback(
    (dataUrl: string) => {
      useAvatarStore.getState().setAvatar(peerId, dataUrl);
      const msg = JSON.stringify({ type: "avatar", dataUrl } satisfies AvatarMessage);
      for (const id of mesh.openPeers()) mesh.send(id, msg);
    },
    [peerId, mesh],
  );

  const leaveRoomWithCleanup = useCallback(() => {
    const roomId = useRoomStore.getState().roomId;
    leaveRoom();
    if (roomId) useMessageStore.getState().removeRoomItems(roomId);
  }, [leaveRoom]);

  const invite = useCallback((peer: LobbyPeer) => world.invite(peer), [world]);
  const acceptInvite = useCallback((id: string) => world.accept(id), [world]);
  const declineInvite = useCallback((id: string) => world.decline(id), [world]);
  const unlink = useCallback((id: string) => world.unlink(id), [world]);
  const retryPeer = useCallback((id: string) => mesh.retry(id), [mesh]);

  return {
    joinRoom,
    leaveRoom: leaveRoomWithCleanup,
    deleteRoom,
    rename,
    setVisibility,
    shareText,
    shareFile,
    shareFiles,
    requestFile,
    updateAvatar,
    invite,
    acceptInvite,
    declineInvite,
    unlink,
    retryPeer,
  };
}

function isReachable(id: string): boolean {
  return useRoomStore.getState().peers.some((p) => p.id === id) || isLinked(id);
}

function peerName(id: string): string {
  return (
    useRoomStore.getState().peers.find((p) => p.id === id)?.name ??
    useLobbyStore.getState().links[id]?.name ??
    "a peer"
  );
}
