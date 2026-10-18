import { toHex } from "../../shared/sha256";
import { SECRET_RE, derivePeerId } from "../../shared/types";

// Our identity is a random secret kept in localStorage. The public peer id is
// derived from it (same derivation as the server), so nobody can join as us
// or kick us without the secret.

const SECRET_KEY = "zerorelay-secret";
/** Pre-v2 random peer id, kept only to migrate our own avatar once. */
const LEGACY_PEER_KEY = "zerorelay-peerId";

export interface Identity {
  secret: string;
  peerId: string;
  legacyPeerId: string | null;
}

function createSecret(): string {
  // getRandomValues works in insecure contexts too (plain-http LAN).
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function loadIdentity(): Identity {
  if (typeof localStorage === "undefined") return { secret: "", peerId: "", legacyPeerId: null };

  let secret = localStorage.getItem(SECRET_KEY);
  if (!secret || !SECRET_RE.test(secret)) {
    secret = createSecret();
    localStorage.setItem(SECRET_KEY, secret);
  }
  const legacyPeerId = localStorage.getItem(LEGACY_PEER_KEY);
  if (legacyPeerId) localStorage.removeItem(LEGACY_PEER_KEY);
  return { secret, peerId: derivePeerId(secret), legacyPeerId };
}

export function clearIdentity() {
  localStorage.removeItem(SECRET_KEY);
  localStorage.removeItem(LEGACY_PEER_KEY);
}

export const identity = loadIdentity();
