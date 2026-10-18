import { DurableObject } from "cloudflare:workers";
import {
  type ClientMessage,
  type ErrorCode,
  LIMITS,
  NEARBY_ROOM_ID,
  PROTOCOL_VERSION,
  type Peer,
  type RoomInfo,
  type ServerMessage,
  derivePeerId,
} from "../../../shared/types";
import { hashPassword, hmac, randomHex, safeEqual, sha256 } from "./auth";
import { type Env, HEADER, type RoomKind, WORLD_OBJECT_NAME, nearbyObjectName } from "./env";
import { parseClientMessage } from "./validate";
import type { DirectoryEntry } from "./world-do";

// One instance per room. Two kinds share this class:
//  - nearby:  one per network (public IP), no password, nothing persisted.
//  - private: one per room code, metadata + password hash in storage.
//
// Uses the WebSocket Hibernation API: the object can be evicted between
// messages, so all per-socket state lives in the socket attachment and the
// peer list is always derived from `ctx.getWebSockets()`.

/** Heartbeat sweep interval. Clients send "ping" every 25s (auto-answered). */
const SWEEP_MS = 30_000;
const STALE_MS = 75_000;
/** Sockets that never send a valid join are closed after this. */
const JOIN_TIMEOUT_MS = 30_000;
/** A private room is deleted after being empty this long. */
const ROOM_TTL_MS = 24 * 60 * 60_000;
const AUTH_WINDOW_MS = 10 * 60_000;
const AUTH_MAX_FAILURES = 5;
const WORLD_SIGNALS_PER_MIN = 120;

interface Attachment {
  kind: RoomKind;
  roomId: string;
  netKey: string;
  connectedAt: number;
  /** Set once the socket has successfully joined. */
  peer?: Peer;
  /** Listed in the worldwide lobby (Nearby room only). */
  visible?: boolean;
}

interface Session {
  ws: WebSocket;
  att: Attachment & { peer: Peer };
}

interface RoomMeta {
  name: string;
  createdAt: number;
  salt: string;
  passwordHash: string | null;
  /** HMAC key for join tokens. */
  secret: string;
  ownerHash: string;
  emptySince: number | null;
}

interface AuthFailures {
  count: number;
  resetAt: number;
}

type JoinMessage = Extract<ClientMessage, { type: "join" }>;

interface Admission {
  room: RoomInfo;
  joinToken?: string;
  ownerToken?: string;
}

