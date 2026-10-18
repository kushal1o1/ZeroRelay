import { DurableObject } from "cloudflare:workers";
import { LIMITS, type LobbyPage } from "../../../shared/types";
import type { Env } from "./env";

// Worldwide lobby directory. Holds no sockets: Nearby rooms register their
// visible peers here (and refresh them every sweep), the HTTP lobby endpoint
// pages through it, and cross-network signals look up a peer's network here
// to find the Nearby room that holds their socket.
//
// Single instance for now. If it ever becomes a bottleneck, shard by peer-id
// prefix behind the same RPC surface.

/** Entries not refreshed within this window are treated as gone. */
const STALE_MS = 3 * 60_000;
const PRUNE_EVERY_MS = 60_000;

export interface DirectoryEntry {
  id: string;
  name: string;
  netKey: string;
}

export class WorldDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS peers (
        id      TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        name_lc TEXT NOT NULL,
        net     TEXT NOT NULL,
        seen    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS peers_name ON peers (name_lc, id);
      CREATE INDEX IF NOT EXISTS peers_seen ON peers (seen);
    `);
  }

  /** Insert or refresh entries (called on join and on every room sweep). */
  async upsert(entries: DirectoryEntry[]): Promise<void> {
    const now = Date.now();
    for (const e of entries) {
      this.sql.exec(
        `INSERT INTO peers (id, name, name_lc, net, seen) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_lc = excluded.name_lc,
           net = excluded.net, seen = excluded.seen`,
        e.id,
        e.name,
        e.name.toLowerCase(),
        e.netKey,
        now,
      );
    }
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(now + PRUNE_EVERY_MS);
    }
  }

  async remove(id: string): Promise<void> {
    this.sql.exec("DELETE FROM peers WHERE id = ?", id);
  }

  /** Network key of a live peer, used to route a cross-network signal. */
  async lookup(id: string): Promise<string | null> {
    const rows = this.sql
      .exec<{ net: string }>(
        "SELECT net FROM peers WHERE id = ? AND seen > ?",
        id,
        Date.now() - STALE_MS,
      )
      .toArray();
    return rows[0]?.net ?? null;
  }

  /** One page of the lobby, ordered by name. `excludeNet` hides the caller's
   *  own network (those peers are already in their Nearby room). */
  async list(query: string, cursor: string | null, excludeNet: string): Promise<LobbyPage> {
    const cutoff = Date.now() - STALE_MS;
    const like = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const where = "seen > ? AND net != ? AND name_lc LIKE ? ESCAPE '\\'";

    const total = this.sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM peers WHERE ${where}`, cutoff, excludeNet, like)
      .one().n;

    const [afterName, afterId] = decodeCursor(cursor);
    const rows = this.sql
      .exec<{ id: string; name: string; name_lc: string }>(
        `SELECT id, name, name_lc FROM peers WHERE ${where} AND (name_lc, id) > (?, ?)
         ORDER BY name_lc, id LIMIT ?`,
        cutoff,
        excludeNet,
        like,
        afterName,
        afterId,
        LIMITS.lobbyPage + 1,
      )
      .toArray();

    const page = rows.slice(0, LIMITS.lobbyPage);
    const last = page[page.length - 1];
    return {
      total,
      peers: page.map((r) => ({ id: r.id, name: r.name })),
      next: rows.length > LIMITS.lobbyPage && last ? encodeCursor(last.name_lc, last.id) : null,
    };
  }

  async alarm(): Promise<void> {
    this.sql.exec("DELETE FROM peers WHERE seen <= ?", Date.now() - STALE_MS);
    const left = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM peers").one().n;
    if (left > 0) await this.ctx.storage.setAlarm(Date.now() + PRUNE_EVERY_MS);
  }
}

function encodeCursor(nameLc: string, id: string): string {
  return `${encodeURIComponent(nameLc)}~${id}`;
}

function decodeCursor(cursor: string | null): [string, string] {
  if (!cursor) return ["", ""];
  const sep = cursor.lastIndexOf("~");
  if (sep < 0) return ["", ""];
  try {
    return [decodeURIComponent(cursor.slice(0, sep)), cursor.slice(sep + 1)];
  } catch {
    return ["", ""];
  }
}
