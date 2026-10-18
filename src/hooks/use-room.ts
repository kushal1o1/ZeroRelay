"use client";
import { useMesh } from "@/hooks/use-mesh";
import { useSignaling } from "@/hooks/use-signaling";
import { generateId } from "@/lib/id";
import { AVATAR_MAX_CHARS, parsePeerMessage } from "@/lib/peer-protocol";
import { requestPersistence } from "@/lib/storage";
import { TransferManager } from "@/lib/transfer/manager";
import { saveFile } from "@/lib/transfer/save";
import { clearIncoming } from "@/lib/transfer/sinks";
import { useAvatarStore } from "@/stores/avatar-store";
import { isLinked, useLobbyStore } from "@/stores/lobby-store";
import { useMarkdownPreviewStore } from "@/stores/markdown-preview-store";
import { useMessageStore } from "@/stores/message-store";
import { useRoomStore } from "@/stores/room-store";
import { isRunning, latestReceive, useTransferStore } from "@/stores/transfer-store";
import type {
  AvatarMessage,
  DataMessage,
  ItemType,
  Retention,
  SharedItem,
  TransferPurpose,
} from "@/types/message";
import { useCallback, useEffect, useRef } from "react";
import { type LobbyPeer, NEARBY_ROOM_ID, type ServerMessage } from "../../shared/types";

/**
 * The app's single connection to the network: signaling, the peer mesh, lobby
 * links and file transfers, exposed as plain actions for the UI.
 */
