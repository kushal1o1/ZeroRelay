"use client";

import { clearExpired, db, getMessages, saveMessage } from "@/lib/db";
import type { SharedItem } from "@/types/message";
import { useCallback, useEffect, useState } from "react";

export function useStorage() {
  const [items, setItems] = useState<SharedItem[]>([]);

  useEffect(() => {
    getMessages().then(setItems);
  }, []);

  const addItem = useCallback(async (item: SharedItem) => {
    await saveMessage(item);
    setItems((prev) => [item, ...prev]);
  }, []);

  useEffect(() => {
    const interval = setInterval(clearExpired, 60_000);
    return () => clearInterval(interval);
  }, []);

  return { items, addItem };
}
