let modulePrivateIPs: string[] | null = null;
let modulePublicIPs: string[] | null = null;

function isPrivateIP(ip: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
}

export function extractCandidateIP(candidateStr: string): string | null {
  if (!candidateStr.includes("typ host") && !candidateStr.includes("typ srflx")) return null;
  const ip = candidateStr.split(" ")[4];
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
  return ip;
}

function localPrefix(ip: string): string {
  return ip.split(".").slice(0, 3).join(".");
}

export function sameLAN(remoteIP: string): boolean | null {
  // No local IPs detected at all.
  if (!modulePrivateIPs && !modulePublicIPs) return null;
  if (modulePrivateIPs && modulePrivateIPs.length > 0 && isPrivateIP(remoteIP)) {
    const prefix = localPrefix(remoteIP);
    if (modulePrivateIPs.some((ip) => localPrefix(ip) === prefix)) return true;
  }
  // Fall back to public-IP comparison (peers behind the same NAT).
  if (modulePublicIPs && modulePublicIPs.length > 0) {
    if (modulePublicIPs.includes(remoteIP)) return true;
  }
  return false;
}

export async function ensureLocalIPs(): Promise<void> {
  if (modulePrivateIPs !== null && modulePublicIPs !== null) return;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  pc.createDataChannel("_detect");
  await pc.createOffer().then((o) => pc.setLocalDescription(o));

  await new Promise<void>((resolve) => {
    const foundPrivate = new Set<string>();
    const foundPublic = new Set<string>();
    const done = () => {
      pc.close();
      modulePrivateIPs = [...foundPrivate];
      modulePublicIPs = [...foundPublic];
      resolve();
    };
    const fallback = setTimeout(done, 2000);
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        clearTimeout(fallback);
        done();
        return;
      }
      // Prefer the address property (real IP even behind mDNS in Chrome).
      let ip: string | null = null;
      const direct = e.candidate.address;
      if (direct && !direct.includes(".local") && /^\d+\.\d+\.\d+\.\d+$/.test(direct)) {
        ip = direct;
      } else {
        ip = extractCandidateIP(e.candidate.candidate);
      }
      if (!ip) return;
      if (isPrivateIP(ip)) foundPrivate.add(ip);
      else foundPublic.add(ip);
    };
  });
}
