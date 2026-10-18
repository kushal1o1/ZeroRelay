<p align="center">
  <img src="./demo.gif" alt="ZeroRelay Demo" width="800"/>
</p>


<h1 align="center">ZeroRelay</h1>

> **ZeroRelay** is a peer-to-peer opensource mesh app for sharing text, code, notes, and files directly between browsers. **No servers store your data** - the signaling server only helps peers discover each other. Everything flows directly between browsers over WebRTC.

<br/>

## Features

| | |
|---|---|
| **Global room, scoped to your network** | Open the app and you're in a room with every device on the same WiFi/router - strangers on other networks never land in it |
| **Everyone lobby (opt-out)** | You can also be listed for people on other networks - name only, toggle it off in your profile |
| **Private rooms** | Create a room, share its code; optional password, only the creator can delete it, auto-expires after 24 h empty |
| **P2P Mesh** | Peers connect directly to each other over WebRTC - no central database |
| **Share Any Type** | Chat, code (monospace), notes (italic), Markdown, or files of any size |
| **Retention Model** | Per-item: session, 5min, 1h, 1d, or forever |
| **Zero Backend DB** | IndexedDB on each peer for persistence - nothing stored on the server |

---

## Privacy model

| Who | What they see |
|---|---|
| **Peers in your room** | Your display name, avatar, and whatever you share with them |
| **People on other networks** | Only your display name in the lobby - and only if you leave "Show me to people on other networks" on. Nothing is sent to you without your acceptance |
| **Signaling server** | Peer ids, display names, which room you're in, and a *salted hash* of your public IP (used to group devices on the same network). Never your messages, files, or avatars |

Shared content never touches the server. It goes browser-to-browser over WebRTC data channels, which are always encrypted (DTLS).

---

## Quick Start

```bash
# 1. Install dependencies
npm install
npm install --prefix workers/signaling

# 2. Start the frontend
npm run dev

# 3. (separate terminal) Start the signaling worker
npm run dev:worker

# 4. Open http://localhost:3000 in two different browsers
#    (or one normal + one private window)
```

> Each browser profile is one identity, so two tabs of the same browser replace each other (the newest wins). Use two browsers, a private window, or a second device.

**Testing on a phone:** open `http://<your-computer's-LAN-IP>:3000` on the phone. The client connects to the worker on port `8787` of the same host. All private/LAN addresses are grouped into one network in development, so your devices find each other.

---

## Deploying

The web app (e.g. Vercel) and the signaling worker (Cloudflare) **must be deployed together** - they share a versioned protocol, and an outdated client is asked to refresh.

```bash
cd workers/signaling
npx wrangler secret put IP_SALT   # any long random string; salts the network hashes
npx wrangler deploy
```

Then set `NEXT_PUBLIC_SIGNALING_URL=wss://<your-worker-host>/api/ws` for the web app.

---

## Architecture

```mermaid
graph TD
    R[Worker router] -->|/api/ws/global| N[RoomDO: Nearby<br/>one per network]
    R -->|/api/ws/room/:code| P[RoomDO: Private<br/>one per room code]
    R -->|/api/lobby| W[WorldDO<br/>lobby directory]
    N <-->|register / route| W
    N -->|signaling| PeerA
    N -->|signaling| PeerB
    PeerA <-->|WebRTC| PeerB
```

Each browser stores its own copy of everything in IndexedDB. When you share something, it's sent to connected peers over WebRTC data channels. The signaling server never sees your messages, files, or avatars.

### Known limitations

- "Same network" means "same public IP". Mobile carriers that put many users behind one IP (carrier-grade NAT) can group unrelated people, and a network with both IPv4 and IPv6 can split devices into two groups.
- Without a relay server, some pairs of devices can't connect directly (strict NATs, some phones).

---

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - rooms, identity, signaling protocol, data flow, storage

---

## License
[MIT](LICENSE)
