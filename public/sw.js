// ZeroRelay service worker: caches the app's own files so it opens instantly,
// and receives files/text shared from other apps (Android share sheet).
// It never touches the signaling worker, WebSockets or third-party requests.

const VERSION = "v1";
const SHELL_CACHE = `zr-shell-${VERSION}`;
/** Shared items wait here until the app picks them up (see lib/share-intake.ts). */
const SHARE_CACHE = "zr-share";
const SHARE_PATH = "/share-target";
const SHARE_META = "/__share/meta";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/"]))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("zr-shell-") && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && url.pathname === SHARE_PATH) {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;

  // Hashed build files never change: serve from cache once fetched.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  // Pages: always try the network (fresh deploys), fall back to cache offline.
  if (req.mode === "navigate") event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match("/"));
    if (hit) return hit;
    throw err;
  }
}

/** Park a share in the cache, then open the app to pick it up. */
async function receiveShare(req) {
  try {
    const form = await req.formData();
    // Only the latest share is kept; older shared files are dropped here.
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    const files = form.getAll("files").filter((f) => typeof f === "object" && "name" in f);
    const meta = {
      title: String(form.get("title") || ""),
      text: String(form.get("text") || ""),
      url: String(form.get("url") || ""),
      files: files.map((f, i) => ({ key: `/__share/file/${i}`, name: f.name, type: f.type })),
    };
    await Promise.all(
      files.map((f, i) =>
        cache.put(
          meta.files[i].key,
          new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream" } }),
        ),
      ),
    );
    await cache.put(SHARE_META, new Response(JSON.stringify(meta)));
  } catch {
    // Fall through: the app opens without a pending share.
  }
  return Response.redirect("/?share=1", 303);
}
