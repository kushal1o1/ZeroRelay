// `crypto.randomUUID` only exists in secure contexts; `getRandomValues` works
// everywhere (including plain-http LAN), so the fallback uses it.
function uuidFallback(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidFallback();
}

// No 0/o/1/l/i, so codes survive being read aloud or typed on a phone.
const ROOM_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const ROOM_CODE_LENGTH = 12;

/** Random, unguessable room code (~59 bits). Matches ROOM_ID_RE. */
export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

/** Normalize a typed/pasted room code: lowercase, drop spaces and dashes. */
export function normalizeRoomCode(input: string): string {
  return input.toLowerCase().replace(/[\s-]/g, "");
}
