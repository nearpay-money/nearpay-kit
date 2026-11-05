import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromUuid, newId, uuidv7 } from "@nearpay-internal/ids";
import { execution, type Started, startPostgres } from "@nearpay-internal/testing";
import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  advisoryLeader,
  consume,
  createDb,
  createEnvelopeCipher,
  type Database,
  deadLettersOpen,
  emit,
  enqueueJob,
  IdempotencyConflict,
  type KitTables,
  migrate,
  migrationStatus,
  outboxLagSeconds,
  purgeKitTables,
  recordDeadLetter,
  relayOnce,
  requestHash,
  runDueJobs,
  startJobWorker,
  startOutboxRelay,
  withIdempotency,
  withTx,
} from "../src/index.js";

interface Svc extends KitTables {
  widgets: { id: string; amount: string; big: bigint; version: number };
}

let pg: Started;
let database: Database<Svc>;
let db: Kysely<Svc>;
const migDir = mkdtempSync(join(tmpdir(), "mig-"));

beforeAll(async () => {
  pg = await startPostgres();
  database = createDb<Svc>({ url: pg.url, applicationName: "kit-test" });
  db = database.db;
  writeFileSync(
    join(migDir, "0001_widgets.sql"),
    "create table widgets (id uuid primary key, amount numeric(78,0) not null, big bigint not null, version integer not null default 0);",
  );
});
afterAll(async () => {
  await database?.close();
  await pg?.stop();
});

describe("migrations", () => {
  it("applies kit tables then service files, once, even with concurrent migrators", async () => {
    const [a, b] = await Promise.all([migrate(db, migDir), migrate(createDb<Svc>({ url: pg.url }).db, migDir)]);
    expect([...a, ...b].sort()).toEqual(["0000_kit_shared_tables", "0001_widgets"]);
    expect(await migrate(db, migDir)).toEqual([]);
    expect(await migrationStatus(db, migDir)).toEqual({
      applied: ["0000_kit_shared_tables", "0001_widgets"],
      pending: [],
      drift: [],
    });
  });
  it("reports pending files and refuses drift", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mig2-"));
    writeFileSync(join(dir, "0001_widgets.sql"), "create table widgets (changed boolean);");
    expect((await migrationStatus(db, dir)).drift).toEqual(["0001_widgets"]);
    await expect(migrate(db, dir)).rejects.toThrow(/drift/);
    const dir3 = mkdtempSync(join(tmpdir(), "mig3-"));
    writeFileSync(
      join(dir3, "0001_widgets.sql"),
      "create table widgets (id uuid primary key, amount numeric(78,0) not null, big bigint not null, version integer not null default 0);",
    );
    writeFileSync(join(dir3, "0002_more.sql"), "select 1;");
    expect((await migrationStatus(db, dir3)).pending).toEqual(["0002_more"]);
    const bad = mkdtempSync(join(tmpdir(), "mig4-"));
    writeFileSync(join(bad, "1_bad.sql"), "select 1;");
    await expect(migrationStatus(db, bad)).rejects.toThrow(/NNNN_name/);
  });
  it("enforces the jobs dedupe-key prefix in the database (L-F-05)", async () => {
    await expect(
      sql`insert into jobs (id, kind, run_at, payload, dedupe_key) values (${uuidv7()}, 'a.b', now(), '{}', 'other:1')`.execute(
        db,
      ),
    ).rejects.toThrow(/jobs_dedupe_key_kind/);
  });
});

