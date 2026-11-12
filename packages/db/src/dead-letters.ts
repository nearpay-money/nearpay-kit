/**
 * Dead-letter inspection, replay and drop (audit KIT-7), plus the outbox `show | skip` operator commands (KIT-6), as
 * building blocks for every service's ops CLI (`ops <svc> dead-letters …`, `ops <svc> outbox …`).
 *
 * Replay by source:
 * - `consumer:*` (bus messages that exhausted their deliveries, `deadLetterSink`): the stored envelope is validated and
 *   handed to the service's handler, which must dedupe through the inbox (`inboxHandler`) — so a replay is idempotent;
 * - `outbox` (rows the relay moved aside): the envelope is put back in the outbox under its event id (`Nats-Msg-Id`
 *   de-duplication and consumer inboxes keep it idempotent) and the relay publishes it;
 * - `job:<kind>`: the job is re-armed (`attempts = 0`, due now), or re-enqueued if its row is gone;
 * - anything else: a handler from `sources` (matched by exact source, then by the prefix before `:`).
 * A dead letter is marked `resolved_at`, `resolution = 'replayed' | 'dropped'`, `resolved_by`, `resolution_note`.
 */
import { toUuid, uuidv7 } from "@nearpay-internal/ids";
import { EventEnvelope } from "@nearpay-internal/spec";
import { type Kysely, sql } from "kysely";
import type { Envelope } from "./outbox.js";
import type { KitTables } from "./tables.js";

const CHANNEL = "nearpay_outbox";

