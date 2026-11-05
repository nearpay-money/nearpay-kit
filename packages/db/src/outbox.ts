/**
 * Transactional outbox (ADR-0004, foundations §7–§8). `emit` writes the event in the same
 * transaction as the state change; the relay publishes pending rows in order and marks them.
 * Every envelope is validated against the spec at emit time (typed per subject when the subject
 * is in the catalogue), so a producer can never put a contract-violating event on the bus.
 */
import { toUuid, uuidv7 } from "@nearpay-internal/ids";
import { EventEnvelope, envelopeOf, SUBJECTS, type Subject } from "@nearpay-internal/spec";
import { type Kysely, sql, type Transaction } from "kysely";
import type pg from "pg";
import { type HeldClient, hold } from "./pooled.js";
import type { KitTables } from "./tables.js";

export type Envelope = ReturnType<typeof EventEnvelope.parse>;

export interface EmitInput {
  subject: string;
  aggregate: { type: string; id: string; version: number };
  /** Merchant account UUID (not the `acct_` id), or null for platform events. */
  accountId: string | null;
  livemode: boolean | null;
  data: { object: unknown; previous?: Record<string, unknown> };
  request?: { id: string | null; idempotency_key: string | null };
  traceparent?: string;
  /** Override for tests; defaults to a fresh UUIDv7. */
  id?: string;
  occurredAt?: Date;
}

const CHANNEL = "nearpay_outbox";

/** Writes an event to the outbox inside `tx`. Returns the envelope that will be published. */
export async function emit<DB>(txIn: Transaction<DB>, input: EmitInput): Promise<Envelope> {
  const tx = txIn as unknown as Transaction<KitTables>;
  const envelope = {
    id: input.id ?? uuidv7(),
    subject: input.subject,
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    account_id: input.accountId,
    livemode: input.livemode,
    aggregate: input.aggregate,
    data: input.data,
    ...(input.request ? { request: input.request } : {}),
    ...(input.traceparent ? { trace: { traceparent: input.traceparent } } : {}),
  };
  if (input.subject in SUBJECTS) envelopeOf(input.subject as Subject).parse(envelope);
  const parsed = EventEnvelope.parse(envelope);
  await tx
    .insertInto("outbox")
    .values({
      id: parsed.id,
      subject: parsed.subject,
      aggregate_type: parsed.aggregate.type,
      aggregate_id: toUuid(parsed.aggregate.id),
      aggregate_version: parsed.aggregate.version,
      account_id: parsed.account_id,
      livemode: parsed.livemode,
      payload: JSON.stringify(parsed),
      trace: parsed.trace ? JSON.stringify(parsed.trace) : null,
      created_at: parsed.occurred_at,
    })
    .execute();
  await sql`select pg_notify(${CHANNEL}, '')`.execute(tx);
  return parsed;
}

export type Publish = (subject: string, envelope: Envelope, msgId: string) => Promise<void>;

export interface RelayOptions<DB> {
  db: Kysely<DB>;
  pool: pg.Pool;
  publish: Publish;
  batchSize?: number;
  pollMs?: number;
  onError?: (e: unknown) => void;
}

/** Seconds since the oldest unpublished event was written (metric `outbox_lag_seconds`). */
export async function outboxLagSeconds<DB>(dbIn: Kysely<DB>): Promise<number> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const r = await sql<{
    lag: string | null;
  }>`select extract(epoch from now() - min(created_at))::text as lag from outbox where published_at is null`.execute(
    db,
  );
  return r.rows[0]?.lag ? Math.max(0, Number(r.rows[0].lag)) : 0;
}

/** Publishes one batch in order; stops at the first failure so ordering holds. Returns rows published. */
export async function relayOnce<DB>(dbIn: Kysely<DB>, publish: Publish, batchSize = 100): Promise<number> {
  const db = dbIn as unknown as Kysely<KitTables>;
  return db.transaction().execute(async (tx) => {
    const rows = await tx
      .selectFrom("outbox")
      .select(["id", "subject", "payload"])
      .where("published_at", "is", null)
      .orderBy("created_at")
      .orderBy("id")
      .limit(batchSize)
      .forUpdate()
      .skipLocked()
      .execute();
    const done: string[] = [];
    let failure: unknown = null;
    for (const r of rows) {
      try {
        await publish(r.subject, r.payload as Envelope, r.id);
        done.push(r.id);
      } catch (e) {
        failure = e;
        break;
      }
    }
    if (done.length) await tx.updateTable("outbox").set({ published_at: sql`now()` }).where("id", "in", done).execute();
    if (failure && done.length === 0) throw failure;
    return done.length;
  });
}

/** Runs the relay until stopped: wakes on NOTIFY from `emit`, polls every `pollMs` as a fallback. */
export function startOutboxRelay<DB>(opts: RelayOptions<DB>): { stop(): Promise<void> } {
  const pollMs = opts.pollMs ?? 500;
  const report = (e: unknown) => {
    try {
      opts.onError?.(e);
    } catch {
      // an error reporter must not stop the relay
    }
  };
  let stopped = false;
  let wake: (() => void) | null = null;
  let listener: HeldClient | null = null;
  const sleep = () =>
    new Promise<void>((r) => {
      const t = setTimeout(r, pollMs);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });

  const listen = async () => {
    let held: HeldClient | null = null;
    try {
      held = hold(await opts.pool.connect());
      const h = held;
      h.on("notification", () => wake?.());
      h.on("error", () => {
        h.destroy();
        if (listener === h) listener = null;
      });
      await h.client.query(`listen ${CHANNEL}`);
      if (h.destroyed) return;
      listener = h;
    } catch (e) {
      held?.destroy();
      report(e);
    }
  };

  const loop = (async () => {
    await listen();
    while (!stopped) {
      try {
        const n = await relayOnce(opts.db, opts.publish, opts.batchSize ?? 100);
        if (n === (opts.batchSize ?? 100)) continue;
      } catch (e) {
        report(e);
      }
      if (!listener && !stopped) await listen();
      if (!stopped) await sleep();
    }
  })();

  return {
    async stop() {
      stopped = true;
      (wake as (() => void) | null)?.();
      await loop;
      // A LISTEN session is never returned to the pool.
      listener?.destroy();
      listener = null;
    },
  };
}
