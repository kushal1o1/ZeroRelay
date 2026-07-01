import type { ClientMessage, ServerMessage } from "../../shared/types";

type Listener = (msg: ServerMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private onDisconnect: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  get connected() {
    return this._connected;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
      return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._connected = true;
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
      this._connected = false;
      this.onDisconnect?.();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.listeners.clear();
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  send(msg: ClientMessage) {
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
