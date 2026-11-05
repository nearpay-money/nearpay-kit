/** End to end: a service with automatic idempotency on real Postgres (kit tables + idempotencyStore). */
import { randomBytes } from "node:crypto";
import { createCheckoutSession, ErrorEnvelope } from "@nearpay/spec";
import type { ClaimsInput } from "@nearpay-internal/auth";
import {
  createDb,
  createEnvelopeCipher,
  type Database,
  idempotencyStore,
  type KitTables,
  migrate,
  migrationStatus,
  requestHash,
  sql,
} from "@nearpay-internal/db";
import { newId, toUuid } from "@nearpay-internal/ids";
import { checkoutSession, mintTestToken, type Started, startPostgres, testKeySource } from "@nearpay-internal/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError, createService, implement, type Service } from "../src/index.js";

let pg: Started;
let database: Database<KitTables>;
let service: Service;
let runs = 0;
let fail = false;

const ACCT = newId("acct");
const token = (over: Partial<ClaimsInput> = {}) =>
  mintTestToken({ sub: newId("key"), acct: ACCT, lm: false, ptype: "secret_key", scp: [], ...over });
const body = { amount: 500, currency: "usd", success_url: "https://merchant.example/ok" };

beforeAll(async () => {
  pg = await startPostgres();
  database = createDb<KitTables>({ url: pg.url, applicationName: "service-int" });
  await migrate(database.db, null);
  service = createService({
    name: "payments",
    config: { env: "test", logLevel: "silent", host: "127.0.0.1", port: 0, metricsPort: 0 },
    keys: testKeySource(),
    idempotency: idempotencyStore(database.db, createEnvelopeCipher(randomBytes(32))),
    readiness: {
      db: () => sql`select 1`.execute(database.db),
      migrations: async () => {
        const s = await migrationStatus(database.db, null);
        if (s.pending.length || s.drift.length)
          throw new Error(`pending ${s.pending.join(",")} drift ${s.drift.join(",")}`);
      },
    },
    routes: [
      implement(createCheckoutSession, async (ctx) => {
        runs++;
        if (fail) throw new ApiError("rail_unavailable");
        return checkoutSession({ amount: ctx.body.amount as number, livemode: ctx.livemode });
      }),
    ],
  });
  service.onShutdown(() => database.close());
});

afterAll(async () => {
  await service?.stop();
  await pg?.stop();
});

const post = async (key: string | undefined, payload: unknown = body, t?: string) =>
  service.app.inject({
    method: "POST",
    url: "/v1/checkout/sessions",
    payload: payload as object,
    headers: { "x-nearpay-token": t ?? (await token()), ...(key ? { "idempotency-key": key } : {}) },
  });

describe("service + Postgres idempotency", () => {
  it("is ready once the database answers and migrations are applied", async () => {
    const r = await service.app.inject("/readyz");
    expect([r.statusCode, r.json()]).toEqual([200, { status: "ready", checks: { db: "ok", migrations: "ok" } }]);
  });

  it("replays a completed request with the same status and body", async () => {
    runs = 0;
    const first = await post("order-1");
    const second = await post("order-1");
    expect(first.statusCode).toBe(201);
    expect([second.statusCode, second.headers["idempotent-replayed"]]).toEqual([201, "true"]);
    expect(second.json()).toEqual(first.json());
    expect(runs).toBe(1);
    const stored = await database.db
      .selectFrom("idempotency_keys")
      .selectAll()
      .where("key", "=", "order-1")
      .executeTakeFirstOrThrow();
    expect(stored.state).toBe("completed");
    expect(stored.response_body_enc?.toString("utf8")).not.toContain("checkout_session");
  });

  it("rejects the same key with a different body", async () => {
    await post("order-2");
    const r = await post("order-2", { ...body, amount: 501 });
    expect([r.statusCode, ErrorEnvelope.parse(r.json()).error.code]).toEqual([409, "idempotency_key_reused"]);
  });

  it("keeps keys apart per livemode and account", async () => {
    runs = 0;
    await post("shared");
    const live = await post("shared", body, await token({ lm: true }));
    const other = await post("shared", body, await token({ acct: newId("acct") }));
    expect([live.statusCode, other.statusCode]).toEqual([201, 201]);
    expect(live.headers["idempotent-replayed"]).toBeUndefined();
    expect(live.json().livemode).toBe(true);
    expect(runs).toBe(3);
  });

  it("releases the key when the handler fails, so a retry runs again", async () => {
    runs = 0;
    fail = true;
    const r1 = await post("order-3");
    expect([r1.statusCode, ErrorEnvelope.parse(r1.json()).error.code]).toEqual([503, "rail_unavailable"]);
    fail = false;
    const r2 = await post("order-3");
    expect([r2.statusCode, r2.headers["idempotent-replayed"]]).toEqual([201, undefined]);
    expect(runs).toBe(2);
  });

  it("reports in-progress requests with Retry-After", async () => {
    await database.db
      .insertInto("idempotency_keys")
      .values({
        account_id: toUuid(ACCT),
        livemode: false,
        key: "locked",
        request_hash: requestHash("POST", "/v1/checkout/sessions", body),
        state: "in_progress",
        locked_until: sql`now() + interval '1 minute'` as never,
      })
      .execute();
    const r = await post("locked");
    expect([r.statusCode, r.headers["retry-after"], ErrorEnvelope.parse(r.json()).error.code]).toEqual([
      409,
      "1",
      "idempotency_in_progress",
    ]);
  });

  it("runs requests without a key directly", async () => {
    runs = 0;
    await post(undefined);
    await post(undefined);
    expect(runs).toBe(2);
  });
});