export interface DeadLetterRow {
  id: string;
  source: string;
  subject: string | null;
  payload: unknown;
  error: string;
  created_at: Date;
  resolved_at: Date | null;
  resolution: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface ListDeadLettersOptions {
  /** Exact source, or a prefix ending in `:` / `*` (e.g. `consumer:` or `job:*`). */
  source?: string;
  /** Include resolved ones (default false). */
  all?: boolean;
  /** Default 50, at most 500. */
  limit?: number;
}

export async function listDeadLetters<DB>(dbIn: Kysely<DB>, o: ListDeadLettersOptions = {}): Promise<DeadLetterRow[]> {
  const db = dbIn as unknown as Kysely<KitTables>;
  let q = db.selectFrom("dead_letters").selectAll();
  if (!o.all) q = q.where("resolved_at", "is", null);
  if (o.source) {
    const prefix = o.source.endsWith("*") ? o.source.slice(0, -1) : o.source.endsWith(":") ? o.source : null;
    q = prefix ? q.where(sql<boolean>`left(source, ${prefix.length}) = ${prefix}`) : q.where("source", "=", o.source);
  }
  const limit = Math.min(Math.max(o.limit ?? 50, 1), 500);
  return (await q.orderBy("created_at", "desc").orderBy("id", "desc").limit(limit).execute()) as DeadLetterRow[];
}

export async function getDeadLetter<DB>(dbIn: Kysely<DB>, id: string): Promise<DeadLetterRow | null> {
  const db = dbIn as unknown as Kysely<KitTables>;
  return ((await db.selectFrom("dead_letters").selectAll().where("id", "=", id).executeTakeFirst()) ??
    null) as DeadLetterRow | null;
}

export class DeadLetterError extends Error {
  constructor(
    readonly code: "not_found" | "already_resolved" | "not_replayable" | "no_handler",
    message: string,
  ) {
    super(message);
    this.name = "DeadLetterError";
  }
}

export interface ReplayHandlers {
  /** Re-runs a consumer dead letter (`consumer:*`): the service's event handler, deduped through the inbox. */
  consumer?: (envelope: Envelope) => Promise<void>;
  /** Handlers for other sources (exact source first, then the prefix before `:`). */
  sources?: Record<string, (row: DeadLetterRow) => Promise<void>>;
}

export interface ResolveOptions {
  /** Who did it (operator id, `cli:<user>`); recorded in `resolved_by`. */
  actor: string;
  note?: string;
  /** Replay or drop a dead letter that is already resolved (default false). */
  force?: boolean;
}

function parseEnvelope(raw: unknown, id: string): Envelope {
  const r = EventEnvelope.safeParse(raw);
  if (!r.success) {
    throw new DeadLetterError(
      "not_replayable",
      `dead letter ${id} does not hold a valid event envelope (it was dead-lettered as unparseable); drop it instead`,
    );
  }
  return r.data;
}

async function load(db: Kysely<KitTables>, id: string, force: boolean): Promise<DeadLetterRow> {
  const row = (await db.selectFrom("dead_letters").selectAll().where("id", "=", id).executeTakeFirst()) as
    | DeadLetterRow
    | undefined;
  if (!row) throw new DeadLetterError("not_found", `no dead letter ${id}`);
  if (row.resolved_at && !force)
    throw new DeadLetterError("already_resolved", `dead letter ${id} was already ${row.resolution ?? "resolved"}`);
  return row;
}

async function resolve(
  db: Kysely<KitTables>,
  id: string,
  resolution: "replayed" | "dropped",
  o: ResolveOptions,
): Promise<DeadLetterRow> {
  return (await db
    .updateTable("dead_letters")
    .set({ resolved_at: sql`now()`, resolution, resolved_by: o.actor, resolution_note: o.note ?? null })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow()) as DeadLetterRow;
}

/**
 * Puts a stored envelope back in the outbox under its own event id, at the end of the queue. Returns false when that
 * event id is still pending (nothing to do).
 */
export async function requeueOutboxEnvelope<DB>(dbIn: Kysely<DB>, envelope: Envelope): Promise<boolean> {
  const db = dbIn as unknown as Kysely<KitTables>;
  return db.transaction().execute(async (tx) => {
    const r = await tx
      .insertInto("outbox")
      .values({
        id: envelope.id,
        subject: envelope.subject,
        aggregate_type: envelope.aggregate.type,
        aggregate_id: toUuid(envelope.aggregate.id),
        aggregate_version: envelope.aggregate.version,
        account_id: envelope.account_id,
        livemode: envelope.livemode,
        payload: JSON.stringify(envelope),
        trace: envelope.trace ? JSON.stringify(envelope.trace) : null,
      })
      .onConflict((oc) =>
        oc
          .column("id")
          .doUpdateSet({
            published_at: null,
            attempts: 0,
            last_error: null,
            first_failed_at: null,
            created_at: sql`now()`,
          })
          .where("outbox.published_at", "is not", null),
      )
      .executeTakeFirst();
    await sql`select pg_notify(${CHANNEL}, '')`.execute(tx);
    return Number(r.numInsertedOrUpdatedRows ?? 0n) === 1;
  });
}

/** Replays one dead letter (see the module comment); marks it `replayed` once the replay succeeded. */
export async function replayDeadLetter<DB>(
  dbIn: Kysely<DB>,
  id: string,
  handlers: ReplayHandlers,
  o: ResolveOptions,
): Promise<DeadLetterRow> {
  const db = dbIn as unknown as Kysely<KitTables>;
  const row = await load(db, id, o.force ?? false);
  const custom = handlers.sources?.[row.source] ?? handlers.sources?.[row.source.split(":")[0] ?? ""];
  if (custom) {
    await custom(row);
  } else if (row.source.startsWith("consumer:") || row.source === "consumer") {
    if (!handlers.consumer)
      throw new DeadLetterError("no_handler", `no consumer handler to replay ${row.source} dead letters`);
    await handlers.consumer(parseEnvelope(row.payload, id));
  } else if (row.source === "outbox") {
    const p = row.payload as { envelope?: unknown } | null;
    await requeueOutboxEnvelope(db, parseEnvelope(p?.envelope, id));
  } else if (row.source.startsWith("job:")) {
    const kind = row.source.slice("job:".length);
    const p = (row.payload ?? {}) as { job_id?: string; payload?: unknown };
    const rearmed = p.job_id
      ? await sql`update jobs set done_at = null, attempts = 0, run_at = now(), locked_by = null, locked_until = null,
          last_error = null where id = ${p.job_id}::uuid and kind = ${kind}`.execute(db)
      : null;
    if (!rearmed || Number(rearmed.numAffectedRows ?? 0n) === 0) {
      await db
        .insertInto("jobs")
        .values({ id: uuidv7(), kind, payload: JSON.stringify(p.payload ?? null), run_at: sql`now()` as never })
        .execute();
    }
  } else {
    throw new DeadLetterError("no_handler", `no replay handler for source ${row.source}`);
  }
  return resolve(db, id, "replayed", o);
}

/** Marks a dead letter `dropped` (the operator decided it needs no replay). */
export async function dropDeadLetter<DB>(dbIn: Kysely<DB>, id: string, o: ResolveOptions): Promise<DeadLetterRow> {
  const db = dbIn as unknown as Kysely<KitTables>;
  await load(db, id, o.force ?? false);
  return resolve(db, id, "dropped", o);
}

// ---------------------------------------------------------------------------------------------
// Outbox operator commands (KIT-6)
// ---------------------------------------------------------------------------------------------

export interface PendingOutboxRow {
  id: string;
  subject: string;
  aggregate_type: string;
  aggregate_version: number;
  created_at: Date;
  attempts: number;
  last_error: string | null;
  first_failed_at: Date | null;
}

/** The head of the outbox: unpublished rows in relay order, with their failure counts. */
export async function pendingOutbox<DB>(dbIn: Kysely<DB>, limit = 20): Promise<PendingOutboxRow[]> {
  const db = dbIn as unknown as Kysely<KitTables>;
  return db
    .selectFrom("outbox")
    .select([
      "id",
      "subject",
      "aggregate_type",
      "aggregate_version",
      "created_at",
      "attempts",
      "last_error",
      "first_failed_at",
    ])
    .where("published_at", "is", null)
    .orderBy("created_at")
    .orderBy("id")
    .limit(Math.min(Math.max(limit, 1), 500))
    .execute();
}

/** Moves one unpublished outbox row to `dead_letters` by hand (the relay does this itself for poison rows). */
export async function skipOutboxRow<DB>(
  dbIn: Kysely<DB>,
  outboxId: string,
  o: { actor: string; reason: string },
): Promise<{ deadLetterId: string }> {
  const db = dbIn as unknown as Kysely<KitTables>;
  return db.transaction().execute(async (tx) => {
    const row = await tx
      .selectFrom("outbox")
      .select(["id", "subject", "payload", "attempts", "last_error"])
      .where("id", "=", outboxId)
      .where("published_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new DeadLetterError("not_found", `no unpublished outbox row ${outboxId}`);
    const deadLetterId = uuidv7();
    await tx
      .insertInto("dead_letters")
      .values({
        id: deadLetterId,
        source: "outbox",
        subject: row.subject,
        payload: JSON.stringify({ outbox_id: row.id, envelope: row.payload }),
        error: `skipped by ${o.actor}: ${o.reason}${row.last_error ? ` (last error after ${row.attempts} attempts: ${row.last_error})` : ""}`,
      })
      .execute();
    await tx.deleteFrom("outbox").where("id", "=", row.id).execute();
    return { deadLetterId };
  });
}

// ---------------------------------------------------------------------------------------------
// CLI building block
// ---------------------------------------------------------------------------------------------

export const DEAD_LETTER_USAGE = `  dead-letters list [--source <s|prefix:>] [--all] [--limit <n>]   open dead letters, newest first
  dead-letters show <id>                                          one dead letter with its payload
  dead-letters replay <id> [--note <text>] [--force]              re-run it (consumer handler via inbox, outbox requeue, job re-arm)
  dead-letters drop <id> --note <reason> [--force]                resolve it without replay
  outbox show [--limit <n>]                                       unpublished rows in relay order, with attempts and last error
  outbox skip <id> --note <reason>                                move one unpublished row to dead letters`;

export class KitOpsUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KitOpsUsageError";
  }
}

