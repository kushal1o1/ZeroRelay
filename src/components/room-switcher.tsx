"use client";

import { useRoomContext } from "@/components/room-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useRoomStore } from "@/stores/room-store";
import { useUIStore } from "@/stores/ui-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_W = 176; // w-44

interface MenuState {
  roomId: string;
  roomName: string;
  top: number;
  left: number;
}

export function RoomSwitcher() {
  const { rooms, activeRoomId, setActiveRoomId, setDialog, removeRoom } = useUIStore();
  const { joinRoom, leaveRoom, sendSignaling } = useRoomContext();
  const connected = useRoomStore((s) => s.connected);
  const connectedRoomId = useRoomStore((s) => s.roomId);
  const peerId = useRoomStore((s) => s.peerId);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSwitch = (roomId: string) => {
    setActiveRoomId(roomId);
    if (roomId !== connectedRoomId) {
      const room = rooms.find((r) => r.id === roomId);
      joinRoom(roomId, room?.password || undefined);
    }
  };

  const handleLeave = useCallback(
    (roomId: string) => {
      if (roomId === connectedRoomId) leaveRoom();
      removeRoom(roomId);
    },
    [connectedRoomId, leaveRoom, removeRoom],
  );

  // Delete is destructive → confirm in a dialog rather than a native alert.
  const doDelete = useCallback(() => {
    if (!confirmDelete) return;
    sendSignaling({ type: "delete-room", roomId: confirmDelete.id, peerId });
    removeRoom(confirmDelete.id);
    setConfirmDelete(null);
  }, [confirmDelete, peerId, sendSignaling, removeRoom]);

  // Close the actions menu on outside click / Escape / scroll / resize.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (menuRef.current?.contains(t)) return;
      if (t.closest("[data-room-menu-trigger]")) return; // let the trigger toggle
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const close = () => setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const toggleMenu = (roomId: string, roomName: string, e: React.MouseEvent) => {
    if (menu?.roomId === roomId) {
      setMenu(null);
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      roomId,
      roomName,
      top: r.bottom + 6,
      left: Math.max(8, r.right - MENU_W),
    });
  };

  const ring =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const activeManageable = !!activeRoom && activeRoom.id !== "global";

  return (
    <nav aria-label="Rooms" className="flex items-center py-1">
      {/* Desktop: a tab per room */}
      <div className="hidden items-center gap-1.5 md:flex">
        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const isGlobal = room.id === "global";
          const live = isGlobal || (room.id === connectedRoomId && connected);
          return (
            <div key={room.id} className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleSwitch(room.id)}
                aria-current={isActive ? "page" : undefined}
                title={room.name}
                className={`zr-tab min-h-[34px] ${isActive ? "zr-tab-active" : ""} ${ring}`}
              >
                <span className={`zr-dot ${live ? "zr-dot-live" : ""}`} aria-hidden="true" />
                <span className="max-w-[10rem] truncate">{room.name}</span>
                {room.hasPassword && (
                  <span title="Password protected" aria-label="Password protected">
                    🔒
                  </span>
                )}
              </button>

              {/* Actions live behind a kebab on the active, non-global room */}
              {isActive && !isGlobal && (
                <button
                  type="button"
                  data-room-menu-trigger
                  onClick={(e) => toggleMenu(room.id, room.name, e)}
                  aria-haspopup="menu"
                  aria-expanded={menu?.roomId === room.id}
                  aria-label={`Actions for ${room.name}`}
                  title="Room options"
                  className={`grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
                    menu?.roomId === room.id ? "bg-muted text-foreground" : ""
                  } ${ring}`}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    ⋮
                  </span>
                </button>
              )}
            </div>
          );
        })}

        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />

        <button
          type="button"
          onClick={() => setDialog("create")}
          aria-label="Create a new room"
          className={`zr-tab min-h-[34px] shrink-0 ${ring}`}
        >
          + New
        </button>
        <button
          type="button"
          onClick={() => setDialog("join")}
          aria-label="Join a room"
          className={`zr-tab min-h-[34px] shrink-0 ${ring}`}
        >
          Join
        </button>
      </div>

      {/* Mobile: a compact dropdown + actions (tabs don't fit) */}
      <div className="flex items-center gap-1 md:hidden">
        <select
          value={activeRoomId ?? "global"}
          onChange={(e) => handleSwitch(e.target.value)}
          aria-label="Switch room"
          className={`min-h-[34px] max-w-[8.5rem] rounded-lg border border-border bg-card px-2 font-mono text-sm text-foreground ${ring}`}
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
              {room.hasPassword ? " 🔒" : ""}
            </option>
          ))}
        </select>
        {activeManageable && activeRoom && (
          <button
            type="button"
            data-room-menu-trigger
            onClick={(e) => toggleMenu(activeRoom.id, activeRoom.name, e)}
            aria-haspopup="menu"
            aria-expanded={menu?.roomId === activeRoom.id}
            aria-label={`Actions for ${activeRoom.name}`}
            title="Room options"
            className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground ${ring}`}
          >
            <span aria-hidden="true" className="text-base leading-none">
              ⋮
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setDialog("create")}
          aria-label="Create a new room"
          title="New room"
          className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground ${ring}`}
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => setDialog("join")}
          aria-label="Join a room"
          title="Join room"
          className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground ${ring}`}
        >
          ⤵
        </button>
      </div>

      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`${menu.roomName} options`}
            style={{ position: "fixed", top: menu.top, left: menu.left, width: MENU_W }}
            className="z-[60] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                handleLeave(menu.roomId);
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              Leave room
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setConfirmDelete({ id: menu.roomId, name: menu.roomName });
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
            >
              Delete room
            </button>
          </div>,
          document.body,
        )}

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete room?">
        <p className="text-sm text-muted-foreground">
          Delete <span className="font-medium text-foreground">{confirmDelete?.name}</span>? This
          removes it for everyone and can't be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={doDelete}>
            Delete room
          </Button>
        </div>
      </Dialog>
    </nav>
  );
}
