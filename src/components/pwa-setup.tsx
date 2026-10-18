"use client";

import { takeSharedPayload } from "@/lib/share-intake";
import { type InstallPromptEvent, usePwaStore } from "@/stores/pwa-store";
import { useEffect } from "react";

/** Registers the service worker, captures the install prompt and picks up
 *  anything shared into the app. Renders nothing. */
export function PwaSetup() {
  useEffect(() => {
    const store = usePwaStore.getState();
    store.setStandalone(window.matchMedia("(display-mode: standalone)").matches);

    // Only in production builds: a dev server's files change constantly.
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator &&
      window.isSecureContext
    ) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      usePwaStore.getState().setInstallPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      usePwaStore.getState().setInstallPrompt(null);
      usePwaStore.getState().setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const params = new URLSearchParams(window.location.search);
    if (params.has("share")) {
      params.delete("share");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
      takeSharedPayload()
        .then((payload) => payload && usePwaStore.getState().setIncoming(payload))
        .catch((err) => console.warn("Couldn't read the shared items", err));
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
