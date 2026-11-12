/**
 * Plain-SQL migrations (foundations §2, §7): `NNNN_name.sql` files applied in order, each in its
 * own transaction, under an advisory lock (one migrator at a time). Applied files are checksummed;
 * editing an applied file is drift and fails the run.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Kysely, sql } from "kysely";
import { KIT_MIGRATIONS, type KitTables } from "./tables.js";

const FILE_RE = /^(\d{4}_[a-z0-9_]+)\.sql$/;
const LOCK = "nearpay:migrate";

interface Migration {
  version: string;
  sql: string;
  checksum: string;
}

const checksum = (s: string) => createHash("sha256").update(s).digest("hex");

function load(dir: string | null): Migration[] {
  const out: Migration[] = KIT_MIGRATIONS.map((m) => ({ ...m, checksum: checksum(m.sql) }));
  if (dir) {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const m = FILE_RE.exec(f);
      if (!m) throw new Error(`migration file name must be NNNN_name.sql: ${f}`);
      const version = m[1] as string;
      if (version.startsWith("0000_")) throw new Error(`0000_ is reserved for kit migrations: ${f}`);
      const text = readFileSync(join(dir, f), "utf8");
      out.push({ version, sql: text, checksum: checksum(text) });
    }
  }
  // Kit migrations all use the reserved 0000_ number (ordered by KIT_MIGRATIONS); service files need unique numbers.
  const seen = new Set<string>();
  for (const m of out.slice(KIT_MIGRATIONS.length)) {
    const n = m.version.slice(0, 4);
    if (seen.has(n)) throw new Error(`duplicate migration number ${n}`);
    seen.add(n);
  }
  return out;
}

async function ensureTable(db: Kysely<KitTables>): Promise<void> {
  await sql`create table if not exists schema_migrations (version text primary key, checksum text not null, applied_at timestamptz not null default now())`.execute(
    db,
  );
}

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  /** Applied versions whose file changed, or that no longer exist. */
  drift: string[];
}

export async function migrationStatus<DB>(dbIn: Kysely<DB>, dir: string | null): Promise<MigrationStatus> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const all = load(dir);
  const exists = await sql<{ t: string | null }>`select to_regclass('schema_migrations')::text as t`.execute(db);
  const rows = exists.rows[0]?.t
    ? await db.selectFrom("schema_migrations").select(["version", "checksum"]).execute()
    : [];
  const applied = new Map(rows.map((r) => [r.version, r.checksum]));
  const known = new Map(all.map((m) => [m.version, m.checksum]));
  return {
    applied: [...applied.keys()].sort(),
    pending: all.filter((m) => !applied.has(m.version)).map((m) => m.version),
    drift: [...applied.entries()].filter(([v, c]) => known.get(v) !== c).map(([v]) => v),
  };
}

/** Applies pending migrations (kit tables first). Returns the versions applied. */
export async function migrate<DB>(
  dbIn: Kysely<DB>,
  dir: string | null,
  log: (msg: string) => void = () => {},
): Promise<string[]> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const all = load(dir);
  return db.connection().execute(async (conn) => {
    await sql`select pg_advisory_lock(hashtext(${LOCK}))`.execute(conn);
    try {
      await ensureTable(conn);
      const status = await migrationStatus(conn, dir);
      if (status.drift.length)
        throw new Error(`migration drift (applied files changed or removed): ${status.drift.join(", ")}`);
      const done: string[] = [];
      for (const m of all.filter((x) => status.pending.includes(x.version))) {
        await conn.transaction().execute(async (tx) => {
          await sql.raw(m.sql).execute(tx);
          await tx.insertInto("schema_migrations").values({ version: m.version, checksum: m.checksum }).execute();
        });
        log(`applied ${m.version}`);
        done.push(m.version);
      }
      return done;
    } finally {
      await sql`select pg_advisory_unlock(hashtext(${LOCK}))`.execute(conn);
    }
  });
}
