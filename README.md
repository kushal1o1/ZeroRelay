## 
<p align="center">
  <em>screenshot placeholder — replace with a GIF showing a room with peers, sharing text + files</em>
  <br><br>
<!-- IMAGE TAG -->
</p>

---

> **ZeroRelay** is a peer-to-peer mesh app for sharing text, code, notes, and files directly between browsers. **No servers store your data** — the signaling server only helps peers discover each other. Everything flows directly between browsers over WebRTC.

<br>

##  Features

| | |
|---|---|
| **P2P Mesh**  | Every peer connects directly to every other peer — no central database |
| **Password Rooms**  | Room-level passwords enforced by Cloudflare Durable Objects |
| **Share Any Type**  | Chat, code (monospace), notes (italic), or files of any size |
| **Retention Model**  | Per-item: session, 5min, 1h, 1d, or forever |
| **Profile Avatars**  | Upload an avatar — it's exchanged once when a new peer connects |
| **LAN Detection**  | Global room is restricted to LAN peers automatically |
| **Dark + Light**  | Full Tailwind theme support |
| **Zero Backend DB**  | IndexedDB on each peer for persistence — nothing stored on the server |

---

##  Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the frontend
npm run dev

# 3. (separate terminal) Start the signaling worker
npm run dev:worker

# 4. Open http://localhost:3000 in two browser windows
```
---

##  Architecture in 30 Seconds

```
                    ┌─────────────────┐
                    │  Cloudflare DO   │  ← only relays ICE/SDP
                    │  (per room)      │
                    └────────┬────────┘
                             │ signaling
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         ┌────────┐    ┌────────┐    ┌────────┐
         │ Peer A │◄──►│ Peer B │◄──►│ Peer C │  ← WebRTC mesh
         │(Dexie) │    │(Dexie) │    │(Dexie) │     (data channels)
         └────────┘    └────────┘    └────────┘
```

Each browser stores its own copy of everything in IndexedDB. When you share something, it's broadcast to all connected peers over WebRTC data channels. The signaling server never sees your messages, files, or avatars.

---

##  Tech Stack

| Layer | Choice |
|---|---|
| **Frontend** | Next.js 15 + React 19 |
| **State** | Zustand (in-memory + localStorage persist) |
| **Persistence** | Dexie v4 (IndexedDB) |
| **P2P Transport** | WebRTC (mesh topology) |
| **Signaling** | Cloudflare Workers + Durable Objects |
| **Styling** | Tailwind CSS v4 |
| **Tooling** | Biome, TypeScript, Husky |

---

##  Project Structure

```
zerorelay/
├── src/
│   ├── components/       # React components
│   │   ├── room/         #   SharePanel, MessageFeed, PresenceList, UserCard
│   │   └── ui/           #   Avatar, Button, Dialog, Input (reusable)
│   ├── hooks/            # useRoom, useSignaling, useWebRTC
│   ├── lib/              # ice.ts, signaling.ts, db.ts, id.ts, file-transfer.ts
│   ├── stores/           # Zustand stores (room, message, avatar, ui)
│   ├── types/            # SharedItem, PeerMessage, Retention, etc.
│   └── app/              # Next.js App Router entry
├── workers/
│   └── signaling/        # Cloudflare Worker + Durable Object
├── shared/               # Protocol types shared between client + server
└── ARCHITECTURE.md       # Full architecture deep-dive
```

---

##  Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — deep dive into data flow, storage, room lifecycle, retention, and security

---

##  License

MIT
