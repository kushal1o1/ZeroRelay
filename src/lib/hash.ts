/**
 * Deterministic non-negative string hash (djb2 variant).
 * Shared by the avatar color picker and the radar layout jitter so identical
 * ids always map to the same value across renders.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}
