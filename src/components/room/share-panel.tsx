"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";

interface SharePanelProps {
  targetName: string | null;
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SharePanel({ targetName, onSendText, onSendFile }: SharePanelProps) {
  const [text, setText] = useState("");
  const [mono, setMono] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [staged, setStaged] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Build/tear-down an object URL only for image previews.
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
    onSendText(text);
    setText("");
  };

  const confirmFile = () => {
    if (staged) onSendFile(staged);
    setStaged(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setStaged(file);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Sharing to: <span className="font-medium text-foreground">{targetName || "Everyone"}</span>
      </p>

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
              if (file) setStaged(file);
              e.target.value = "";
            }}
          />
        </button>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Message</span>
        <button
          type="button"
          onClick={() => setMono((m) => !m)}
          className={`rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors ${
            mono ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {"</>"} code
        </button>
      </div>

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
          placeholder={mono ? "Paste code…" : "Type a message…"}
          rows={3}
          className={`flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 ${
            mono ? "font-mono" : ""
          }`}
        />
        <Button onClick={handleSendText} disabled={!text.trim()} className="self-end">
          Send
        </Button>
      </div>
    </div>
  );
}
