"use client";

import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/format";
import { type StorageReport, requestPersistence, storageReport } from "@/lib/storage";
import { clearIncoming } from "@/lib/transfer/sinks";
import { isRunning, useTransferStore } from "@/stores/transfer-store";
import { useCallback, useEffect, useState } from "react";

/** How much ZeroRelay stores on this device, and controls to manage it. */
export function StorageSection({ open }: { open: boolean }) {
  const [report, setReport] = useState<StorageReport | null>(null);
  const [busy, setBusy] = useState(false);
  const receiving = useTransferStore((s) =>
    Object.values(s.transfers).some((t) => t.direction === "receive" && isRunning(t)),
  );

  const refresh = useCallback(() => {
    storageReport()
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!report) return null;

  const clearReceived = async () => {
    setBusy(true);
    await clearIncoming();
    useTransferStore.getState().clearSaved();
    setBusy(false);
    refresh();
  };

  const keepData = async () => {
    setBusy(true);
    await requestPersistence();
    setBusy(false);
    refresh();
  };

  return (
    <div className="border-t border-border pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Storage on this device
      </p>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Used</dt>
          <dd className="text-foreground">
            {formatSize(report.usage)}
            {report.quota > 0 && (
              <span className="text-muted-foreground"> of {formatSize(report.quota)}</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Saved messages</dt>
          <dd className="text-foreground">{report.messages}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Received files (this session)</dt>
          <dd className="flex items-center gap-2 text-foreground">
            {formatSize(report.received)}
            {report.received > 0 && (
              <Button
                variant="ghost"
                className="px-2 py-0.5 text-[11px]"
                onClick={clearReceived}
                disabled={busy || receiving}
                title={receiving ? "Wait for downloads to finish" : undefined}
              >
                Clear
              </Button>
            )}
          </dd>
        </div>
      </dl>
      {report.persist === "best-effort" && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            The browser may delete this data when space runs low.
          </p>
          <Button className="shrink-0 px-2.5 py-1 text-[11px]" onClick={keepData} disabled={busy}>
            Keep my data
          </Button>
        </div>
      )}
      {report.persist === "persisted" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Your data is kept until you erase it.
        </p>
      )}
    </div>
  );
}
