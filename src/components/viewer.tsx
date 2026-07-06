"use client";

import { copyText } from "@/lib/clipboard";
import { hashString } from "@/lib/hash";
import { useViewerStore } from "@/stores/viewer-store";
import { useEffect, useState } from "react";

const NOTE_COLORS = ["", "zr-note-pink", "zr-note-green", "zr-note-blue"];

/** Full-screen viewer: click a code snippet or sticky note to open it big. */
export function Viewer() {
  const item = useViewerStore((s) => s.item);
  const close = useViewerStore((s) => s.close);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, close]);

  if (!item) return null;

  const code = item.content ?? "";
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  const noteColor = NOTE_COLORS[hashString(item.id) % NOTE_COLORS.length];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <button
        type="button"
        onClick={close}
        title="Close (Esc)"
        className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl border border-border text-lg text-foreground"
        style={{ background: "var(--panel)" }}
      >
        ✕
      </button>

      {item.type === "code" ? (
        <div className="zr-term w-[820px] max-w-[94vw]" style={{ cursor: "default" }}>
          <div className="zr-term-bar">
            <span className="zr-term-dot" style={{ background: "#6b6b6b" }} />
            <span className="zr-term-dot" style={{ background: "#8a8a8a" }} />
            <span className="zr-term-dot" style={{ background: "#a5a5a5" }} />
            <span className="zr-term-name">{item.fileName || "snippet"}</span>
            <button type="button" className="zr-term-copy" onClick={copy}>
              {copied ? "✓ copied" : "⧉ copy all"}
            </button>
          </div>
          <div className="zr-term-body zr-term-body-full">{code}</div>
        </div>
      ) : (
        <div className={`zr-note zr-note-big ${noteColor}`} style={{ cursor: "default" }}>
          {code}
          <span className="zr-note-by">— {item.peerName}</span>
        </div>
      )}
    </div>
  );
}
