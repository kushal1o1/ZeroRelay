import type { ClientMessage, Peer, ServerMessage } from "../../../shared/types";

interface Connection {
  ws: WebSocket;
  peer: Peer;
}

export class RoomDO implements DurableObject {
  private storage: DurableObjectStorage;
  private connections = new Map<string, Connection>();
  private password: string | null = null;

  constructor(ctx: DurableObjectState) {
    this.storage = ctx.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    server.addEventListener("message", (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      try {
        const data = JSON.parse(e.data) as ClientMessage;
        this.handleMessage(server, data);
      } catch {
        this.send(server, { type: "error", message: "Invalid message" });
      }
    });

    server.addEventListener("close", () => this.handleDisconnect(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleMessage(ws: WebSocket, msg: ClientMessage) {
    switch (msg.type) {
      case "join":
        this.handleJoin(ws, msg);
        break;
      case "leave":
        this.handleLeave(msg);
        break;
      case "delete-room":
        this.handleDeleteRoom(msg);
        break;
      case "rename":
        this.handleRename(msg);
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relay(msg);
        break;
    }
  }

  private handleJoin(ws: WebSocket, msg: ClientMessage & { type: "join" }) {
    if (this.password && msg.password !== this.password) {
      this.send(ws, { type: "error", message: "Invalid password" });
      return;
    }

    if (this.connections.size === 0 && msg.password) {
      this.password = msg.password;
    }

    // Reconnect / takeover: if this peer id already has a (stale) socket,
    // drop it and let the new socket replace it rather than rejecting the
    // rejoin with "Peer ID already taken".
    const existing = this.connections.get(msg.peerId);
    if (existing && existing.ws !== ws) {
      try {
        existing.ws.close();
      } catch {
        /* already closed */
      }
      this.connections.delete(msg.peerId);
    }

    const peer: Peer = { id: msg.peerId, name: msg.name, joinedAt: Date.now() };
    this.connections.set(msg.peerId, { ws, peer });

    this.send(ws, {
      type: "joined",
      peerId: msg.peerId,
      peers: Array.from(this.connections.values()).map((c) => c.peer),
    });

    this.broadcast({ type: "peer-joined", peer }, msg.peerId);
    this.broadcastPresence();
  }

  private handleLeave(msg: ClientMessage & { type: "leave" }) {
    this.connections.delete(msg.peerId);
    this.broadcast({ type: "peer-left", peerId: msg.peerId });
    this.broadcastPresence();
  }

  private handleDeleteRoom(msg: ClientMessage & { type: "delete-room" }) {
    // Notify every connected peer (including the sender) that the room is gone.
    // Do NOT close connections here – ws.close() drops pending sends.
    // Each client tears down its own WebSocket when it processes "room-deleted".
    for (const [_, conn] of this.connections) {
      this.send(conn.ws, { type: "room-deleted", roomId: msg.roomId });
    }
    this.connections.clear();
  }

  private handleRename(msg: ClientMessage & { type: "rename" }) {
    const conn = this.connections.get(msg.peerId);
    if (!conn) return;
    conn.peer.name = msg.name;
    this.broadcast({ type: "peer-renamed", peerId: msg.peerId, name: msg.name });
    this.broadcastPresence();
  }

  private relay(msg: ClientMessage & { type: "offer" | "answer" | "ice-candidate" }) {
    const target = this.connections.get(msg.to);
    if (!target) return;

    const { roomId: _, to: _to, ...rest } = msg;
    this.send(target.ws, { ...rest, from: msg.from } as ServerMessage);
  }

  private handleDisconnect(ws: WebSocket) {
    for (const [peerId, conn] of this.connections) {
      if (conn.ws === ws) {
        this.connections.delete(peerId);
        this.broadcast({ type: "peer-left", peerId });
        this.broadcastPresence();
        break;
      }
    }
  }

  private broadcastPresence() {
    this.broadcast({
      type: "presence",
      peers: Array.from(this.connections.values()).map((c) => c.peer),
    });
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* connection closed */
    }
  }

  private broadcast(msg: ServerMessage, excludePeerId?: string) {
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludePeerId) {
        this.send(conn.ws, msg);
      }
    }
  }
}
