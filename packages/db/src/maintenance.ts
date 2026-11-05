/** Retention (foundations §7) and dead letters. Services run `kit.purge` daily as a job. */
import { uuidv7 } from "@nearpay-internal/ids";
import { type Kysely, sql, type Transaction } from "kysely";
import type { KitTables } from "./tables.js";

export const RETENTION = { outboxPublishedDays: 7, inboxDays: 14, idempotencyHours: 24 } as const;

export async function purgeKitTables<DB>(
  dbIn: Kysely<DB>,
): Promise<{ outbox: number; inbox: number; idempotency: number }> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const o =
    await sql`delete from outbox where published_at is not null and published_at < now() - make_interval(days => ${RETENTION.outboxPublishedDays})`.execute(
      db,
    );
  const i =
    await sql`delete from inbox where received_at < now() - make_interval(days => ${RETENTION.inboxDays})`.execute(db);
  const k =
    await sql`delete from idempotency_keys where created_at < now() - make_interval(hours => ${RETENTION.idempotencyHours})`.execute(
      db,
    );
  return {
    outbox: Number(o.numAffectedRows ?? 0n),
    inbox: Number(i.numAffectedRows ?? 0n),
    idempotency: Number(k.numAffectedRows ?? 0n),
  };
}

export async function recordDeadLetter<DB>(
  dbIn: Kysely<DB> | Transaction<DB>,
  d: { source: string; subject?: string | null; payload: unknown; error: string },
): Promise<string> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const id = uuidv7();
  await db
    .insertInto("dead_letters")
    .values({
      id,
      source: d.source,
      subject: d.subject ?? null,
      payload: JSON.stringify(d.payload ?? null),
      error: d.error,
    })
    .execute();
  return id;
}

/** Open dead letters (metric `dead_letters_open`). */
export async function deadLettersOpen<DB>(dbIn: Kysely<DB>): Promise<number> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const r = await sql<{ n: string }>`select count(*)::text as n from dead_letters where resolved_at is null`.execute(
    db,
  );
  return Number(r.rows[0]?.n ?? 0);
}
