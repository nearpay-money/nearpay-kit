/**
 * Postgres connection: Kysely over a pg pool with exact numeric types (INV-5), bounded connect/pool-wait time, TCP
 * keepalive and an idle-in-transaction limit (KIT-5).
 */
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";

const INT8 = 20;
const NUMERIC = 1700;

/** int8 → bigint; numeric stays a decimal string (asset base units can exceed 2^64). */
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === INT8) return (v: string) => BigInt(v);
    if (oid === NUMERIC) return (v: string) => v;
    return pg.types.getTypeParser(oid, format as never);
  },
};

export interface DbOptions {
  /** Connection URL, or read from `urlFile` (Docker secret). */
  url?: string;
  urlFile?: string;
  max?: number;
  applicationName?: string;
  /** Server-side statement timeout, ms (default 10 000). */
  statementTimeoutMs?: number;
  /**
   * Time to establish a connection or wait for a free pool slot, ms (default 5 000; KIT-5). Without it a dead DB host
   * hangs every caller — and every background loop — until the OS gives up.
   */
  connectionTimeoutMs?: number;
  /** TCP keepalive on pool connections (default true, first probe after 10 s), so dead peers are noticed (KIT-5). */
  keepAlive?: boolean;
  /**
   * Server-side `idle_in_transaction_session_timeout`, ms (default 60 000; 0 disables): a transaction left idle (a hung
   * client) cannot hold row locks or advisory locks forever (KIT-5).
   */
  idleInTransactionTimeoutMs?: number;
}

export interface Database<DB> {
  readonly db: Kysely<DB>;
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb<DB>(opts: DbOptions): Database<DB> {
  const url = opts.url ?? (opts.urlFile ? readFileSync(opts.urlFile, "utf8").trim() : undefined);
  if (!url) throw new Error("database url or urlFile is required");
  const pool = new pg.Pool({
    connectionString: url,
    max: opts.max ?? 10,
    application_name: opts.applicationName,
    statement_timeout: opts.statementTimeoutMs ?? 10_000,
    connectionTimeoutMillis: opts.connectionTimeoutMs ?? 5_000,
    keepAlive: opts.keepAlive ?? true,
    keepAliveInitialDelayMillis: 10_000,
    idle_in_transaction_session_timeout: opts.idleInTransactionTimeoutMs ?? 60_000,
    types,
  });
  pool.on("error", () => {
    /* idle client errors are surfaced to the next query; never crash the process */
  });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  return {
    db,
    pool,
    close: async () => {
      await db.destroy();
    },
  };
}
