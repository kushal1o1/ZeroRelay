import type { SharedPayload } from "@/lib/share-intake";
import { create } from "zustand";

/** Chrome/Edge/Android's deferred install prompt (not in the DOM typings). */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** Set when the browser offers to install the app. */
  installPrompt: InstallPromptEvent | null;
  /** Running as an installed app (standalone window). */
  standalone: boolean;
  /** Something shared into the app from another app, waiting for the composer. */
  incoming: SharedPayload | null;

  setInstallPrompt: (e: InstallPromptEvent | null) => void;
  setStandalone: (standalone: boolean) => void;
  setIncoming: (payload: SharedPayload | null) => void;
}

export const usePwaStore = create<PwaState>((set) => ({
  installPrompt: null,
  standalone: false,
  incoming: null,
  setInstallPrompt: (installPrompt) => set({ installPrompt }),
  setStandalone: (standalone) => set({ standalone }),
  setIncoming: (incoming) => set({ incoming }),
}));
