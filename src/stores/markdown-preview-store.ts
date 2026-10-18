import type { SharedItem } from "@/types/message";
import { create } from "zustand";

type PreviewStatus = "loading" | "ready" | "error";

interface MarkdownPreviewState {
  item: SharedItem | null;
  content: string;
  status: PreviewStatus | null;
  openText: (item: SharedItem) => void;
  beginFile: (item: SharedItem) => void;
  setContent: (itemId: string, content: string) => void;
  setError: (itemId: string) => void;
  close: () => void;
}

export const useMarkdownPreviewStore = create<MarkdownPreviewState>((set, get) => ({
  item: null,
  content: "",
  status: null,

  openText: (item) => set({ item, content: item.content ?? "", status: "ready" }),
  beginFile: (item) => set({ item, content: "", status: "loading" }),
  setContent: (itemId, content) => {
    if (get().item?.id === itemId) set({ content, status: "ready" });
  },
  setError: (itemId) => {
    if (get().item?.id === itemId) set({ status: "error" });
  },
  close: () => set({ item: null, content: "", status: null }),
}));