export function useRoom() {
  const peerId = useRoomStore((s) => s.peerId);

  // Filled in below; the callbacks that need them run only after first render.
  const linksRef = useRef<ReturnType<typeof useMesh> | null>(null);
  const transfersRef = useRef<TransferManager | null>(null);

  const onData = useCallback((from: string, data: string) => {
    const msg = parsePeerMessage(data);
    if (!msg) {
      console.warn(`Ignored an invalid message from ${from}`);
      return;
    }
    switch (msg.type) {
      case "share": {
        const item = stampSender(msg.item, from);
        if (item) void useMessageStore.getState().addItem(item);
        break;
      }
      case "file-request":
        transfersRef.current?.serve(from, msg);
        break;
      case "file-error":
        transfersRef.current?.onFileError(from, msg);
        break;
      case "avatar":
        useAvatarStore.getState().setAvatar(from, msg.dataUrl);
        break;
    }
  }, []);

  const msgHandler = useCallback((msg: ServerMessage) => {
    const links = linksRef.current;
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
      // Avatars saved by older versions can be too big for one message.
      if (!myAvatar || myAvatar.length > AVATAR_MAX_CHARS) return;
      const msg: AvatarMessage = { type: "avatar", dataUrl: myAvatar };
      linksRef.current?.mesh.send(targetPeerId, JSON.stringify(msg));
    },
    [peerId],
  );

  const links = useMesh(peerId, {
    sendSignal,
    onData,
    onOpen,
    onChannel: (from, channel) => transfersRef.current?.onChannel(from, channel),
    onLinkState: (id, state) => {
      if (state === null || state === "failed") transfersRef.current?.peerGone(id);
    },
  });
  linksRef.current = links;
  const { mesh, world } = links;

  if (!transfersRef.current) {
    transfersRef.current = new TransferManager({
      mesh,
      ensure: (id) => (isReachable(id) ? mesh.ensure(id) : Promise.resolve(false)),
      inAudience: (id, roomId) => {
        const s = useRoomStore.getState();
        if (s.roomId !== roomId) return false;
        return s.peers.some((p) => p.id === id) || (roomId === NEARBY_ROOM_ID && isLinked(id));
      },
      peerName,
    });
  }
  const transfers = transfersRef.current;

  // Received files from a previous session are only temp copies.
  useEffect(() => {
    void clearIncoming();
  }, []);

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

  // Send a share and echo it into the local feed so the sender sees it
  // immediately (even if no peer is connected yet).
  const dispatchShare = useCallback(
    (item: SharedItem, target?: string | string[]) => {
      const msg: DataMessage = {
        type: "share",
        item,
        targetPeerId: Array.isArray(target) ? undefined : target,
      };
      void useMessageStore.getState().addItem(item);
      void deliver(recipientsFor(target), JSON.stringify(msg)).then((missed) => {
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
      if (retention !== "session") void requestPersistence();
      dispatchShare(newItem({ type, retention, content }), targetPeerId);
    },
    [dispatchShare],
  );

  const shareFile = useCallback(
    (file: File, targetPeerId?: string | string[], retention: Retention = "forever") => {
      const item = newItem({
        type: "file",
        retention,
        fileName: file.name,
        fileSize: file.size,
        mime: file.type,
      });
      if (retention !== "session") void requestPersistence();
      transfers.offer(
        item.id,
        file,
        item.roomId,
        targetPeerId ? recipientsFor(targetPeerId) : null,
      );
      dispatchShare(item, targetPeerId);
    },
    [dispatchShare, transfers],
  );

  const shareFiles = useCallback(
    (files: File[], targetPeerId?: string | string[], retention: Retention = "forever") => {
      for (const file of files) shareFile(file, targetPeerId, retention);
    },
    [shareFile],
  );

  /** Download (or preview) a shared file. Progress lives in the transfer store. */
  const requestFile = useCallback(
    async (item: SharedItem, purpose: TransferPurpose = "download") => {
      if (item.type !== "file") return;
      const ts = useTransferStore.getState();

      if (purpose === "preview") {
        const preview = useMarkdownPreviewStore.getState();
        preview.beginFile(item);
        const own = item.peerId === peerId ? transfers.localFile(item.id) : undefined;
        const blob = own ?? ts.saved[item.id];
        try {
          const text = await (blob ?? (await transfers.request(item, "preview"))).text();
          useMarkdownPreviewStore.getState().setContent(item.id, text);
        } catch {
          useMarkdownPreviewStore.getState().setError(item.id);
        }
        return;
      }

      const saved = ts.saved[item.id];
      if (saved) return saveFile(saved, item.fileName || "download");
      if (isRunning(latestReceive(ts.transfers, item.id))) return;
      try {
        const blob = await transfers.request(item, "download");
        useTransferStore.getState().setSaved(item.id, blob);
        saveFile(blob, item.fileName || "download");
      } catch {
        // The failure reason is on the transfer; the file card shows it.
      }
    },
    [peerId, transfers],
  );

  const cancelTransfer = useCallback((id: string) => transfers.cancel(id), [transfers]);

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
    if (roomId) void useMessageStore.getState().removeRoomItems(roomId);
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
    cancelTransfer,
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

/** Overwrite who-sent-it and which-room from what we know about the sender,
 *  never from the payload. Returns null for senders we have no link with. */
function stampSender(item: SharedItem, from: string): SharedItem | null {
  const room = useRoomStore.getState();
  const member = room.peers.find((p) => p.id === from);
  if (member && room.roomId) {
    return { ...item, peerId: from, peerName: member.name, roomId: room.roomId };
  }
  const link = useLobbyStore.getState().links[from];
  if (link?.status === "linked") {
    return { ...item, peerId: from, peerName: link.name, roomId: NEARBY_ROOM_ID };
  }
  return null;
}

/** Everyone a share goes to: the given targets, or everyone we're connected
 *  to (room members, plus accepted lobby links while in Global). */
function recipientsFor(target?: string | string[]): string[] {
  if (target) return Array.isArray(target) ? target : [target];
  const state = useRoomStore.getState();
  const ids = new Set(state.peers.map((p) => p.id));
  if (state.roomId === NEARBY_ROOM_ID) {
    for (const link of Object.values(useLobbyStore.getState().links)) {
      if (link.status === "linked") ids.add(link.id);
    }
  }
  ids.delete(state.peerId);
  return [...ids];
}

function newItem(fields: Pick<SharedItem, "type" | "retention"> & Partial<SharedItem>): SharedItem {
  const state = useRoomStore.getState();
  return {
    id: generateId(),
    roomId: state.roomId || NEARBY_ROOM_ID,
    peerId: state.peerId,
    peerName: state.name,
    timestamp: Date.now(),
    ...fields,
  };
}
