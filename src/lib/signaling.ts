import type { ClientMessage, ServerMessage } from "../../shared/types";

// One WebSocket to one room's signaling object. Owns reconnection (exponential
// backoff + jitter), the heartbeat, and replaying the join after a reconnect.

const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/** Close codes after which reconnecting would be wrong (see room-do.ts). */
export const CLOSE = {
  replaced: 4409,
  roomDeleted: 4410,
  outdated: 4426,
} as const;
const TERMINAL = new Set<number>(Object.values(CLOSE));

export interface SignalingEvents {
  onMessage: (msg: ServerMessage) => void;
  /** Socket dropped. `terminal` = we will not reconnect on our own. */
  onDisconnect: (code: number, terminal: boolean) => void;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private join: ClientMessage | null = null;
  /** Bumped on every new socket so stale callbacks are ignored. */
  private gen = 0;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private events: SignalingEvents) {}

  /** Connect to `url` (closing any current socket) and join with `join`. */
  open(url: string, join: ClientMessage) {
    this.close();
    this.url = url;
    this.join = join;
    this.attempts = 0;
    this.connect();
  }

  /** Replace the join replayed on reconnect (e.g. swap a password for a token). */
  setJoin(join: ClientMessage) {
    this.join = join;
  }

  close() {
    this.gen++;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Called when the tab becomes visible / the network comes back: verify the
   *  socket right away instead of waiting for the next heartbeat or backoff. */
  wake() {
    if (!this.url) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ping();
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.attempts = 0;
      this.connect();
    }
  }

  private connect() {
    if (!this.url) return;
    const gen = ++this.gen;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.gen) return;
      this.attempts = 0;
      if (this.join) ws.send(JSON.stringify(this.join));
      this.heartbeatTimer = setInterval(() => this.ping(), HEARTBEAT_MS);
    };

    ws.onmessage = (e) => {
      if (gen !== this.gen || typeof e.data !== "string") return;
      if (e.data === "pong") {
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      }
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.events.onMessage(msg);
    };

    ws.onclose = (e) => {
      if (gen !== this.gen) return;
      this.dropped(e.code);
    };

    // An error is always followed by close; nothing to do here.
    ws.onerror = () => {};
  }

  private ping() {
    if (this.ws?.readyState !== WebSocket.OPEN || this.pongTimer) return;
    this.ws.send("ping");
    // No pong in time: the socket is dead even if the browser hasn't noticed.
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      const ws = this.ws;
      this.gen++;
      ws?.close();
      this.dropped(1006);
    }, PONG_TIMEOUT_MS);
  }

  private dropped(code: number) {
    this.clearTimers();
    this.ws = null;
    const terminal = TERMINAL.has(code);
    this.events.onDisconnect(code, terminal);
    if (!terminal) this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempts);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pongTimer = null;
  }
}
