"use client";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { useRoomContext } from "@/components/room-provider";
import { copyText } from "@/lib/clipboard";
import { hashString } from "@/lib/hash";
import { useMarkdownPreviewStore } from "@/stores/markdown-preview-store";
import { useMessageStore } from "@/stores/message-store";
import { useViewerStore } from "@/stores/viewer-store";
import { useEffect, useState } from "react";

const NOTE_COLORS = ["", "zr-note-pink", "zr-note-green", "zr-note-blue"];

/** Full-screen viewer for code snippets, sticky notes, and Markdown previews. */
export function Viewer() {
  const item = useViewerStore((s) => s.item);
  const close = useViewerStore((s) => s.close);
  const markdownItem = useMarkdownPreviewStore((s) => s.item);
  const markdownContent = useMarkdownPreviewStore((s) => s.content);
  const markdownStatus = useMarkdownPreviewStore((s) => s.status);
  const closeMarkdown = useMarkdownPreviewStore((s) => s.close);
  const { requestFile } = useRoomContext();
  const [copied, setCopied] = useState(false);
  const displayedItem = markdownItem ?? item;

  useEffect(() => {
    if (!displayedItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        closeMarkdown();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [displayedItem, close, closeMarkdown]);

  if (!displayedItem) return null;

  const code = item?.content ?? "";
  const copyMarkdown = async () => {
    if (await copyText(markdownContent)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  const noteColor = NOTE_COLORS[hashString(displayedItem.id) % NOTE_COLORS.length];
  const closeViewer = () => {
    close();
    closeMarkdown();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeViewer();
      }}
    >
      <button
        type="button"
        onClick={closeViewer}
        title="Close (Esc)"
        className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-xl border border-border text-lg text-foreground"
        style={{ background: "var(--panel)" }}
      >
        ✕
      </button>

      {displayedItem.retention === "forever" && (
        <button
          type="button"
          onClick={() => {
            useMessageStore.getState().removeItem(displayedItem.id);
            closeViewer();
          }}
          title="Delete from this device"
          aria-label="Delete from this device"
          className="absolute right-20 top-5 flex size-10 items-center justify-center rounded-xl border border-border text-base text-foreground transition-colors hover:border-destructive hover:text-destructive"
          style={{ background: "var(--panel)" }}
        >
          🗑
        </button>
      )}

      {markdownItem ? (
        <section className="flex max-h-[82vh] w-[900px] max-w-[94vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-foreground">
                {markdownItem.fileName || "Markdown text"}
              </h2>
              <p className="text-[11px] text-muted-foreground">Shared by {markdownItem.peerName}</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-foreground hover:bg-muted"
              onClick={copyMarkdown}
            >
              {copied ? "✓ copied" : "⧉ copy all"}
            </button>
            {markdownItem.type === "file" && (
              <button
                type="button"
                onClick={() => requestFile(markdownItem, "preview")}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                Reload
              </button>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
            {markdownStatus === "loading" ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Fetching preview…</p>
            ) : markdownStatus === "error" ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">Could not fetch this Markdown file.</p>
                <button
                  type="button"
                  onClick={() => requestFile(markdownItem, "preview")}
                  className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
                >
                  Retry
                </button>
              </div>
            ) : (
              <MarkdownRenderer content={markdownContent} />
            )}
          </div>
        </section>
      ) : item?.type === "code" ? (
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
      ) : item ? (
        <div className={`zr-note zr-note-big ${noteColor}`} style={{ cursor: "default" }}>
          {code}
          <span className="zr-note-by">~ {item.peerName}</span>
        </div>
      ) : null}
    </div>
  );
}
