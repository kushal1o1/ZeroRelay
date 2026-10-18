import { LIMITS, ROOM_ID_RE } from "../../../shared/types";
import {
  type Env,
  HEADER,
  type RoomKind,
  WORLD_OBJECT_NAME,
  nearbyObjectName,
  privateObjectName,
} from "./env";
import { netKey } from "./net";
import { corsHeaders, originPolicy } from "./origin";

export { RoomDO } from "./room-do";
export { WorldDO } from "./world-do";

// Routes:
//   GET /api/ws/global          → the caller's Nearby room (scoped by public IP)
//   GET /api/ws/room/:roomId    → a private room
//   GET /api/lobby?q=&cursor=   → page of the worldwide lobby (other networks)

const DEV_SALT = "zerorelay-dev-salt";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const net = netKey(request.headers.get("CF-Connecting-IP"), env.IP_SALT || DEV_SALT);

    const origin = request.headers.get("Origin");
    const allowed = originPolicy(env.ALLOWED_ORIGINS);
    if (url.pathname.startsWith("/api/") && !allowed(origin)) {
      return new Response("Origin not allowed", { status: 403 });
    }
    const CORS = corsHeaders(origin, !env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/api/lobby" && request.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").slice(0, LIMITS.lobbyQuery);
      const cursor = url.searchParams.get("cursor");
      const world = env.WORLD_DO.get(env.WORLD_DO.idFromName(WORLD_OBJECT_NAME));
      const page = await world.list(query, cursor, net);
      return Response.json(page, { headers: { ...CORS, "Cache-Control": "no-store" } });
    }

    if (url.pathname === "/api/ws/global") {
      return forward(request, env, "nearby", "global", nearbyObjectName(net), net);
    }

    const room = url.pathname.match(/^\/api\/ws\/room\/([^/]+)$/)?.[1];
    if (room !== undefined) {
      if (!ROOM_ID_RE.test(room)) return new Response("Invalid room code", { status: 400 });
      return forward(request, env, "private", room, privateObjectName(room), net);
    }

    if (url.pathname.startsWith("/api/ws")) {
      // Pre-v2 clients (/api/ws, /api/ws/:name). Tell them to refresh.
      return new Response("ZeroRelay was updated. Please refresh the page.", { status: 410 });
    }

    return new Response("ZeroRelay signaling", { status: 200 });
  },
};

function forward(
  request: Request,
  env: Env,
  kind: RoomKind,
  roomId: string,
  objectName: string,
  net: string,
): Promise<Response> {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return Promise.resolve(new Response("Expected WebSocket upgrade", { status: 426 }));
  }
  // Overwrite (never trust) the internal routing headers.
  const headers = new Headers(request.headers);
  headers.set(HEADER.kind, kind);
  headers.set(HEADER.room, roomId);
  headers.set(HEADER.net, net);
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(objectName));
  return stub.fetch(new Request(request, { headers }));
}
