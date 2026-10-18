import type { LobbyPage } from "../../shared/types";
import { lobbyUrl } from "./endpoints";

/** One page of people on other networks who are visible in the lobby. */
export async function fetchLobby(query = "", cursor?: string | null): Promise<LobbyPage> {
  const url = new URL(lobbyUrl());
  if (query) url.searchParams.set("q", query);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Lobby request failed (${res.status})`);
  return res.json();
}
