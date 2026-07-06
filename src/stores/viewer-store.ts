import type { SharedItem } from "@/types/message";
import { create } from "zustand";

/** Holds the item currently expanded in the full-screen viewer (code / note). */
interface ViewerState {
  item: SharedItem | null;
  open: (item: SharedItem) => void;
  close: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  item: null,
  open: (item) => set({ item }),
  close: () => set({ item: null }),
}));
