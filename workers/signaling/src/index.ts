import { RoomDO } from "./room-do";

export { RoomDO };

interface Env {
  ROOM_DO: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/ws" || url.pathname.startsWith("/api/ws/")) {
      const roomId = url.searchParams.get("roomId") || url.pathname.split("/").pop() || "global";

      if (!request.headers.get("Upgrade")?.toLowerCase().includes("websocket")) {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const doId = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(doId);
      return stub.fetch(request);
    }

    return new Response("ZeroRelay Signaling — use /api/ws/:roomId", { status: 200 });
  },
};
