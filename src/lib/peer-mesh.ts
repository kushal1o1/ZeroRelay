import type { ICECandidate, SDP, SignalPayload } from "../../shared/types";

// Owns every WebRTC link of this device. Framework-free: the React layer feeds
// it signals and decides *which* peers to link; this class handles *how*
// (offers, glare, ICE restart, redials, waiting for a channel to open).

export type LinkState = "connecting" | "connected" | "failed";

export interface MeshEvents {
  /** Send a signaling payload to a peer (via the signaling server). */
  signal: (to: string, payload: SignalPayload) => void;
  data: (from: string, data: string) => void;
  /** The main data channel to this peer just opened. */
  open: (peerId: string) => void;
  /** The peer opened an extra channel (anything not labeled "data"). */
  channel: (peerId: string, channel: RTCDataChannel) => void;
  /** Link state changed; `null` means the link is gone. */
  state: (peerId: string, state: LinkState | null) => void;
  /** Whether we still want a link to this peer (drives automatic redials). */
  wanted: (peerId: string) => boolean;
}

interface Link {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  /** We sent the first offer; the offerer drives ICE restarts and redials. */
  offerer: boolean;
}

const MAIN_CHANNEL = "data";
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
const CONNECT_TIMEOUT_MS = 20_000;
const MAX_REDIALS = 3;
/** How long the answering side waits for the offerer to redial. */
const REDIAL_GRACE_MS = 8_000;