describe("types (INV-5)", () => {
  it("keeps numeric(78,0) exact and int8 as bigint", async () => {
    const id = uuidv7();
    await db
      .insertInto("widgets")
      .values({ id, amount: `${10n ** 77n}`, big: 9_007_199_254_740_993n, version: 0 })
      .execute();
    const row = await db.selectFrom("widgets").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.amount).toBe(`${10n ** 77n}`);
    expect(row.big).toBe(9_007_199_254_740_993n);
  });
  it("rolls back failed transactions", async () => {
    const id = uuidv7();
    await expect(
      withTx(db, async (tx) => {
        await tx.insertInto("widgets").values({ id, amount: "1", big: 1n, version: 0 }).execute();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.selectFrom("widgets").select("id").where("id", "=", id).executeTakeFirst()).toBeUndefined();
  });
  it("retries serialization failures", async () => {
    const id = uuidv7();
    await db.insertInto("widgets").values({ id, amount: "0", big: 0n, version: 0 }).execute();
    const bump = () =>
      withTx(
        db,
        async (tx) => {
          const r = await tx.selectFrom("widgets").select("amount").where("id", "=", id).executeTakeFirstOrThrow();
          await new Promise((r2) => setTimeout(r2, 20));
          await tx
            .updateTable("widgets")
            .set({ amount: String(BigInt(r.amount) + 1n) })
            .where("id", "=", id)
            .execute();
        },
        { isolation: "serializable", retries: 10 },
      );
    await Promise.all([bump(), bump(), bump()]);
    expect(
      (await db.selectFrom("widgets").select("amount").where("id", "=", id).executeTakeFirstOrThrow()).amount,
    ).toBe("3");
  });
});

describe("outbox", () => {
  beforeEach(async () => {
    await db.deleteFrom("outbox").execute();
  });
  const exec = () => execution();
  const input = (o = exec()) => ({
    subject: "evt.rails.execution.updated",
    aggregate: { type: "execution", id: o.id, version: o.version },
    accountId: uuidv7(),
    livemode: false,
    data: { object: o },
  });

  it("validates envelopes against the spec at emit time", async () => {
    await withTx(db, (tx) => emit(tx, input()));
    await expect(withTx(db, (tx) => emit(tx, { ...input(), data: { object: { nope: true } } }))).rejects.toThrow();
    await expect(withTx(db, (tx) => emit(tx, { ...input(), subject: "not.a.subject" }))).rejects.toThrow();
    expect(await db.selectFrom("outbox").select("id").execute()).toHaveLength(1);
  });

  it("publishes in order, marks rows, and stops at the first failure", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await withTx(db, (tx) => emit(tx, input()))).id);
    const sent: string[] = [];
    let fail = 3;
    const publish = async (_s: string, e: { id: string }) => {
      if (sent.length === fail) throw new Error("bus down");
      sent.push(e.id);
    };
    expect(await relayOnce(db, publish)).toBe(3);
    expect(sent).toEqual(ids.slice(0, 3));
    fail = 99;
    expect(await relayOnce(db, publish)).toBe(2);
    expect(sent).toEqual(ids);
    expect(await relayOnce(db, publish)).toBe(0);
    expect(await outboxLagSeconds(db)).toBe(0);
  });

  it("wakes the relay through NOTIFY within ~100 ms of commit", async () => {
    const got: { id: string; at: number }[] = [];
    const relay = startOutboxRelay({
      db,
      pool: database.pool,
      pollMs: 5_000,
      publish: async (_s, e) => void got.push({ id: e.id, at: Date.now() }),
    });
    await new Promise((r) => setTimeout(r, 300));
    const t0 = Date.now();
    const e = await withTx(db, (tx) => emit(tx, input()));
    while (!got.some((g) => g.id === e.id) && Date.now() - t0 < 3_000) await new Promise((r) => setTimeout(r, 10));
    await relay.stop();
    const hit = got.find((g) => g.id === e.id);
    expect(hit).toBeDefined();
    expect((hit?.at ?? 0) - t0).toBeLessThan(500);
  });

  it("reports lag while events are pending", async () => {
    await withTx(db, (tx) => emit(tx, { ...input(), occurredAt: new Date(Date.now() - 5_000) }));
    expect(await outboxLagSeconds(db)).toBeGreaterThanOrEqual(4);
  });
});

describe("inbox", () => {
  it("consumes each event once", async () => {
    const id = uuidv7();
    expect(await withTx(db, (tx) => consume(tx, id, "evt.x.y.z"))).toBe(true);
    expect(await withTx(db, (tx) => consume(tx, id, "evt.x.y.z"))).toBe(false);
  });
});

