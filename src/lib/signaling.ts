import type { ClientMessage, ServerMessage } from "../../shared/types";

type Listener = (msg: ServerMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  url: string;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private onDisconnect: (() => void) | null = null;
  // Last join we were asked to make, replayed on every (re)connect so a peer
  // is re-registered after a socket drop — and so a join issued while the
  // socket is still CONNECTING isn't lost.
  private lastJoin: ClientMessage | null = null;
  private wsGen = 0;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
      return;

    const gen = ++this.wsGen;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      if (gen !== this.wsGen) return;
      this._connected = true;
      // Replay the join so the server re-registers us (also delivers the very
      // first join if it was attempted before the socket finished opening).
      if (this.lastJoin) this.ws?.send(JSON.stringify(this.lastJoin));
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as ServerMessage;
        for (const listener of this.listeners) {
          listener(msg);
        }
      } catch {
        // ignore invalid messages
      }
    };

    this.ws.onclose = () => {
      if (gen !== this.wsGen) return;
      this._connected = false;
      this.onDisconnect?.();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    this.wsGen++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.lastJoin = null;
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  /** Close the current connection and open a new one to a different URL.
   *  lastJoin is cleared so a stale room join isn't replayed; the caller
   *  must send a fresh join message after reconnecting. */
  reconnect(url: string) {
    this.disconnect();
    this.url = url;
    this.connect();
  }

  send(msg: ClientMessage) {
    // Track join/leave so we know whether to replay a join on reconnect.
    if (msg.type === "join") this.lastJoin = msg;
    else if (msg.type === "leave") this.lastJoin = null;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOnDisconnect(cb: () => void) {
    this.onDisconnect = cb;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}
