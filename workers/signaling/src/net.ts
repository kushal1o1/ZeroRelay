import { sha256Hex } from "../../../shared/sha256";

// Devices are grouped into a "network" by public IP: everyone behind the same
// router (NAT) shares an IPv4 address; IPv6 devices on one LAN share a /64.
// Known limitation: carrier-grade NAT can put unrelated mobile users together,
// and a dual-stack device may show up via v4 on one device and v6 on another.

const DEV_GROUP = "dev-lan";

function isPrivateV4(ip: string): boolean {
  return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

function expandV6(ip: string): string[] | null {
  const [head, tail, ...rest] = ip.split("::");
  if (rest.length > 0) return null;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  if (fill < 0) return null;
  const parts = [...left, ...Array(fill).fill("0"), ...right];
  return parts.length === 8 ? parts.map((p) => p.toLowerCase().padStart(4, "0")) : null;
}

/** The part of an IP that identifies its network. Private/loopback addresses
 *  (local `wrangler dev`, self-hosting on a LAN) all collapse into one group. */
export function networkGroup(ip: string | null): string {
  if (!ip) return DEV_GROUP;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = mapped ? mapped[1] : ip;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isPrivateV4(v4) ? DEV_GROUP : v4;

  const parts = expandV6(ip);
  if (!parts) return DEV_GROUP;
  const first = Number.parseInt(parts[0], 16);
  const isLoopback = parts.slice(0, 7).every((p) => p === "0000") && parts[7] === "0001";
  const isUla = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  if (isLoopback || isUla || isLinkLocal) return DEV_GROUP;
  return `${parts.slice(0, 4).join(":")}::/64`;
}

/** Salted hash of the network group; raw IPs never leave the router. */
export function netKey(ip: string | null, salt: string): string {
  return sha256Hex(`${salt}|${networkGroup(ip)}`);
}
