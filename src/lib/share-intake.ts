// Picks up files/text shared into ZeroRelay from another app. The service
// worker (public/sw.js) parks them in Cache Storage and opens "/?share=1".

const SHARE_CACHE = "zr-share";
const SHARE_META = "/__share/meta";

export interface SharedPayload {
  files: File[];
  text: string;
}

interface ShareMeta {
  title: string;
  text: string;
  url: string;
  files: { key: string; name: string; type: string }[];
}

/** Read the pending share, if any. The metadata is consumed; the file bodies
 *  stay cached (the app may still need to serve them to peers) until the
 *  next share or "Erase all data". */
export async function takeSharedPayload(): Promise<SharedPayload | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match(SHARE_META);
  if (!metaRes) return null;
  const meta = (await metaRes.json()) as ShareMeta;
  await cache.delete(SHARE_META);

  const files: File[] = [];
  for (const f of meta.files) {
    const res = await cache.match(f.key);
    if (res) files.push(new File([await res.blob()], f.name || "shared-file", { type: f.type }));
  }
  // Apps often repeat the URL inside the text; keep each piece once.
  const parts = [meta.title, meta.text, meta.url].map((s) => s.trim()).filter(Boolean);
  const text = [...new Set(parts)].filter(
    (p, _, all) => !all.some((o) => o !== p && o.includes(p)),
  );
  return files.length || text.length ? { files, text: text.join("\n") } : null;
}

export async function clearSharedFiles(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete(SHARE_CACHE).catch(() => {});
}
