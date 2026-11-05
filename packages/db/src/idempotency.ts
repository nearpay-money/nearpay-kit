/**
 * Idempotency keys (api-conventions §4, foundations §7):
 *  1. insert `in_progress` with a 60 s lock (own short transaction);
 *     existing row: same hash + completed → replay; same hash + locked → 409 in progress;
 *     same hash + lock expired → take over; different hash → 409 key reused.
 *  2. run the handler (side effects use derived keys `<key>:<step>`);
 *  3. store status + body (envelope-encrypted, L-F-03) as `completed`.
 * Handler exceptions and 5xx responses release the key so a retry can run again.
 */
import { createHash } from "node:crypto";
import { type Kysely, sql } from "kysely";
import type { EnvelopeCipher } from "./crypto.js";
import type { KitTables } from "./tables.js";

export class IdempotencyConflict extends Error {
  constructor(readonly code: "idempotency_in_progress" | "idempotency_key_reused") {
    super(code);
    this.name = "IdempotencyConflict";
  }
}

/** Canonical JSON: object keys sorted recursively (arrays keep order). */
export function canonicalJson(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

/** SHA-256 of method + path + canonical body. */
export function requestHash(method: string, path: string, body: unknown): Buffer {
  return createHash("sha256")
    .update(`${method.toUpperCase()} ${path}\n${canonicalJson(body ?? null)}`)
    .digest();
}

export interface IdempotencyContext {
  accountId: string;
  livemode: boolean;
  key: string;
  requestHash: Buffer;
  cipher: EnvelopeCipher;
  lockSeconds?: number;
}

export interface StoredResponse {
  status: number;
  body: unknown;
}

const aadOf = (c: IdempotencyContext) => `idem:${c.accountId}:${c.livemode}:${c.key}`;

export async function withIdempotency<DB>(
  dbIn: Kysely<DB>,
  ctx: IdempotencyContext,
  handler: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  const db = dbIn as unknown as Kysely<KitTables>;
  if (ctx.key.length === 0 || ctx.key.length > 255) throw new RangeError("Idempotency-Key must be 1–255 characters");
  const lock = sql`now() + make_interval(secs => ${ctx.lockSeconds ?? 60})`;

  const claimed = await db
    .insertInto("idempotency_keys")
    .values({
      account_id: ctx.accountId,
      livemode: ctx.livemode,
      key: ctx.key,
      request_hash: ctx.requestHash,
      state: "in_progress",
      locked_until: lock as never,
    })
    .onConflict((oc) => oc.columns(["account_id", "livemode", "key"]).doNothing())
    .executeTakeFirst();

  if (Number(claimed.numInsertedOrUpdatedRows ?? 0n) === 0) {
    const row = await db
      .selectFrom("idempotency_keys")
      .select([
        "request_hash",
        "state",
        "response_status",
        "response_body_enc",
        sql<boolean>`locked_until > now()`.as("locked"),
      ])
      .where("account_id", "=", ctx.accountId)
      .where("livemode", "=", ctx.livemode)
      .where("key", "=", ctx.key)
      .executeTakeFirst();
    if (!row) return withIdempotency(dbIn, ctx, handler); // purged between statements: claim again
    if (!row.request_hash.equals(ctx.requestHash)) throw new IdempotencyConflict("idempotency_key_reused");
    if (row.state === "completed") {
      const body = row.response_body_enc
        ? JSON.parse(ctx.cipher.decrypt(row.response_body_enc, aadOf(ctx)).toString("utf8"))
        : null;
      return { status: row.response_status ?? 200, body, replayed: true };
    }
    if (row.locked) throw new IdempotencyConflict("idempotency_in_progress");
    const taken = await db
      .updateTable("idempotency_keys")
      .set({ locked_until: lock as never })
      .where("account_id", "=", ctx.accountId)
      .where("livemode", "=", ctx.livemode)
      .where("key", "=", ctx.key)
      .where("state", "=", "in_progress")
      .where(sql<boolean>`locked_until <= now()`)
      .executeTakeFirst();
    if (Number(taken.numUpdatedRows) === 0) throw new IdempotencyConflict("idempotency_in_progress");
  }

  const release = () =>
    db
      .deleteFrom("idempotency_keys")
      .where("account_id", "=", ctx.accountId)
      .where("livemode", "=", ctx.livemode)
      .where("key", "=", ctx.key)
      .where("state", "=", "in_progress")
      .execute();

  let res: StoredResponse;
  try {
    res = await handler();
  } catch (e) {
    await release();
    throw e;
  }
  if (res.status >= 500) {
    await release();
    return { ...res, replayed: false };
  }
  await db
    .updateTable("idempotency_keys")
    .set({
      state: "completed",
      response_status: res.status,
      response_body_enc: ctx.cipher.encrypt(JSON.stringify(res.body ?? null), aadOf(ctx)),
    })
    .where("account_id", "=", ctx.accountId)
    .where("livemode", "=", ctx.livemode)
    .where("key", "=", ctx.key)
    .execute();
  return { ...res, replayed: false };
}

export interface IdempotencyStoreScope {
  accountId: string;
  livemode: boolean;
  key: string;
  method: string;
  path: string;
  body: unknown;
}

/**
 * Adapter for `@nearpay-internal/service`'s automatic idempotency: hashes method + path + body and
 * runs the handler under `withIdempotency` (results encrypted with `cipher`).
 */
export function idempotencyStore<DB>(db: Kysely<DB>, cipher: EnvelopeCipher, opts: { lockSeconds?: number } = {}) {
  return {
    run(
      scope: IdempotencyStoreScope,
      fn: () => Promise<StoredResponse>,
    ): Promise<StoredResponse & { replayed: boolean }> {
      return withIdempotency(
        db,
        {
          accountId: scope.accountId,
          livemode: scope.livemode,
          key: scope.key,
          requestHash: requestHash(scope.method, scope.path, scope.body),
          cipher,
          ...(opts.lockSeconds !== undefined ? { lockSeconds: opts.lockSeconds } : {}),
        },
        fn,
      );
    },
  };
}
