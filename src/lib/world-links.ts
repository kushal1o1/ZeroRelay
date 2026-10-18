import { type WorldLinkStatus, useLobbyStore } from "@/stores/lobby-store";
import type { LobbyPeer, SignalPayload } from "../../shared/types";
import type { LinkState, PeerMesh } from "./peer-mesh";

// Consent flow for connecting with people on other networks. Nothing (not
// even WebRTC candidates, which reveal IP addresses) is exchanged with a
// lobby peer until one side invites and the other accepts.

const INVITE_TIMEOUT_MS = 60_000;
/** How long a "declined" / "unreachable" notice stays visible. */
const NOTICE_MS = 6_000;
/** After we decline someone, their invites are ignored for this long. */
const MUTE_MS = 10 * 60_000;

type SendSignal = (to: string, payload: SignalPayload) => void;

export class WorldLinks {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private muted = new Map<string, number>();

  constructor(
    private readonly mesh: PeerMesh,
    private readonly sendSignal: SendSignal,
  ) {}

  invite(peer: LobbyPeer) {
    const link = this.get(peer.id);
    if (link?.status === "incoming") return this.accept(peer.id);
    if (link?.status === "linked" || link?.status === "outgoing") return;
    this.set(peer.id, peer.name, "outgoing");
    this.sendSignal(peer.id, { kind: "invite" });
    this.after(peer.id, INVITE_TIMEOUT_MS, () => {
      if (this.get(peer.id)?.status === "outgoing") this.notice(peer.id, "unanswered");
    });
  }

  accept(peerId: string) {
    const link = this.get(peerId);
    if (link?.status !== "incoming") return;
    this.clearTimer(peerId);
    this.set(peerId, link.name, "linked");
    // The inviter sends the WebRTC offer once it gets this reply.
    this.sendSignal(peerId, { kind: "invite-reply", accepted: true });
  }

  decline(peerId: string) {
    if (this.get(peerId)?.status !== "incoming") return;
    this.sendSignal(peerId, { kind: "invite-reply", accepted: false });
    this.muted.set(peerId, Date.now() + MUTE_MS);
    this.remove(peerId);
  }

  /** End a link (or cancel a pending invite). */
  unlink(peerId: string) {
    const link = this.get(peerId);
    if (!link) return;
    if (link.status === "linked" || link.status === "outgoing") {
      this.sendSignal(peerId, { kind: "bye" });
    }
    this.mesh.disconnect(peerId);
    this.remove(peerId);
  }

  /** Forget every link (we left the Global room, so they can't be signaled). */
  reset() {
    for (const id of Object.keys(useLobbyStore.getState().links)) this.mesh.disconnect(id);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    useLobbyStore.getState().clear();
  }

  /** A signal relayed to us from another network. */
  onSignal(from: string, fromPeer: LobbyPeer | undefined, payload: SignalPayload) {
    const link = this.get(from);
    switch (payload.kind) {
      case "invite": {
        if ((this.muted.get(from) ?? 0) > Date.now()) return;
        if (link?.status === "linked") {
          // They lost their side (e.g. reloaded): start over, already agreed.
          this.mesh.disconnect(from);
          this.sendSignal(from, { kind: "invite-reply", accepted: true });
          return;
        }
        if (link?.status === "outgoing") {
          // We invited each other: that's consent from both sides.
          this.clearTimer(from);
          this.set(from, link.name, "linked");
          this.sendSignal(from, { kind: "invite-reply", accepted: true });
          this.mesh.connect(from);
          return;
        }
        this.set(from, fromPeer?.name ?? "Someone", "incoming");
        this.after(from, INVITE_TIMEOUT_MS, () => {
          if (this.get(from)?.status === "incoming") this.remove(from);
        });
        return;
      }
      case "invite-reply":
        if (link?.status !== "outgoing") return;
        this.clearTimer(from);
        if (!payload.accepted) return this.notice(from, "declined");
        this.set(from, link.name, "linked");
        this.mesh.connect(from, true);
        return;
      case "bye":
        if (!link) return;
        this.mesh.disconnect(from);
        this.remove(from);
        return;
      default:
        // WebRTC negotiation is only accepted from agreed links.
        if (link?.status === "linked") this.mesh.handleSignal(from, payload);
    }
  }

  /** The signaling server couldn't deliver to this peer (offline / hidden). */
  onUnreachable(peerId: string) {
    const link = this.get(peerId);
    if (link?.status !== "outgoing" && link?.status !== "linked") return;
    this.mesh.disconnect(peerId);
    this.notice(peerId, "unreachable");
  }

  /** Mirror direct-link failures into the lobby state. */
  onLinkState(peerId: string, state: LinkState | null) {
    if (state === "failed" && this.get(peerId)?.status === "linked") {
      this.mesh.disconnect(peerId);
      this.notice(peerId, "failed");
    }
  }

  // ── helpers ──

  private get(id: string) {
    return useLobbyStore.getState().links[id];
  }

  private set(id: string, name: string, status: WorldLinkStatus) {
    useLobbyStore.getState().setLink(id, name, status);
  }

  private remove(id: string) {
    this.clearTimer(id);
    useLobbyStore.getState().removeLink(id);
  }

  private notice(id: string, status: WorldLinkStatus) {
    const name = this.get(id)?.name ?? "Someone";
    this.set(id, name, status);
    this.after(id, NOTICE_MS, () => {
      if (this.get(id)?.status === status) this.remove(id);
    });
  }

  private after(id: string, ms: number, fn: () => void) {
    this.clearTimer(id);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        fn();
      }, ms),
    );
  }

  private clearTimer(id: string) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }
}
