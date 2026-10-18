"use client";

import { Button } from "@/components/ui/button";
import { usePwaStore } from "@/stores/pwa-store";
import { useEffect, useState } from "react";

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** "Install app" where the browser offers it; instructions on iOS. */
export function InstallSection() {
  const installPrompt = usePwaStore((s) => s.installPrompt);
  const standalone = usePwaStore((s) => s.standalone);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(isIos()), []);

  if (standalone || (!installPrompt && !ios)) return null;

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    usePwaStore.getState().setInstallPrompt(null);
  };

  return (
    <div className="border-t border-border pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">App</p>
      {installPrompt ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Install ZeroRelay for a home-screen icon, its own window and faster start.
          </p>
          <Button className="shrink-0 px-3 py-1 text-xs" onClick={install}>
            Install app
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          To install on iPhone or iPad: tap <b className="text-foreground">Share</b>, then{" "}
          <b className="text-foreground">Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
}
