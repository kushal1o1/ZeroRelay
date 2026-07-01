import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RoomInfo {
  id: string;
  name: string;
  hasPassword: boolean;
  password?: string;
  createdBy?: string;
}

interface UIState {
  rooms: RoomInfo[];
  activeRoomId: string | null;
  dialog: "create" | "join" | null;

  setRooms: (rooms: RoomInfo[]) => void;
  addRoom: (room: RoomInfo) => void;
  removeRoom: (roomId: string) => void;
  setActiveRoomId: (id: string | null) => void;
  setDialog: (dialog: "create" | "join" | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      rooms: [{ id: "global", name: "Global", hasPassword: false }],
      activeRoomId: "global",
      dialog: null,

      setRooms: (rooms) => set({ rooms }),
      addRoom: (room) =>
        set((s) => ({
          rooms: s.rooms.some((r) => r.id === room.id) ? s.rooms : [...s.rooms, room],
        })),
      removeRoom: (roomId) => set((s) => ({ rooms: s.rooms.filter((r) => r.id !== roomId) })),
      setActiveRoomId: (id) => set({ activeRoomId: id }),
      setDialog: (dialog) => set({ dialog }),
    }),
    {
      name: "zerorelay-rooms",
      partialize: (state) => ({
        rooms: state.rooms,
        activeRoomId: state.activeRoomId,
      }),
    },
  ),
);
