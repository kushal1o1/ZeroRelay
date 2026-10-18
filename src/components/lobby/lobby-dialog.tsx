"use client";

import { useRoomContext } from "@/components/room-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchLobby } from "@/lib/lobby";
import { type WorldLink, useLobbyStore } from "@/stores/lobby-store";
import { useUIStore } from "@/stores/ui-store";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LobbyPeer } from "../../../shared/types";

const SEARCH_DEBOUNCE_MS = 300;

/** Header button that opens the lobby; shows how many lobby links are live. */
export function LobbyButton() {
  const setOpen = useLobbyStore((s) => s.setOpen);
  const linked = useLobbyStore(
    (s) => Object.values(s.links).filter((l) => l.status === "linked").length,
  );
  const pending = useLobbyStore((s) => Object.values(s.links).some((l) => l.status === "incoming"));

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title="People on other networks"
      aria-label="People on other networks"
      className="relative flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
    >
      <span aria-hidden>🌐</span>
      <span className="hidden sm:inline">Everyone</span>
      {linked > 0 && <b className="text-accent">{linked}</b>}
      {pending && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-accent" />
      )}
    </button>
  );
}

interface PageState {
  total: number;
  peers: LobbyPeer[];
  next: string | null;
}

/** Browse and invite people on other networks who chose to be visible. */
export function LobbyDialog() {
  const open = useLobbyStore((s) => s.open);
  const setOpen = useLobbyStore((s) => s.setOpen);
  const links = useLobbyStore((s) => s.links);
  const visible = useUIStore((s) => s.visibility === "world");
  const { invite, acceptInvite, unlink } = useRoomContext();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState<PageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (q: string, cursor: string | null) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const res = await fetchLobby(q, cursor);
      if (id !== requestId.current) return;
      setPage((prev) => (cursor && prev ? { ...res, peers: [...prev.peers, ...res.peers] } : res));
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // (Re)load from the start whenever the dialog opens or the search changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(query.trim(), null), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [open, query, load]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setPage(null);
  };

  return (
    <Dialog open={open} onClose={close} title="Everyone">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          People on other networks who chose to be visible. Nothing is shared until they accept your
          invite, then you connect directly, browser to browser.
        </p>

        {!visible && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
            You're hidden from other networks, so you can't invite anyone. Turn on "Show me to
            people on other networks" in your profile.
          </p>
        )}

        <Input
          id="lobby-search"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {error && (
            <div className="flex items-center justify-between py-4 text-sm text-muted-foreground">
              <span>Couldn't load the lobby.</span>
              <Button variant="ghost" onClick={() => load(query.trim(), null)}>
                Retry
              </Button>
            </div>
          )}
          {!error && page && page.peers.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query ? "Nobody matches that name." : "Nobody else is visible right now."}
            </p>
          )}
          {page?.peers.map((peer) => (
            <LobbyRow
              key={peer.id}
              peer={peer}
              link={links[peer.id]}
              canInvite={visible}
              onInvite={() => invite(peer)}
              onAccept={() => acceptInvite(peer.id)}
              onUnlink={() => unlink(peer.id)}
            />
          ))}
          {loading && <p className="py-3 text-center text-xs text-muted-foreground">Loading…</p>}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{page ? `${page.total} online on other networks` : ""}</span>
          {page?.next && !loading && (
            <Button variant="ghost" onClick={() => load(query.trim(), page.next)}>
              Load more
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

interface LobbyRowProps {
  peer: LobbyPeer;
  link: WorldLink | undefined;
  canInvite: boolean;
  onInvite: () => void;
  onAccept: () => void;
  onUnlink: () => void;
}

function LobbyRow({ peer, link, canInvite, onInvite, onAccept, onUnlink }: LobbyRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
      <Avatar name={peer.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{peer.name}</span>
      <LinkAction
        link={link}
        canInvite={canInvite}
        onInvite={onInvite}
        onAccept={onAccept}
        onUnlink={onUnlink}
      />
    </div>
  );
}

function LinkAction({
  link,
  canInvite,
  onInvite,
  onAccept,
  onUnlink,
}: Omit<LobbyRowProps, "peer">) {
  const small = "px-3 py-1 text-xs";
  switch (link?.status) {
    case "incoming":
      return (
        <Button className={small} onClick={onAccept}>
          Accept
        </Button>
      );
    case "outgoing":
      return (
        <Button variant="ghost" className={small} onClick={onUnlink} title="Cancel invite">
          Waiting…
        </Button>
      );
    case "linked":
      return (
        <Button variant="secondary" className={small} onClick={onUnlink} title="Disconnect">
          Connected
        </Button>
      );
    case "declined":
      return <span className="text-xs text-muted-foreground">Declined</span>;
    case "unanswered":
      return <span className="text-xs text-muted-foreground">No answer</span>;
    case "unreachable":
      return <span className="text-xs text-muted-foreground">Offline</span>;
    case "failed":
      return <span className="text-xs text-destructive">No direct link</span>;
    default:
      return (
        <Button className={small} onClick={onInvite} disabled={!canInvite}>
          Invite
        </Button>
      );
  }
}
