"use client";

import { formatSize } from "@/lib/format";
import { type ItemType, RETENTION_LABELS, type Retention } from "@/types/message";
import { useEffect, useRef, useState } from "react";

interface ComposerProps {
  /** Everyone in the room except me — pickable recipients. */
  peers: { id: string; name: string }[];
  selectedPeerIds: string[];
  onTogglePeer: (id: string) => void;
  onClearTargets: () => void;
  onSend: (text: string, type: ItemType, retention: Retention) => void;
  onSendFile: (files: File[], retention: Retention) => void;
}

const TYPES: { k: ItemType; label: string }[] = [
  { k: "text", label: "💬 Text" },
  { k: "note", label: "🗒️ Note" },
  { k: "code", label: "⌨️ Code" },
  { k: "file", label: "📄 File" },
];
const RETENTIONS: Retention[] = ["session", "5min", "1h", "1d", "forever"];

const PLACEHOLDER: Record<ItemType, string> = {
  text: "Message everyone…",
  note: "Write a sticky note…",
  code: "Paste code…",
  file: "",
};

export function Composer({
  peers,
  selectedPeerIds,
  onTogglePeer,
  onClearTargets,
  onSend,
  onSendFile,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [type, setType] = useState<ItemType>("text");
  const [retention, setRetention] = useState<Retention>("session");
  const [staged, setStaged] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 0 selected = broadcast to everyone; 1 = that person; many = direct to each.
  const targetNames = peers.filter((p) => selectedPeerIds.includes(p.id)).map((p) => p.name);
  const targetShort =
    targetNames.length === 0
      ? "Everyone"
      : targetNames.length === 1
        ? targetNames[0]
        : `${targetNames.length} people`;
  const targetLabel = targetShort;

  // Close the recipient picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const sendText = () => {
    if (!text.trim()) return;
    onSend(text, type, retention);
    setText("");
  };
  const confirmFile = () => {
    if (staged.length) onSendFile(staged, retention);
    setStaged([]);
  };

  return (
    <div className="border-t border-border p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Sending to</span>
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            title="Choose who receives this"
            className="zr-to-chip inline-flex items-center gap-1"
          >
            {targetLabel}
            <span aria-hidden="true">▾</span>
          </button>
          {pickerOpen && (
            <div
              role="menu"
              aria-label="Recipients"
              className="absolute bottom-full left-0 z-40 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg"
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selectedPeerIds.length === 0}
                onClick={onClearTargets}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
              >
                <span>Everyone</span>
                {selectedPeerIds.length === 0 && <span aria-hidden="true">✓</span>}
              </button>
              {peers.length > 0 && <div className="my-1 h-px bg-border" />}
              {peers.map((p) => {
                const on = selectedPeerIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => onTogglePeer(p.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <span className="truncate">{p.name}</span>
                    {on && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
              {peers.length === 0 && (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  No one else here yet
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setType(t.k)}
            className={`zr-sa-btn ${type === t.k ? "zr-sa-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Keep for</span>
        {RETENTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRetention(r)}
            className={`zr-rt-btn ${retention === r ? "zr-sa-active" : ""}`}
          >
            {r === "forever" ? "∞" : RETENTION_LABELS[r]}
          </button>
        ))}
      </div>

      {type === "file" ? (
        staged.length > 0 ? (
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 max-h-32 space-y-1 overflow-y-auto">
              {staged.map((f) => (
                <div
                  key={f.name + f.size}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-accent">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatSize(f.size)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={confirmFile}
                className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
              >
                Send {staged.length} file{staged.length > 1 ? "s" : ""} to {targetShort}
              </button>
              <button
                type="button"
                onClick={() => setStaged([])}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length) setStaged(files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed p-5 text-sm text-muted-foreground transition-colors ${
              isDragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
            }`}
          >
            <span>Drop files here or click to browse</span>
            <span className="mt-1 text-[10px] text-muted-foreground">Multiple files accepted</span>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) setStaged(files);
                e.target.value = "";
              }}
            />
          </button>
        )
      ) : (
        <div
          className={`zr-input-row ${
            type === "code" ? "zr-compose-code" : type === "note" ? "zr-compose-note" : ""
          }`}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
            rows={type === "text" ? 1 : 3}
            placeholder={PLACEHOLDER[type]}
          />
          <button
            type="button"
            onClick={sendText}
            disabled={!text.trim()}
            className="size-8 shrink-0 self-end rounded-lg bg-accent text-sm text-accent-foreground disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      )}

      <div className="mt-1.5 text-center text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for newline
      </div>
    </div>
  );
}