function flags(args: readonly string[]): { positionals: string[]; opts: Record<string, string | true> } {
  const positionals: string[] = [];
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (!a.startsWith("--")) {
      positionals.push(a);
      continue;
    }
    const key = a.slice(2);
    if (key === "all" || key === "force") opts[key] = true;
    else {
      const v = args[i + 1];
      if (v === undefined || v.startsWith("--")) throw new KitOpsUsageError(`--${key} needs a value`);
      opts[key] = v;
      i++;
    }
  }
  return { positionals, opts };
}

const str = (v: string | true | undefined) => (typeof v === "string" ? v : undefined);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const needId = (id: string | undefined, what: string): string => {
  if (!id || !UUID_RE.test(id)) throw new KitOpsUsageError(`missing or malformed ${what} id (a uuid)`);
  return id;
};

/**
 * Runs `dead-letters …` / `outbox …` for a service ops CLI and returns a JSON-able result; throws `KitOpsUsageError`
 * (print usage, exit 2) or `DeadLetterError` (exit 1). `command` is `dead-letters` or `outbox`; `args` the rest.
 */
export async function runKitOps<DB>(
  db: Kysely<DB>,
  command: string,
  args: readonly string[],
  o: { actor: string; handlers?: ReplayHandlers },
): Promise<unknown> {
  const { positionals, opts } = flags(args);
  const [sub, id] = positionals;
  if (command === "dead-letters") {
    switch (sub) {
      case "list": {
        const limit = str(opts.limit) ? Number(str(opts.limit)) : undefined;
        if (limit !== undefined && !Number.isInteger(limit)) throw new KitOpsUsageError("--limit must be an integer");
        return listDeadLetters(db, {
          ...(str(opts.source) ? { source: str(opts.source) as string } : {}),
          all: opts.all === true,
          ...(limit !== undefined ? { limit } : {}),
        });
      }
      case "show": {
        const row = await getDeadLetter(db, needId(id, "dead letter"));
        if (!row) throw new DeadLetterError("not_found", `no dead letter ${id}`);
        return row;
      }
      case "replay":
        return replayDeadLetter(db, needId(id, "dead letter"), o.handlers ?? {}, {
          actor: o.actor,
          ...(str(opts.note) ? { note: str(opts.note) as string } : {}),
          force: opts.force === true,
        });
      case "drop": {
        const note = str(opts.note);
        if (!note) throw new KitOpsUsageError("drop needs --note <reason>");
        return dropDeadLetter(db, needId(id, "dead letter"), { actor: o.actor, note, force: opts.force === true });
      }
      default:
        throw new KitOpsUsageError(`unknown dead-letters command ${sub ?? "(none)"}`);
    }
  }
  if (command === "outbox") {
    switch (sub) {
      case "show": {
        const limit = str(opts.limit) ? Number(str(opts.limit)) : 20;
        if (!Number.isInteger(limit)) throw new KitOpsUsageError("--limit must be an integer");
        return pendingOutbox(db, limit);
      }
      case "skip": {
        const note = str(opts.note);
        if (!note) throw new KitOpsUsageError("skip needs --note <reason>");
        return skipOutboxRow(db, needId(id, "outbox row"), { actor: o.actor, reason: note });
      }
      default:
        throw new KitOpsUsageError(`unknown outbox command ${sub ?? "(none)"}`);
    }
  }
  throw new KitOpsUsageError(`unknown command ${command}`);
}
