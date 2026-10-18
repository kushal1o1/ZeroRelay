"use client";

import { type ComponentProps, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Remote images would let whoever wrote the Markdown see your IP when you open
 *  it, so they only load after a tap. Inline (data:) images show directly. */
function GatedImage({ src, alt }: ComponentProps<"img">) {
  const [show, setShow] = useState(false);
  if (typeof src !== "string" || !src) return null;
  if (show || src.startsWith("data:image/")) {
    return <img src={src} alt={alt ?? ""} referrerPolicy="no-referrer" />;
  }
  let host = "";
  try {
    host = new URL(src).host;
  } catch {
    // Relative or malformed: show the raw text.
  }
  return (
    <button
      type="button"
      onClick={() => setShow(true)}
      className="my-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
      title={src}
    >
      🖼 {alt || "image"}
      <span className="opacity-70">· load from {host || src}</span>
    </button>
  );
}

function SafeLink({ href, children }: ComponentProps<"a">) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

const components: Components = { img: GatedImage, a: SafeLink };

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="zr-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