export class PeerMesh {
  private links = new Map<string, Link>();
  /** Callers of ensure(), per peer. They outlive individual links, so a send
   *  made while a link is being redialed waits for the redial. */
  private waiters = new Map<string, Set<(ok: boolean) => void>>();
  private redials = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly selfId: string,
    private readonly events: MeshEvents,
  ) {}

  has(peerId: string): boolean {
    return this.links.has(peerId);
  }

  isOpen(peerId: string): boolean {
    return this.links.get(peerId)?.channel?.readyState === "open";
  }

  /** Peers with an open data channel. */
  openPeers(): string[] {
    return [...this.links.keys()].filter((id) => this.isOpen(id));
  }

  /** Link to a peer. Without `initiate`, the lower id sends the offer and the
   *  other side waits for it, so both sides can call this safely. */
  connect(peerId: string, initiate = false) {
    if (peerId === this.selfId || this.links.has(peerId)) return;
    if (initiate || this.selfId < peerId) this.offer(peerId);
  }

  /** Resolve once a data channel to `peerId` is open, dialing if needed. */
  ensure(peerId: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<boolean> {
    if (peerId === this.selfId) return Promise.resolve(false);
    if (this.isOpen(peerId)) return Promise.resolve(true);
    // Dial unless a link or a scheduled redial is already on its way.
    if (!this.links.has(peerId) && !this.timers.has(peerId)) this.offer(peerId);
    return new Promise((resolve) => {
      const set = this.waiters.get(peerId) ?? new Set();
      this.waiters.set(peerId, set);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        set.delete(done);
        resolve(ok);
      };
      const timer = setTimeout(() => {
        done(false);
        // Gave up waiting: don't leave a half-open link behind.
        const link = this.links.get(peerId);
        if (link && !this.isOpen(peerId) && !this.events.wanted(peerId)) this.disconnect(peerId);
      }, timeoutMs);
      set.add(done);
    });
  }

  /** Drop any current link and dial again from scratch. */
  retry(peerId: string) {
    this.redials.delete(peerId);
    this.drop(peerId);
    this.offer(peerId);
  }

  disconnect(peerId: string) {
    this.redials.delete(peerId);
    this.clearTimer(peerId);
    this.drop(peerId);
    this.settle(peerId, false);
    this.events.state(peerId, null);
  }

  disconnectAll() {
    for (const id of [...this.links.keys(), ...this.waiters.keys()]) this.disconnect(id);
    for (const id of [...this.timers.keys()]) this.clearTimer(id);
  }

  send(peerId: string, data: string): boolean {
    const channel = this.links.get(peerId)?.channel;
    if (channel?.readyState !== "open") return false;
    try {
      channel.send(data);
      return true;
    } catch (err) {
      console.warn(`Send to ${peerId} failed`, err);
      return false;
    }
  }

  /** Open an extra channel (e.g. for one file transfer) on an open link. */
  openChannel(peerId: string, label: string): RTCDataChannel | null {
    if (!this.isOpen(peerId)) return null;
    return this.links.get(peerId)?.pc.createDataChannel(label) ?? null;
  }

  /** Largest message the link accepts, if the browser reports it. */
  maxMessageSize(peerId: string): number | undefined {
    return this.links.get(peerId)?.pc.sctp?.maxMessageSize || undefined;
  }

  /** Re-check links after the device wakes up or the network changes. */
  wake() {
    for (const [id, link] of this.links) {
      const st = link.pc.connectionState;
      if (st === "failed" || st === "closed") this.fail(id, link);
      else if (st === "disconnected" && link.offerer) void this.restartIce(id, link);
    }
  }

  handleSignal(from: string, payload: SignalPayload) {
    switch (payload.kind) {
      case "offer":
        return void this.handleOffer(from, payload.sdp);
      case "answer":
        return void this.handleAnswer(from, payload.sdp);
      case "ice":
        return this.handleIce(from, payload.candidate);
    }
  }

  // ── Link lifecycle ──

  private createLink(peerId: string, offerer: boolean): Link {
    this.clearTimer(peerId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: Link = { pc, channel: null, pendingIce: [], offerer };
    this.links.set(peerId, link);

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.events.signal(peerId, {
        kind: "ice",
        candidate: {
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
          usernameFragment: e.candidate.usernameFragment,
        },
      });
    };
    pc.ondatachannel = (e) => {
      if (e.channel.label === MAIN_CHANNEL) this.attachChannel(peerId, link, e.channel);
      else this.events.channel(peerId, e.channel);
    };
    // The offerer repairs a broken path in place, keeping the data channel.
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" && link.offerer) void this.restartIce(peerId, link);
    };
    pc.onconnectionstatechange = () => {
      if (this.links.get(peerId) !== link) return;
      if (pc.connectionState === "failed") this.fail(peerId, link);
      else if (pc.connectionState === "closed") this.disconnect(peerId);
    };

    this.events.state(peerId, "connecting");
    return link;
  }

  private attachChannel(peerId: string, link: Link, channel: RTCDataChannel) {
    link.channel = channel;
    channel.onmessage = (e) => {
      if (typeof e.data === "string") this.events.data(peerId, e.data);
    };
    channel.onopen = () => {
      if (link.channel !== channel) return;
      this.redials.delete(peerId);
      this.events.state(peerId, "connected");
      this.events.open(peerId);
      this.settle(peerId, true);
    };
    channel.onclose = () => {
      if (this.links.get(peerId) === link && link.channel === channel) this.fail(peerId, link);
    };
  }

  /** Create a link as the offerer and send the offer. */
  private offer(peerId: string): Link | null {
    if (peerId === this.selfId) return null;
    const link = this.createLink(peerId, true);
    this.attachChannel(peerId, link, link.pc.createDataChannel(MAIN_CHANNEL));
    void (async () => {
      try {
        await link.pc.setLocalDescription(await link.pc.createOffer());
        this.sendDescription(peerId, link, "offer");
      } catch (err) {
        console.warn(`Offer to ${peerId} failed`, err);
        this.fail(peerId, link);
      }
    })();
    return link;
  }

  private async restartIce(peerId: string, link: Link) {
    if (link.pc.signalingState !== "stable") return;
    try {
      await link.pc.setLocalDescription(await link.pc.createOffer({ iceRestart: true }));
      this.sendDescription(peerId, link, "offer");
    } catch (err) {
      console.warn(`ICE restart for ${peerId} failed`, err);
    }
  }

  /** A link died: redial if we're the offerer and still want it, else report. */
  private fail(peerId: string, link: Link) {
    if (this.links.get(peerId) !== link) return;
    this.drop(peerId);
    if (!this.events.wanted(peerId)) {
      this.settle(peerId, false);
      this.events.state(peerId, null);
      return;
    }
    const attempts = this.redials.get(peerId) ?? 0;
    if (attempts >= MAX_REDIALS) {
      this.redials.delete(peerId);
      this.settle(peerId, false);
      this.events.state(peerId, "failed");
      return;
    }
    this.redials.set(peerId, attempts + 1);
    this.events.state(peerId, "connecting");
    if (link.offerer) {
      this.setTimer(peerId, 1000 * (attempts + 1), () => {
        if (this.events.wanted(peerId) && !this.links.has(peerId)) this.offer(peerId);
      });
    } else {
      // The other side redials; if nothing arrives, give up visibly.
      this.setTimer(peerId, REDIAL_GRACE_MS * (attempts + 1), () => {
        if (this.links.has(peerId)) return;
        this.settle(peerId, false);
        this.events.state(peerId, "failed");
      });
    }
  }

  /** Close a link without emitting state. Returns whether one existed. */
  private drop(peerId: string): boolean {
    const link = this.links.get(peerId);
    if (!link) return false;
    this.links.delete(peerId);
    const { pc, channel } = link;
    pc.onicecandidate = null;
    pc.ondatachannel = null;
    pc.oniceconnectionstatechange = null;
    pc.onconnectionstatechange = null;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onmessage = null;
      channel.close();
    }
    pc.close();
    return true;
  }

  /** Resolve everyone waiting in ensure() for this peer. */
  private settle(peerId: string, ok: boolean) {
    const set = this.waiters.get(peerId);
    if (!set) return;
    this.waiters.delete(peerId);
    for (const w of [...set]) w(ok);
  }

  // ── Signal handling ──

  private async handleOffer(from: string, sdp: SDP) {
    if (from === this.selfId) return;
    let link = this.links.get(from);
    if (!link) link = this.createLink(from, false);

    // Both sides offered at once: the lower id wins, the other rolls back.
    if (link.pc.signalingState === "have-local-offer") {
      if (this.selfId < from) return;
      try {
        await link.pc.setLocalDescription({ type: "rollback" });
        link.offerer = false;
      } catch (err) {
        console.warn(`Rollback for ${from} failed`, err);
        return;
      }
    } else if (link.pc.signalingState !== "stable") {
      return;
    }

    try {
      await link.pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      this.flushIce(link);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      this.sendDescription(from, link, "answer");
    } catch (err) {
      console.warn(`Answering ${from} failed`, err);
    }
  }

  private async handleAnswer(from: string, sdp: SDP) {
    const link = this.links.get(from);
    if (!link || link.pc.signalingState !== "have-local-offer") return;
    try {
      await link.pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      this.flushIce(link);
    } catch (err) {
      console.warn(`Answer from ${from} failed`, err);
    }
  }

  private handleIce(from: string, candidate: ICECandidate) {
    const link = this.links.get(from);
    if (!link) return;
    if (!link.pc.remoteDescription) {
      link.pendingIce.push(candidate);
      return;
    }
    link.pc.addIceCandidate(candidate).catch(() => {});
  }

  private flushIce(link: Link) {
    for (const c of link.pendingIce) link.pc.addIceCandidate(c).catch(() => {});
    link.pendingIce = [];
  }

  private sendDescription(peerId: string, link: Link, kind: "offer" | "answer") {
    const local = link.pc.localDescription;
    if (!local || this.links.get(peerId) !== link) return;
    this.events.signal(peerId, { kind, sdp: { type: local.type, sdp: local.sdp } });
  }

  private setTimer(peerId: string, ms: number, fn: () => void) {
    this.clearTimer(peerId);
    this.timers.set(
      peerId,
      setTimeout(() => {
        this.timers.delete(peerId);
        fn();
      }, ms),
    );
  }

  private clearTimer(peerId: string) {
    const t = this.timers.get(peerId);
    if (t) clearTimeout(t);
    this.timers.delete(peerId);
  }
}
