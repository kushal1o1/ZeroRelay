// Which websites may use this worker from a browser. Set ALLOWED_ORIGINS to a
// comma-separated list (e.g. "https://zerorelay.app,http://localhost:3000").
// Unset = allow any origin, which keeps local development friction-free.
//
// This only stops *other websites* from using the worker through their
// visitors' browsers. Scripts outside a browser can send any Origin header;
// rate limiting is what protects against floods.

export type OriginPolicy = (origin: string | null) => boolean;

export function originPolicy(allowed: string | undefined): OriginPolicy {
  const list = (allowed ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (list.length === 0) return () => true;
  const set = new Set(list);
  // No Origin header = not a cross-site browser request (curl, server, same-origin GET).
  return (origin) => origin === null || set.has(origin);
}

/** CORS headers for a response to `origin`. */
export function corsHeaders(origin: string | null, allowAll: boolean): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowAll ? "*" : (origin ?? ""),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
