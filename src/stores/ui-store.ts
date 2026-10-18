import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NEARBY_ROOM_ID, type Visibility } from "../../shared/types";

/** A room in the switcher. Passwords are never stored, only server tokens. */
export interface SavedRoom {
  id: string;
  name: string;
  hasPassword: boolean;
  /** Lets us rejoin without the password. */
  joinToken?: string;
  /** Only held by the creator; required to delete the room. */
  ownerToken?: string;
}

type Dialog = "create" | "join" | null;

interface UIState {
  rooms: SavedRoom[];
  activeRoomId: string | null;
  dialog: Dialog;
  /** Room code to prefill in the join dialog. */
  dialogRoomId: string | null;
  visibility: Visibility;
  hydrated: boolean;

  /** Add a room or merge new fields (tokens, name) into an existing one. */
  upsertRoom: (room: SavedRoom) => void;
  removeRoom: (roomId: string) => void;
  setActiveRoomId: (id: string | null) => void;
  setDialog: (dialog: Dialog, roomId?: string) => void;
  setVisibility: (visibility: Visibility) => void;
  setHydrated: () => void;
}

const NEARBY_ROOM: SavedRoom = { id: NEARBY_ROOM_ID, name: "Global", hasPassword: false };

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      rooms: [NEARBY_ROOM],
      activeRoomId: NEARBY_ROOM_ID,
      dialog: null,
      dialogRoomId: null,
      visibility: "world",
      hydrated: false,

      upsertRoom: (room) =>
        set((s) => {
          const existing = s.rooms.find((r) => r.id === room.id);
          if (!existing) return { rooms: [...s.rooms, room] };
          return { rooms: s.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r)) };
        }),
      removeRoom: (roomId) =>
        set((s) => ({
          rooms: roomId === NEARBY_ROOM_ID ? s.rooms : s.rooms.filter((r) => r.id !== roomId),
          activeRoomId: s.activeRoomId === roomId ? NEARBY_ROOM_ID : s.activeRoomId,
        })),
      setActiveRoomId: (id) => set({ activeRoomId: id }),
      setDialog: (dialog, roomId) => set({ dialog, dialogRoomId: roomId ?? null }),
      setVisibility: (visibility) => set({ visibility }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "zerorelay-rooms",
      version: 2,
      partialize: (state) => ({
        rooms: state.rooms,
        activeRoomId: state.activeRoomId,
        visibility: state.visibility,
      }),
      // v1 rooms used the room name as id and stored plaintext passwords;
      // neither works with v2 private rooms, so start over with just Global.
      migrate: (): Pick<UIState, "rooms" | "activeRoomId" | "visibility"> => ({
        rooms: [NEARBY_ROOM],
        activeRoomId: NEARBY_ROOM_ID,
        visibility: "world",
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