export class RoomDO extends DurableObject<Env> {
  /** Soft, in-memory rate limit for cross-network signals (reset on eviction). */
  private worldBudget = new Map<string, { count: number; resetAt: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answered by the runtime without waking the object; the timestamp of the
    // last auto-response doubles as the heartbeat for the stale sweep.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const kind = request.headers.get(HEADER.kind) as RoomKind | null;
    const roomId = request.headers.get(HEADER.room);
    const netKey = request.headers.get(HEADER.net);
    if (!kind || !roomId || !netKey) return new Response("Bad routing", { status: 400 });

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      kind,
      roomId,
      netKey,
      connectedAt: Date.now(),
    } satisfies Attachment);
    await this.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation handlers ──

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > LIMITS.frameBytes) {
      return this.fail(ws, "invalid", "Message must be text and under 64 KB");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      return this.fail(ws, "invalid", "Invalid JSON");
    }
    const msg = parseClientMessage(raw);
    if (!msg) return this.fail(ws, "invalid", "Malformed message");

    const att = ws.deserializeAttachment() as Attachment;
    if (msg.type === "join") return this.join(ws, att, msg);
    if (!att.peer) return this.fail(ws, "forbidden", "Join the room first");

    const session: Session = { ws, att: att as Session["att"] };
    switch (msg.type) {
      case "rename":
        return this.rename(session, msg.name);
      case "visibility":
        return this.setVisibility(session, msg.visibility === "world");
      case "leave":
        await this.drop(session, { code: 1000, reason: "left" });
        return this.settle();
      case "delete-room":
        return this.deleteRoom(session, msg.ownerToken);
      case "signal":
        return this.signal(session, msg.to, msg.payload);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.release(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.release(ws);
  }

  async alarm(): Promise<void> {
    const now = Date.now();

    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      if (!att.peer) {
        if (now - att.connectedAt > JOIN_TIMEOUT_MS) closeQuietly(ws, 4408, "join timeout");
        continue;
      }
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? att.peer.joinedAt;
      if (now - last > STALE_MS) {
        await this.drop({ ws, att: att as Session["att"] }, { code: 4408, reason: "heartbeat" });
      }
    }

    const live = this.sessions();
    if (live.length > 0) {
      // Keep our lobby entries fresh so the directory can prune dead rooms.
      const visible = live.filter((s) => s.att.visible).map((s) => directoryEntry(s.att));
      if (visible.length > 0) await this.world().upsert(visible).catch(logError("world upsert"));
      await this.ctx.storage.setAlarm(now + SWEEP_MS);
      return;
    }

    const meta = await this.ctx.storage.get<RoomMeta>("meta");
    if (meta?.emptySince && now - meta.emptySince >= ROOM_TTL_MS) {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.settle();
  }

  // ── RPC (called by other RoomDOs) ──

  /** Deliver a cross-network signal to a lobby-visible peer in this room. */
  async deliver(peerId: string, msg: ServerMessage): Promise<boolean> {
    const target = this.find(peerId);
    if (!target?.att.visible) return false;
    send(target.ws, msg);
    return true;
  }

  // ── Message handlers ──

  private async join(ws: WebSocket, att: Attachment, msg: JoinMessage): Promise<void> {
    if (att.peer) return this.fail(ws, "invalid", "Already joined");
    if (msg.v !== PROTOCOL_VERSION) {
      this.fail(ws, "outdated", "ZeroRelay was updated. Please refresh the page.");
      closeQuietly(ws, 4426, "outdated");
      return;
    }

    const peerId = derivePeerId(msg.secret);
    const admission =
      att.kind === "nearby"
        ? { room: { id: NEARBY_ROOM_ID, name: "Global", hasPassword: false, nearby: true } }
        : await this.admitPrivate(ws, att, msg, peerId);
    if (!admission) return;

    const others = this.sessions().filter((s) => s.att.peer.id !== peerId);
    const cap = att.kind === "nearby" ? LIMITS.nearbyPeers : LIMITS.roomPeers;
    if (others.length >= cap) return this.fail(ws, "full", `Room is full (${cap} peers max)`);

    // Same identity on another socket (reload, second tab): newest wins.
    for (const s of this.sessions()) {
      if (s.att.peer.id === peerId && s.ws !== ws) {
        await this.drop(s, { code: 4409, reason: "replaced" });
      }
    }

    const peer: Peer = {
      id: peerId,
      name: msg.name,
      joinedAt: Date.now(),
      // Per-room tag so network identity can't be correlated across rooms.
      net: (await sha256(`${att.roomId}|${att.netKey}`)).slice(0, 12),
    };
    const joined: Session["att"] = {
      ...att,
      peer,
      visible: att.kind === "nearby" && msg.visibility !== "hidden",
    };
    ws.serializeAttachment(joined);

    send(ws, {
      type: "joined",
      self: peer,
      peers: others.map((s) => s.att.peer),
      ...admission,
    });
    this.broadcast({ type: "peer-joined", peer }, peerId);
    if (joined.visible) {
      await this.world().upsert([directoryEntry(joined)]).catch(logError("world upsert"));
    }
    await this.ensureSweep();
  }

  private async admitPrivate(
    ws: WebSocket,
    att: Attachment,
    msg: JoinMessage,
    peerId: string,
  ): Promise<Admission | null> {
    const meta = await this.ctx.storage.get<RoomMeta>("meta");
    const joinToken = (m: RoomMeta) => hmac(m.secret, `join:${peerId}`);

    if (msg.create) {
      if (meta) {
        this.fail(ws, "exists", "A room with this code already exists");
        return null;
      }
      const salt = randomHex(16);
      const ownerToken = randomHex(24);
      const created: RoomMeta = {
        name: msg.create.name,
        createdAt: Date.now(),
        salt,
        passwordHash: msg.create.password ? await hashPassword(msg.create.password, salt) : null,
        secret: randomHex(32),
        ownerHash: await sha256(ownerToken),
        emptySince: null,
      };
      await this.ctx.storage.put("meta", created);
      return { room: roomInfo(att.roomId, created), joinToken: await joinToken(created), ownerToken };
    }

    if (!meta) {
      this.fail(ws, "not-found", "Room not found. It may have expired or been deleted.");
      return null;
    }
    const failuresKey = `auth:${att.netKey}`;
    const failures = await this.ctx.storage.get<AuthFailures>(failuresKey);
    if (failures && failures.count >= AUTH_MAX_FAILURES && Date.now() < failures.resetAt) {
      this.fail(ws, "rate-limited", "Too many wrong passwords. Try again in a few minutes.");
      return null;
    }

    const tokenOk = !!msg.token && safeEqual(msg.token, await joinToken(meta));
    const passwordOk =
      !meta.passwordHash ||
      (!!msg.password && safeEqual(await hashPassword(msg.password, meta.salt), meta.passwordHash));
    if (!tokenOk && !passwordOk) {
      const fresh = !failures || Date.now() >= failures.resetAt;
      await this.ctx.storage.put<AuthFailures>(failuresKey, {
        count: fresh ? 1 : failures.count + 1,
        resetAt: fresh ? Date.now() + AUTH_WINDOW_MS : failures.resetAt,
      });
      this.fail(ws, "bad-auth", msg.password ? "Wrong password" : "This room needs a password");
      return null;
    }

    if (meta.emptySince !== null) {
      meta.emptySince = null;
      await this.ctx.storage.put("meta", meta);
    }
    return { room: roomInfo(att.roomId, meta), joinToken: await joinToken(meta) };
  }

  private async rename(session: Session, name: string): Promise<void> {
    const att = { ...session.att, peer: { ...session.att.peer, name } };
    session.ws.serializeAttachment(att);
    this.broadcast({ type: "peer-updated", peer: att.peer });
    if (att.visible) {
      await this.world().upsert([directoryEntry(att)]).catch(logError("world upsert"));
    }
  }

  private async setVisibility(session: Session, visible: boolean): Promise<void> {
    if (session.att.kind !== "nearby" || session.att.visible === visible) return;
    const att = { ...session.att, visible };
    session.ws.serializeAttachment(att);
    const world = this.world();
    await (visible ? world.upsert([directoryEntry(att)]) : world.remove(att.peer.id)).catch(
      logError("world visibility"),
    );
  }

  private async deleteRoom(session: Session, ownerToken: string): Promise<void> {
    const meta = await this.ctx.storage.get<RoomMeta>("meta");
    if (session.att.kind !== "private" || !meta) {
      return this.fail(session.ws, "forbidden", "This room can't be deleted");
    }
    if (!safeEqual(await sha256(ownerToken), meta.ownerHash)) {
      return this.fail(session.ws, "forbidden", "Only the room creator can delete it");
    }
    for (const ws of this.ctx.getWebSockets()) {
      send(ws, { type: "room-deleted", roomId: session.att.roomId });
      ws.serializeAttachment({ ...(ws.deserializeAttachment() as Attachment), peer: undefined });
      closeQuietly(ws, 4410, "room deleted");
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async signal(
    session: Session,
    to: string,
    payload: Extract<ClientMessage, { type: "signal" }>["payload"],
  ): Promise<void> {
    const from = session.att.peer;
    const local = this.find(to);
    if (local) {
      send(local.ws, { type: "signal", from: from.id, payload, via: "room" });
      return;
    }

    // Cross-network: only lobby-visible Nearby peers can reach (and be reached).
    if (session.att.kind !== "nearby" || !session.att.visible) {
      return this.fail(session.ws, "unreachable", "Peer is not in this room", to);
    }
    if (!this.takeWorldBudget(from.id)) {
      return this.fail(session.ws, "rate-limited", "Too many requests to other networks", to);
    }
    const net = await this.world().lookup(to);
    const delivered =
      net !== null &&
      (await this.env.ROOM_DO.get(this.env.ROOM_DO.idFromName(nearbyObjectName(net)))
        .deliver(to, {
          type: "signal",
          from: from.id,
          fromPeer: { id: from.id, name: from.name },
          payload,
          via: "world",
        })
        .catch(() => false));
    if (!delivered) this.fail(session.ws, "unreachable", "Peer is offline or unreachable", to);
  }

  // ── Session bookkeeping ──

  private sessions(): Session[] {
    const out: Session[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.peer) out.push({ ws, att: att as Session["att"] });
    }
    return out;
  }

  private find(peerId: string): Session | undefined {
    return this.sessions().find((s) => s.att.peer.id === peerId);
  }

  /** Remove a joined socket from the room (optionally closing it). */
  private async drop(session: Session, close?: { code: number; reason: string }): Promise<void> {
    const { peer, visible } = session.att;
    // Clear first so this socket is no longer counted as a session.
    session.ws.serializeAttachment({ ...session.att, peer: undefined, visible: undefined });
    if (close) closeQuietly(session.ws, close.code, close.reason);
    this.broadcast({ type: "peer-left", peerId: peer.id });
    if (visible) await this.world().remove(peer.id).catch(logError("world remove"));
  }

  private async release(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.peer) await this.drop({ ws, att: att as Session["att"] });
    closeQuietly(ws, 1000, "closed");
    await this.settle();
  }

  /** Pick the right alarm for the current occupancy. */
  private async settle(): Promise<void> {
    if (this.sessions().length > 0) return this.ensureSweep();
    const meta = await this.ctx.storage.get<RoomMeta>("meta");
    if (!meta) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (meta.emptySince === null) {
      meta.emptySince = Date.now();
      await this.ctx.storage.put("meta", meta);
    }
    await this.ctx.storage.setAlarm(meta.emptySince + ROOM_TTL_MS);
  }

  private async ensureSweep(): Promise<void> {
    const at = await this.ctx.storage.getAlarm();
    const due = Date.now() + SWEEP_MS;
    if (at === null || at > due) await this.ctx.storage.setAlarm(due);
  }

  private takeWorldBudget(peerId: string): boolean {
    const now = Date.now();
    const b = this.worldBudget.get(peerId);
    if (!b || now >= b.resetAt) {
      this.worldBudget.set(peerId, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    b.count++;
    return b.count <= WORLD_SIGNALS_PER_MIN;
  }

  private world() {
    return this.env.WORLD_DO.get(this.env.WORLD_DO.idFromName(WORLD_OBJECT_NAME));
  }

  private broadcast(msg: ServerMessage, exceptPeerId?: string) {
    const data = JSON.stringify(msg);
    for (const s of this.sessions()) {
      if (s.att.peer.id !== exceptPeerId) sendRaw(s.ws, data);
    }
  }

  private fail(ws: WebSocket, code: ErrorCode, message: string, peerId?: string) {
    send(ws, { type: "error", code, message, peerId });
  }
}

function roomInfo(id: string, meta: RoomMeta): RoomInfo {
  return { id, name: meta.name, hasPassword: meta.passwordHash !== null, nearby: false };
}

function directoryEntry(att: Session["att"]): DirectoryEntry {
  return { id: att.peer.id, name: att.peer.name, netKey: att.netKey };
}

function send(ws: WebSocket, msg: ServerMessage) {
  sendRaw(ws, JSON.stringify(msg));
}

function sendRaw(ws: WebSocket, data: string) {
  try {
    ws.send(data);
  } catch {
    // Socket already closing; its close handler cleans up.
  }
}

function closeQuietly(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

const logError = (what: string) => (err: unknown) => console.error(`${what} failed`, err);
