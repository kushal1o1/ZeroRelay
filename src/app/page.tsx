"use client";

import { CreateRoomDialog } from "@/components/create-room-dialog";
import { ProfileDialog } from "@/components/profile-dialog";
import { RoomProvider, useRoomContext } from "@/components/room-provider";
import { RoomSwitcher } from "@/components/room-switcher";
import { RoomView } from "@/components/room/room-view";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Viewer } from "@/components/viewer";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import Link from "next/link";
import { useEffect, useState } from "react";

function ChatHome() {
  const peerId = useRoomStore((s) => s.peerId);
  const name = useRoomStore((s) => s.name);
  const connected = useRoomStore((s) => s.connected);
  const roomId = useRoomStore((s) => s.roomId);
  const peers = useRoomStore((s) => s.peers);
  const hydrated = useUIStore((s) => s.hydrated);
  const activeRoomId = useUIStore((s) => s.activeRoomId);
  const { joinRoom } = useRoomContext();
  const [profileOpen, setProfileOpen] = useState(false);
  // Name/avatar come from localStorage-seeded state, so they differ between the
  // server render and the client. Gate them behind mount to avoid a hydration
  // mismatch (render a neutral placeholder until mounted).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!hydrated) return;
    if (peerId && !connected && !roomId) {
      joinRoom(activeRoomId || "global");
    }
  }, [hydrated, peerId, connected, roomId, activeRoomId, joinRoom]);

  const others = peers.filter((p) => p.id !== peerId);
  const lanCount = others.filter((p) => p.locale === "local").length;

  return (
    <div className="flex h-screen flex-col">
      <header
        className="z-20 flex items-center gap-3 border-b border-border px-4 py-2 backdrop-blur-md"
        style={{ background: "var(--panel)" }}
      >
        <Link
          href="/landing"
          aria-label="About ZeroRelay"
          className="shrink-0 rounded-lg transition-opacity hover:opacity-80"
        >
          <Logo size="md" />
        </Link>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <RoomSwitcher />
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground sm:flex">
          <span className={`size-2 rounded-full ${connected ? "bg-accent" : "bg-destructive"}`} />
          {connected ? (
            <span>
              {others.length} peer{others.length !== 1 ? "s" : ""}
              {lanCount > 0 && (
                <>
                  {" · "}
                  <b className="text-accent">{lanCount} LAN</b>
                </>
              )}
            </span>
          ) : (
            "connecting…"
          )}
        </div>

        <ThemeToggle />

        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          title="Edit your profile"
          aria-label="Edit your profile"
          className="flex shrink-0 items-center gap-2 rounded-full border border-border p-1 text-sm text-foreground hover:border-accent/50 sm:pl-3"
        >
          {mounted ? (
            <>
              {/* Name is hidden on mobile — the avatar alone represents you there. */}
              <span className="hidden max-w-24 truncate sm:inline">{name}</span>
              <Avatar name={name} peerId={peerId} size="sm" />
            </>
          ) : (
            <span className="size-7 rounded-full bg-muted" />
          )}
        </button>
      </header>

      <main className="min-h-0 flex-1">
        <RoomView onEditProfile={() => setProfileOpen(true)} />
      </main>

      <CreateRoomDialog />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <Viewer />
    </div>
  );
}

/** Root route: the chat app. RoomProvider is mounted here (not in the root
 * layout) so the marketing page at /landing never opens a signaling socket. */
export default function Page() {
  return (
    <RoomProvider>
      <ChatHome />
    </RoomProvider>
  );
}
