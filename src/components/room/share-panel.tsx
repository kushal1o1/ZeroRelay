"use client";

import { Button } from "@/components/ui/button";
import type { ItemType, Retention } from "@/types/message";
import { ITEM_TYPE_LABELS, RETENTION_LABELS } from "@/types/message";
import { useEffect, useRef, useState } from "react";

interface SharePanelProps {
  targetName: string | null;
  onSend: (text: string, type: ItemType, retention: Retention) => void;
  onSendFile: (file: File, retention: Retention) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TYPES: ItemType[] = ["text", "code", "note", "file"];
const RETENTIONS: Retention[] = ["session", "5min", "1h", "1d", "forever"];

export function SharePanel({ targetName, onSend, onSendFile }: SharePanelProps) {
  const [text, setText] = useState("");
  const [type, setType] = useState<ItemType>("text");
  const [retention, setRetention] = useState<Retention>("session");
  const [dragOver, setDragOver] = useState(false);
  const [staged, setStaged] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (staged?.type.startsWith("image/")) {
      const url = URL.createObjectURL(staged);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [staged]);

  const handleSendText = () => {
    if (!text.trim()) return;
    onSend(text, type, retention);
    setText("");
  };

  const confirmFile = () => {
    if (staged) onSendFile(staged, retention);
    setStaged(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setStaged(file);
      setType("file");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Sharing to: <span className="font-medium text-foreground">{targetName || "Everyone"}</span>
      </p>

      <div className="flex flex-wrap gap-4">
        <fieldset>
          <legend className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Type
          </legend>
          <div className="flex gap-1">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  type === t
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {ITEM_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Retain
          </legend>
          <div className="flex gap-1">
            {RETENTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRetention(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  retention === r
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {RETENTION_LABELS[r]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {type === "file" || staged ? (
        <div className="space-y-3">
          {staged ? (
            <div className="space-y-3 rounded-xl border border-border p-3">
              {preview ? (
                <div
                  role="img"
                  aria-label={staged.name}
                  className="h-40 w-full rounded-lg bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${preview})` }}
                />
              ) : (
                <div className="flex items-center gap-2 text-sm text-accent">
                  <span className="truncate">{staged.name}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {staged.name} · {formatSize(staged.size)}
              </p>
              <div className="flex gap-2">
                <Button onClick={confirmFile} className="flex-1">
                  Send to {targetName || "Everyone"}
                </Button>
                <Button variant="ghost" onClick={() => setStaged(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
                dragOver ? "border-signal bg-signal/5" : "border-border hover:border-accent/50"
              }`}
            >
              <p className="text-sm text-muted-foreground">
                Drop a file to preview, or click to browse
              </p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setStaged(file);
                    setType("file");
                  }
                  e.target.value = "";
                }}
              />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder={
                type === "code"
                  ? "Paste code…"
                  : type === "note"
                    ? "Write a note…"
                    : "Type a message…"
              }
              rows={3}
              className={`flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 ${
                type === "code" ? "font-mono" : ""
              }`}
            />
            <Button onClick={handleSendText} disabled={!text.trim()} className="self-end">
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
