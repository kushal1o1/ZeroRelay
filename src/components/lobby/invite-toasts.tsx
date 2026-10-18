"use client";

import { useRoomContext } from "@/components/room-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { type WorldLink, type WorldLinkStatus, useLobbyStore } from "@/stores/lobby-store";
import { useMemo } from "react";

const NOTICES: Partial<Record<WorldLinkStatus, (name: string) => string>> = {
  outgoing: (name) => `Waiting for ${name} to accept…`,
  declined: (name) => `${name} declined your invite.`,
  unanswered: (name) => `${name} didn't answer.`,
  unreachable: (name) => `${name} is offline.`,
  failed: (name) =>
    `Couldn't connect directly to ${name}. Their network or yours blocks direct connections.`,
};

/** Incoming lobby invites (Accept / Decline) and short status notices. */
export function InviteToasts() {
  const links = useLobbyStore((s) => s.links);
  const shown = useMemo(
    () =>
      Object.values(links)
        .filter((l) => l.status === "incoming" || NOTICES[l.status])
        .sort((a, b) => a.since - b.since),
    [links],
  );
  if (shown.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-16 right-3 left-3 z-[55] flex flex-col items-end gap-2 sm:left-auto md:bottom-4"
    >
      {shown.map((link) => (
        <Toast key={link.id} link={link} />
      ))}
    </div>
  );
}

function Toast({ link }: { link: WorldLink }) {
  const { acceptInvite, declineInvite, unlink } = useRoomContext();
  const card =
    "pointer-events-auto w-full max-w-sm rounded-xl border border-border bg-card p-3 shadow-lg";

  if (link.status === "incoming") {
    return (
      <div role="alertdialog" aria-label={`Invite from ${link.name}`} className={card}>
        <div className="flex items-center gap-3">
          <Avatar name={link.name} size="sm" />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <b className="font-medium">{link.name}</b>
            <span className="text-muted-foreground"> on another network wants to connect.</span>
          </p>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="ghost"
            className="px-3 py-1 text-xs"
            onClick={() => declineInvite(link.id)}
          >
            Decline
          </Button>
          <Button className="px-3 py-1 text-xs" onClick={() => acceptInvite(link.id)}>
            Accept
          </Button>
        </div>
      </div>
    );
  }

  const text = NOTICES[link.status]?.(link.name) ?? "";
  return (
    <div className={`${card} flex items-center gap-3`}>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
      {link.status === "outgoing" && (
        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => unlink(link.id)}>
          Cancel
        </Button>
      )}
    </div>
  );
}
