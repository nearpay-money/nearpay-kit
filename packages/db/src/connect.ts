/** Postgres connection: Kysely over a pg pool with exact numeric types (INV-5). */
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
