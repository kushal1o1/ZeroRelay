"use client";

import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";

interface SharePanelProps {
  targetName: string | null;
  onSendText: (text: string) => void;
  onSendFile: (file: File) => void;
}

export function SharePanel({ targetName, onSendText, onSendFile }: SharePanelProps) {
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendText(text);
    setText("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSendFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onSendFile(file);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Sharing to: <span className="font-medium text-foreground">{targetName || "Everyone"}</span>
      </p>

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
        className={`flex cursor-pointer w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
        }`}
      >
        <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
      </button>

      {/* Text input */}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message or paste code..."
          rows={3}
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <Button onClick={handleSend} disabled={!text.trim()} className="self-end">
          Send
        </Button>
      </div>
    </div>
  );
}
