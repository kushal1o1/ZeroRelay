import {
  type ClientMessage,
  LIMITS,
  PEER_ID_RE,
  SECRET_RE,
  type SignalPayload,
} from "../../../shared/types";

// Runtime validation of untrusted client frames. Returns null for anything
// malformed so handlers can rely on the static types.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const optString = (v: unknown, max: number): v is string | undefined =>
  v === undefined || (typeof v === "string" && v.length <= max);

/** Trim, strip control characters and enforce the length limit. */
export function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const name = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name.length > 0 && name.length <= max ? name : null;
}

function isSignalPayload(v: unknown): v is SignalPayload {
  if (!isObj(v)) return false;
  switch (v.kind) {
    case "offer":
    case "answer":
      return isObj(v.sdp) && typeof v.sdp.type === "string" && typeof v.sdp.sdp === "string";
    case "ice":
      return isObj(v.candidate) && typeof v.candidate.candidate === "string";
    default:
      return false;
  }
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case "join": {
      const name = cleanName(raw.name, LIMITS.name);
      if (typeof raw.v !== "number" || typeof raw.secret !== "string") return null;
      if (!SECRET_RE.test(raw.secret) || !name) return null;
      if (raw.visibility !== undefined && raw.visibility !== "world" && raw.visibility !== "hidden")
        return null;
      if (!optString(raw.password, LIMITS.password) || !optString(raw.token, LIMITS.token))
        return null;
      let create: { name: string; password?: string } | undefined;
      if (raw.create !== undefined) {
        if (!isObj(raw.create)) return null;
        const roomName = cleanName(raw.create.name, LIMITS.roomName);
        if (!roomName || !optString(raw.create.password, LIMITS.password)) return null;
        create = { name: roomName, password: raw.create.password || undefined };
      }
      return {
        type: "join",
        v: raw.v,
        secret: raw.secret,
        name,
        visibility: raw.visibility,
        create,
        password: raw.password || undefined,
        token: raw.token || undefined,
      };
    }
    case "rename": {
      const name = cleanName(raw.name, LIMITS.name);
      return name ? { type: "rename", name } : null;
    }
    case "visibility":
      return raw.visibility === "world" || raw.visibility === "hidden"
        ? { type: "visibility", visibility: raw.visibility }
        : null;
    case "leave":
      return { type: "leave" };
    case "delete-room":
      return typeof raw.ownerToken === "string" && raw.ownerToken.length <= LIMITS.token
        ? { type: "delete-room", ownerToken: raw.ownerToken }
        : null;
    case "signal":
      return typeof raw.to === "string" && PEER_ID_RE.test(raw.to) && isSignalPayload(raw.payload)
        ? { type: "signal", to: raw.to, payload: raw.payload }
        : null;
    default:
      return null;
  }
}