describe("idempotency", () => {
  const cipher = createEnvelopeCipher(randomBytes(32));
  const ctx = (key: string, body: unknown = { a: 1 }) => ({
    accountId: uuidv7(),
    livemode: false,
    key,
    requestHash: requestHash("POST", "/v1/x", body),
    cipher,
  });

  it("runs once, then replays the stored response (encrypted at rest)", async () => {
    const c = ctx("k1");
    let runs = 0;
    const h = async () => ({ status: 201, body: { id: ++runs, client_secret: "cs_secret_value" } });
    expect(await withIdempotency(db, c, h)).toEqual({
      status: 201,
      body: { id: 1, client_secret: "cs_secret_value" },
      replayed: false,
    });
    expect(await withIdempotency(db, c, h)).toEqual({
      status: 201,
      body: { id: 1, client_secret: "cs_secret_value" },
      replayed: true,
    });
    expect(runs).toBe(1);
    const raw = await db
      .selectFrom("idempotency_keys")
      .select("response_body_enc")
      .where("key", "=", "k1")
      .executeTakeFirstOrThrow();
    expect(raw.response_body_enc?.includes(Buffer.from("cs_secret_value"))).toBe(false);
  });

  it("rejects the same key with a different body", async () => {
    const c = ctx("k2");
    await withIdempotency(db, c, async () => ({ status: 200, body: {} }));
    await expect(
      withIdempotency(db, { ...c, requestHash: requestHash("POST", "/v1/x", { a: 2 }) }, async () => ({
        status: 200,
        body: {},
      })),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
  });

  it("returns in_progress while another request holds the lock, and lets a retry take over after it expires", async () => {
    const c = { ...ctx("k3"), lockSeconds: 1 };
    let release: () => void = () => {};
    const first = withIdempotency(
      db,
      c,
      () => new Promise((r) => (release = () => r({ status: 200, body: { first: true } }))),
    );
    await new Promise((r) => setTimeout(r, 100));
    await expect(withIdempotency(db, c, async () => ({ status: 200, body: {} }))).rejects.toBeInstanceOf(
      IdempotencyConflict,
    );
    await new Promise((r) => setTimeout(r, 1_100));
    const second = await withIdempotency(db, c, async () => ({ status: 200, body: { second: true } }));
    expect(second.body).toEqual({ second: true });
    release();
    await first;
  });

  it("releases the key when the handler throws or returns 5xx", async () => {
    const c = ctx("k4");
    await expect(withIdempotency(db, c, async () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    expect((await withIdempotency(db, c, async () => ({ status: 503, body: {} }))).replayed).toBe(false);
    expect(await withIdempotency(db, c, async () => ({ status: 200, body: { ok: 1 } }))).toEqual({
      status: 200,
      body: { ok: 1 },
      replayed: false,
    });
  });

  it("isolates keys per account and mode", async () => {
    const c = ctx("shared");
    await withIdempotency(db, c, async () => ({ status: 200, body: { a: 1 } }));
    expect(
      (await withIdempotency(db, { ...c, livemode: true }, async () => ({ status: 200, body: { b: 2 } }))).body,
    ).toEqual({ b: 2 });
    expect(
      (await withIdempotency(db, { ...c, accountId: uuidv7() }, async () => ({ status: 200, body: { c: 3 } }))).body,
    ).toEqual({ c: 3 });
  });
});

describe("jobs", () => {
  beforeEach(async () => {
    await db.deleteFrom("jobs").execute();
    await db.deleteFrom("dead_letters").execute();
  });

  it("dedupes by kind-prefixed key", async () => {
    const a = await enqueueJob(db, {
      kind: "destination.activate",
      payload: { sd: 1 },
      dedupeKey: "destination.activate:sd_1",
    });
    const b = await enqueueJob(db, {
      kind: "destination.activate",
      payload: { sd: 1 },
      dedupeKey: "destination.activate:sd_1",
    });
    expect(b).toEqual({ id: a.id, inserted: false });
    await expect(enqueueJob(db, { kind: "x", payload: {}, dedupeKey: "y:1" })).rejects.toThrow(/must start with/);
    await expect(enqueueJob(db, { kind: "Bad Kind", payload: {} })).rejects.toThrow(/invalid job kind/);
  });

  it("runs due jobs, backs off failures and dead-letters after max attempts", async () => {
    await enqueueJob(db, { kind: "ok", payload: { n: 1 } });
    await enqueueJob(db, { kind: "flaky", payload: {}, maxAttempts: 2 });
    await enqueueJob(db, { kind: "later", payload: {}, runAt: new Date(Date.now() + 60_000) });
    const seen: unknown[] = [];
    const dead: string[] = [];
    const opts = {
      db,
      workerId: "w1",
      handlers: {
        ok: async (p: unknown) => void seen.push(p),
        flaky: async () => Promise.reject(new Error("nope")),
        later: async () => {},
      },
      onDeadLetter: (j: { kind: string }) => void dead.push(j.kind),
    };
    expect(await runDueJobs(opts)).toBe(2);
    expect(seen).toEqual([{ n: 1 }]);
    const flaky = await db.selectFrom("jobs").selectAll().where("kind", "=", "flaky").executeTakeFirstOrThrow();
    expect(flaky.attempts).toBe(1);
    expect(flaky.last_error).toBe("nope");
    expect(flaky.run_at.getTime()).toBeGreaterThan(Date.now() + 5_000);
    await sql`update jobs set run_at = now() where kind = 'flaky'`.execute(db);
    expect(await runDueJobs(opts)).toBe(1);
    expect(dead).toEqual(["flaky"]);
    expect(await deadLettersOpen(db)).toBe(1);
    expect(await runDueJobs(opts)).toBe(0); // done, and "later" is not due
  });

  it("never runs a job twice across competing workers (SKIP LOCKED)", async () => {
    for (let i = 0; i < 60; i++) await enqueueJob(db, { kind: "count", payload: { i } });
    const ran = new Map<number, number>();
    const handler = async (p: unknown) => {
      const i = (p as { i: number }).i;
      ran.set(i, (ran.get(i) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 5));
    };
    const workers = [1, 2, 3].map((n) =>
      startJobWorker({ db, workerId: `w${n}`, handlers: { count: handler }, pollMs: 20, concurrency: 5 }),
    );
    const t0 = Date.now();
    while (ran.size < 60 && Date.now() - t0 < 15_000) await new Promise((r) => setTimeout(r, 20));
    await Promise.all(workers.map((w) => w.stop()));
    expect(ran.size).toBe(60);
    expect([...ran.values()].every((c) => c === 1)).toBe(true);
  });
});

describe("leadership", () => {
  it("elects one leader, fails over on stop and on a killed connection", async () => {
    const state = { a: 0, b: 0 };
    const mk = (who: "a" | "b") =>
      advisoryLeader({
        pool: database.pool,
        name: "test:loop",
        retryMs: 100,
        heartbeatMs: 100,
        run: async (signal) => {
          state[who] += 1;
          await new Promise<void>((r) => signal.addEventListener("abort", () => r()));
        },
      });
    const a = mk("a");
    await new Promise((r) => setTimeout(r, 300));
    const b = mk("b");
    await new Promise((r) => setTimeout(r, 300));
    expect(a.isLeader() !== b.isLeader()).toBe(true);
    const [first, second] = a.isLeader() ? [a, b] : [b, a];
    await first.stop();
    await new Promise((r) => setTimeout(r, 500));
    expect(second.isLeader()).toBe(true);
    // kill the leader's backend: leadership must be lost and re-acquired
    await sql`select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and granted`.execute(db);
    await new Promise((r) => setTimeout(r, 800));
    expect(second.isLeader()).toBe(true);
    expect(state.a + state.b).toBeGreaterThanOrEqual(3);
    await second.stop();
  });
});

describe("pooled connection hygiene", () => {
  it("never returns a LISTEN or lock-holding connection with listeners to the pool", async () => {
    const small = createDb<Svc>({ url: pg.url, max: 2 });
    const relay = startOutboxRelay({ db: small.db, pool: small.pool, publish: async () => {}, pollMs: 50 });
    await new Promise((r) => setTimeout(r, 150));
    await relay.stop();
    const elector = advisoryLeader({
      pool: small.pool,
      name: "test:hygiene",
      retryMs: 50,
      heartbeatMs: 50,
      run: (signal) => new Promise<void>((r) => signal.addEventListener("abort", () => r())),
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(elector.isLeader()).toBe(true);
    await elector.stop();
    const clients = [await small.pool.connect(), await small.pool.connect()];
    for (const c of clients) {
      expect(c.listenerCount("notification")).toBe(0);
      expect(c.listenerCount("error")).toBe(0);
      c.release();
    }
    await small.close();
  });

  it("keeps electing after the leader's connection is killed repeatedly on a one-connection pool", async () => {
    const one = createDb<Svc>({ url: pg.url, max: 1 });
    const errors: unknown[] = [];
    let runs = 0;
    const elector = advisoryLeader({
      pool: one.pool,
      name: "test:one",
      retryMs: 50,
      heartbeatMs: 50,
      onError: (e) => errors.push(e),
      run: async (signal) => {
        runs++;
        await new Promise<void>((r) => signal.addEventListener("abort", () => r()));
      },
    });
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 200));
      expect(elector.isLeader()).toBe(true);
      await sql`select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and granted and objid = hashtext('test:one')::oid`.execute(
        db,
      );
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(elector.isLeader()).toBe(true);
    expect(runs).toBe(4);
    await elector.stop();
    expect(elector.isLeader()).toBe(false);
    expect(errors.every((e) => !String(e).includes("already been released"))).toBe(true);
    await one.close();
  });
});

describe("maintenance", () => {
  it("purges expired rows per retention and records dead letters", async () => {
    await db.deleteFrom("outbox").execute();
    const ex = execution();
    await withTx(db, (tx) =>
      emit(tx, {
        subject: "evt.rails.execution.updated",
        aggregate: { type: "execution", id: ex.id, version: 1 },
        accountId: null,
        livemode: false,
        data: { object: ex },
      }),
    );
    await sql`update outbox set published_at = now() - interval '8 days'`.execute(db);
    await sql`insert into inbox (event_id, subject, received_at) values (${uuidv7()}, 's', now() - interval '15 days')`.execute(
      db,
    );
    const r = await purgeKitTables(db);
    expect(r.outbox).toBe(1);
    expect(r.inbox).toBeGreaterThanOrEqual(1);
    const id = await recordDeadLetter(db, {
      source: "consumer:test",
      subject: "evt.a.b.c",
      payload: { x: 1 },
      error: "bad",
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fromUuid("job", id)).toMatch(/^job_/);
    expect(newId("job")).toMatch(/^job_/);
  });
});
