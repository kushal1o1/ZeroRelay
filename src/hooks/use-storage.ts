"use client";

import { useMessageStore } from "@/stores/message-store";
import { useEffect } from "react";

/**
 * Thin view over the shared message store. Every caller reads the same items
 * and the same addItem action, so a write from anywhere is reflected everywhere.
 */
export function useStorage() {
  const items = useMessageStore((s) => s.items);
  const addItem = useMessageStore((s) => s.addItem);
  const load = useMessageStore((s) => s.load);
  const refresh = useMessageStore((s) => s.refresh);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { items, addItem };
}
