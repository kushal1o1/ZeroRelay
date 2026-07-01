// Chunk-safe base64 <-> bytes. We encode binary in ~32KB windows so
// String.fromCharCode(...) never overflows the call-stack argument limit.

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const WINDOW = 0x8000;
  for (let i = 0; i < bytes.length; i += WINDOW) {
    binary += String.fromCharCode(...bytes.subarray(i, i + WINDOW));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
