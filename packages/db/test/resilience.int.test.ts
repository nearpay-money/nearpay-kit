/** Resilience fixes from the 2026-11-12 backend audit: KIT-4 (task liveness), KIT-5, KIT-6, KIT-7. */
import { createServer, type Server } from "node:net";
import { uuidv7 } from "@nearpay-internal/ids";
import { execution, type Started, startPostgres } from "@nearpay-internal/testing";
import { type Kysely, sql } from "kysely";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  advisoryLeader,
  createDb,
  type Database,
  DeadLetterError,
  deadLetterSink,
  dropDeadLetter,
  type Envelope,
  emit,
  inboxHandler,
  jobWorkerTask,
  KitOpsUsageError,
  type KitTables,
  leaderTask,
  listDeadLetters,
  migrate,
  type OutboxDeadLetter,
  outboxRelayTask,
  pendingOutbox,
  recurringJobsTask,
  relayOnce,
  replayDeadLetter,
  runDueJobs,
  runKitOps,
  startOutboxRelay,
  withTx,
} from "../src/index.js";

interface Svc extends KitTables {
  flags: { name: string; released: boolean; version: number };
}

let pgc: Started;
let database: Database<Svc>;
let db: Kysely<Svc>;

beforeAll(async () => {
  pgc = await startPostgres();
  database = createDb<Svc>({ url: pgc.url, applicationName: "kit-resilience-test" });
  db = database.db;
  await migrate(db, null);
  await sql`create table flags (name text primary key, released boolean not null, version integer not null)`.execute(
    db,
  );
});
afterAll(async () => {
  await database?.close();
  await pgc?.stop();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean | Promise<boolean>, ms = 5_000) {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error("condition not met");
    await sleep(20);
  }
}

const counter = () => {
  const h = { beats: 0, idles: 0, active: true };
  return {
    h,
    hb: {
      beat: () => {
        h.beats++;
        h.active = true;
      },
      idle: () => {
        h.idles++;
        h.active = false;
      },
    },
  };
};

describe("DB pool (KIT-5)", () => {
  let blackhole: Server;
  const sockets = new Set<import("node:net").Socket>();
  let port = 0;
  beforeAll(async () => {
    // accepts TCP and never answers: a hung DB host
    blackhole = createServer((socket) => {
      sockets.add(socket);
    });
    await new Promise<void>((r) => blackhole.listen(0, "127.0.0.1", r));
    port = (blackhole.address() as { port: number }).port;
  });
  afterAll(() => {
    for (const s of sockets) s.destroy();
    return new Promise<void>((r) => blackhole.close(() => r()));
  });

  it("gives up connecting after connectionTimeoutMs instead of hanging", async () => {
    const dead = createDb({ url: `postgres://u:p@127.0.0.1:${port}/x`, connectionTimeoutMs: 300 });
    const t0 = Date.now();
    await expect(sql`select 1`.execute(dead.db)).rejects.toThrow(/timeout/i);
    expect(Date.now() - t0).toBeLessThan(2_000);
    await dead.close();
  });

  it("enables TCP keepalive and limits idle-in-transaction sessions", async () => {
    expect((database.pool as unknown as { options: { keepAlive: boolean } }).options.keepAlive).toBe(true);
    const r = await sql<{ v: string }>`select current_setting('idle_in_transaction_session_timeout') as v`.execute(db);
    expect(r.rows[0]?.v).toBe("1min");
    const off = createDb({ url: pgc.url, idleInTransactionTimeoutMs: 0 });
    expect(
      (await sql<{ v: string }>`select current_setting('idle_in_transaction_session_timeout') as v`.execute(off.db))
        .rows[0]?.v,
    ).toBe("0");
    await off.close();
  });
});

describe("leadership (KIT-5, KIT-4)", () => {
  it("loses leadership within 2 × heartbeat when the heartbeat query never answers", async () => {
    let hang = false;
    const client = {
      query: async (text: string) => {
        if (text.startsWith("select pg_try_advisory_lock")) return { rows: [{ ok: true }] };
        if (hang) return new Promise(() => {});
        return { rows: [] };
      },
      on: () => {},
      removeListener: () => {},
      release: () => {},
    };
    const pool = { connect: async () => client } as unknown as pg.Pool;
    const errors: string[] = [];
    let aborted = 0;
    const leader = advisoryLeader({
      pool,
      name: "test:hung",
      heartbeatMs: 50,
      retryMs: 10_000,
      onError: (e) => errors.push(String(e)),
      run: (signal) =>
        new Promise<void>((r) =>
          signal.addEventListener("abort", () => {
            aborted++;
            r();
          }),
        ),
    });
    await until(() => leader.isLeader());
    await sleep(120);
    expect(leader.isLeader()).toBe(true); // healthy heartbeats keep it
    hang = true;
    const t0 = Date.now();
    await until(() => !leader.isLeader(), 1_000);
    expect(Date.now() - t0).toBeLessThan(50 + 2 * 50 + 100);
    expect(aborted).toBe(1);
    expect(errors.some((e) => /did not answer within 100 ms/.test(e))).toBe(true);
    await leader.stop();
  });

  it("does not hot-loop when run() throws at once: at most one acquisition per retryMs", async () => {
    let runs = 0;
    const errors: unknown[] = [];
    const leader = advisoryLeader({
      pool: database.pool,
      name: "test:throws",
      retryMs: 200,
      heartbeatMs: 50,
      onError: (e) => errors.push(e),
      run: async () => {
        runs++;
        throw new Error("boom");
      },
    });
    await sleep(1_000);
    await leader.stop();
    expect(runs).toBeGreaterThanOrEqual(2);
    expect(runs).toBeLessThanOrEqual(6); // 1 000 ms / 200 ms + the first
    expect(errors.length).toBe(runs);
  });

  it("a follower is idle (never fails liveness); the leader beats on its heartbeats", async () => {
    const a = counter();
    const b = counter();
    const block = (signal: AbortSignal) => new Promise<void>((r) => signal.addEventListener("abort", () => r()));
    const ta = leaderTask({ pool: database.pool, name: "test:live", retryMs: 50, heartbeatMs: 50, run: block });
    expect(ta.maxSilenceMs).toBe(60_000);
    expect(
      leaderTask({ pool: database.pool, name: "x", run: block, maxSilenceMs: false }).maxSilenceMs,
    ).toBeUndefined();
    const la = await ta.start(a.hb);
    await until(() => a.h.beats >= 3);
    const lb = await leaderTask({
      pool: database.pool,
      name: "test:live",
      retryMs: 50,
      heartbeatMs: 50,
      run: block,
    }).start(b.hb);
    await until(() => b.h.idles >= 2);
    expect(b.h.active).toBe(false);
    expect(b.h.beats).toBe(0);
    expect(a.h.active).toBe(true);
    await la.stop();
    await until(() => b.h.beats >= 1); // took over
    await lb.stop();
  });

  it("livenessFrom run: only the run loop's own beats count (a wedged leader goes silent)", async () => {
    const c = counter();
    const task = recurringJobsTask({
      db,
      pool: database.pool,
      name: "test:recurring-live",
      jobs: [{ kind: "kit.tick", everyMs: 60_000 }],
      tickMs: 50,
    });
    expect(task.maxSilenceMs).toBe(60_000);
    const t = await task.start(c.hb);
    await until(() => c.h.beats >= 3); // one beat per tick
    await t.stop();

    const w = counter();
    let release: () => void = () => {};
    const wedged = advisoryLeader({
      pool: database.pool,
      name: "test:wedged",
      heartbeatMs: 30,
      livenessFrom: "run",
      heartbeat: w.hb,
      // never beats and ignores its abort signal: a wedged leader loop
      run: () =>
        new Promise<void>((r) => {
          release = r;
        }),
    });
    await until(() => wedged.isLeader());
    await sleep(200); // several healthy leadership heartbeats — they do not count with livenessFrom run
    expect(w.h.beats).toBe(1); // the beat on winning only
    expect(w.h.active).toBe(true); // still responsible: /healthz will fail after maxSilenceMs
    const stopping = wedged.stop();
    release();
    await stopping;
  });
});

describe("task liveness defaults (KIT-4)", () => {
  it("relay and job worker declare budgets and beat while their dependency fails", async () => {
    const relay = outboxRelayTask({ db, pool: database.pool, publish: async () => {}, pollMs: 20 });
    expect(relay.maxSilenceMs).toBe(120_000);
    const worker = jobWorkerTask({ db, workerId: "w", handlers: {}, pollMs: 20 });
    expect(worker.maxSilenceMs).toBe(180_000);
    const r = counter();
    const w = counter();
    const failingDb = createDb<Svc>({ url: "postgres://u:p@127.0.0.1:1/x", connectionTimeoutMs: 100 });
    const errors: unknown[] = [];
    const deadRelay = await outboxRelayTask({
      db: failingDb.db,
      pool: failingDb.pool,
      publish: async () => {},
      pollMs: 20,
      onError: (e) => errors.push(e),
    }).start(r.hb);
    const deadWorker = await jobWorkerTask({
      db: failingDb.db,
      workerId: "w",
      handlers: { "kit.x": async () => {} },
      pollMs: 20,
      onError: (e) => errors.push(e),
    }).start(w.hb);
    await until(() => r.h.beats >= 3 && w.h.beats >= 3); // DB down is an outage, not a dead loop
    expect(errors.length).toBeGreaterThan(0);
    await deadRelay.stop();
    await deadWorker.stop();
    await failingDb.close();
  });

  it("a hung job handler silences the worker; extendLease counts as progress", async () => {
    const w = counter();
    let release: () => void = () => {};
    await sql`delete from jobs`.execute(db);
    await sql`insert into jobs (id, kind, run_at, payload) values (${uuidv7()}, 'kit.hang', now(), '{}')`.execute(db);
    const task = await jobWorkerTask({
      db,
      workerId: "hang",
      pollMs: 20,
      handlers: {
        "kit.hang": async (_p, ctx) => {
          await ctx.extendLease();
          await new Promise<void>((r) => {
            release = r;
          });
        },
      },
    }).start(w.hb);
    await sleep(150);
    const during = w.h.beats;
    await sleep(200);
    expect(w.h.beats).toBe(during); // silent while the handler hangs
    expect(during).toBeGreaterThanOrEqual(1); // extendLease beat
    release();
    await until(() => w.h.beats > during);
    await task.stop();
  });
});

const ex = () => execution();
const input = (o = ex()) => ({
  subject: "evt.rails.execution.updated",
  aggregate: { type: "execution", id: o.id, version: o.version },
  accountId: uuidv7(),
  livemode: false,
  data: { object: o },
});
const tooLarge = () =>
  Object.assign(new Error("'payload' max_payload size exceeded"), { name: "InvalidArgumentError" });
const noStream = () => Object.assign(new Error("jetstream is not enabled"), { name: "JetStreamNotEnabled" });

describe("outbox poison rows (KIT-6)", () => {
  beforeEach(async () => {
    await db.deleteFrom("outbox").execute();
    await db.deleteFrom("dead_letters").execute();
  });

  it("dead-letters an oversized row after N attempts and the next row publishes", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await withTx(db, (tx) => emit(tx, input()))).id);
    const poison = ids[0] as string;
    const sent: string[] = [];
    const moved: OutboxDeadLetter[] = [];
    const publish = async (_s: string, e: Envelope) => {
      if (e.id === poison) throw tooLarge();
      sent.push(e.id);
    };
    const opts = { deadLetter: { maxAttempts: 3 }, onDeadLetter: (d: OutboxDeadLetter) => moved.push(d) };
    await expect(relayOnce(db, publish, opts)).rejects.toThrow(/max_payload/);
    await expect(relayOnce(db, publish, opts)).rejects.toThrow(/max_payload/);
    expect(sent).toEqual([]); // ordering holds while the row may still be transient
    const [head] = await pendingOutbox(db);
    expect(head).toMatchObject({ id: poison, attempts: 2 });
    expect(head?.last_error).toMatch(/InvalidArgumentError/);
    expect(head?.first_failed_at).toBeInstanceOf(Date);
    expect(await relayOnce(db, publish, opts)).toBe(2); // 3rd attempt: moved aside, the rest publish
    expect(sent).toEqual(ids.slice(1));
    expect(moved).toEqual([
      expect.objectContaining({ outboxId: poison, subject: input().subject, attempts: 3, class: "poison" }),
    ]);
    const [dl] = await listDeadLetters(db, { source: "outbox" });
    expect(dl).toMatchObject({ source: "outbox", subject: "evt.rails.execution.updated" });
    expect(dl?.payload).toMatchObject({ outbox_id: poison, envelope: { id: poison } });
    expect(dl?.error).toMatch(/^poison after 3 attempts/);
    expect(await pendingOutbox(db)).toEqual([]);
  });

  it("never dead-letters on transient errors, and unroutable only after it kept failing long enough", async () => {
    const id = (await withTx(db, (tx) => emit(tx, input()))).id;
    for (let i = 0; i < 8; i++)
      await expect(
        relayOnce(db, async () => Promise.reject(new Error("timeout")), { deadLetter: { maxAttempts: 2 } }),
      ).rejects.toThrow();
    expect((await pendingOutbox(db))[0]).toMatchObject({ id, attempts: 8 });
    const unroutable = { deadLetter: { maxAttempts: 2, unroutableAfterMs: 60_000 } };
    await expect(relayOnce(db, async () => Promise.reject(noStream()), unroutable)).rejects.toThrow();
    expect(await pendingOutbox(db)).toHaveLength(1); // attempts ≥ 2 but failing for < 60 s
    await sql`update outbox set first_failed_at = now() - interval '2 minutes'`.execute(db);
    expect(await relayOnce(db, async () => Promise.reject(noStream()), unroutable)).toBe(0);
    expect(await pendingOutbox(db)).toEqual([]);
    expect((await listDeadLetters(db))[0]?.error).toMatch(/^unroutable after 10 attempts/);
  });

  it("the relay loop reports ALERT outbox_dead_lettered through onError by default and keeps going", async () => {
    const poison = (await withTx(db, (tx) => emit(tx, input()))).id;
    const next = (await withTx(db, (tx) => emit(tx, input()))).id;
    const sent: string[] = [];
    const errors: string[] = [];
    const relay = startOutboxRelay({
      db,
      pool: database.pool,
      pollMs: 20,
      deadLetter: { maxAttempts: 2 },
      onError: (e) => errors.push((e as Error).message),
      publish: async (_s, e) => {
        if (e.id === poison) throw tooLarge();
        sent.push(e.id);
      },
    });
    await until(() => sent.includes(next));
    await relay.stop();
    expect(errors.some((m) => m.startsWith("ALERT outbox_dead_lettered: evt.rails.execution.updated"))).toBe(true);
  });
});

describe("dead-letter replay (KIT-7)", () => {
  beforeEach(async () => {
    await db.deleteFrom("dead_letters").execute();
    await db.deleteFrom("outbox").execute();
    await db.deleteFrom("inbox").execute();
    await sql`delete from flags`.execute(db);
    await sql`insert into flags (name, released, version) values ('quoting_enabled', false, 3)`.execute(db);
  });

  const released = (version: number): Envelope =>
    ({
      id: uuidv7(),
      subject: "evt.sentinel.kill_switch.released",
      occurred_at: new Date().toISOString(),
      account_id: null,
      livemode: null,
      aggregate: { type: "kill_switch", id: "ks_01jbz9k3m4n5p6q7r8s9t0v1w2", version },
      data: { object: {} },
    }) as Envelope;

  // A consumer like rails' kill-switch copy: applies released, ignores stale versions, dedupes through the inbox.
  let failing = true;
  let applied = 0;
  const handler = () =>
    inboxHandler(db, async (tx, e) => {
      if (failing) throw new Error("db deadlock");
      const r = await sql`update flags set released = true, version = ${e.aggregate.version}
        where name = 'quoting_enabled' and version < ${e.aggregate.version}`.execute(tx);
      applied += Number(r.numAffectedRows ?? 0n);
    });

  it("a dead-lettered kill_switch.released replays and the consumer flips to released, idempotently", async () => {
    const e = released(4);
    failing = true;
    await expect(handler()(e)).rejects.toThrow(/deadlock/); // every delivery failed …
    await deadLetterSink(db, "consumer:rails--EVT_SENTINEL")(e, "db deadlock", e.subject); // … so it was dead-lettered
    const [dl] = await listDeadLetters(db, { source: "consumer:" });
    expect(dl?.subject).toBe("evt.sentinel.kill_switch.released");
    failing = false;
    const out = await replayDeadLetter(
      db,
      dl?.id as string,
      { consumer: handler() },
      { actor: "cli:ops", note: "after fix" },
    );
    expect(out).toMatchObject({ resolution: "replayed", resolved_by: "cli:ops", resolution_note: "after fix" });
    expect((await sql<{ released: boolean }>`select released from flags`.execute(db)).rows[0]?.released).toBe(true);
    expect(applied).toBe(1);
    await expect(replayDeadLetter(db, dl?.id as string, { consumer: handler() }, { actor: "x" })).rejects.toMatchObject(
      {
        code: "already_resolved",
      },
    );
    await replayDeadLetter(db, dl?.id as string, { consumer: handler() }, { actor: "x", force: true });
    expect(applied).toBe(1); // the inbox dedupes a forced second replay
    expect(await listDeadLetters(db)).toEqual([]);
    expect(await listDeadLetters(db, { all: true })).toHaveLength(1);
  });

  it("requeues an outbox dead letter under its event id; re-arms a dead job; refuses what it cannot replay", async () => {
    const id = (await withTx(db, (tx) => emit(tx, input()))).id;
    await relayOnce(db, async () => Promise.reject(tooLarge()), { deadLetter: { maxAttempts: 1 } });
    const [dl] = await listDeadLetters(db, { source: "outbox" });
    await replayDeadLetter(db, dl?.id as string, {}, { actor: "cli:ops" });
    expect(await pendingOutbox(db)).toEqual([expect.objectContaining({ id, attempts: 0 })]);
    const sent: string[] = [];
    expect(await relayOnce(db, async (_s, e) => void sent.push(e.id))).toBe(1);
    expect(sent).toEqual([id]);

    await sql`delete from jobs`.execute(db);
    await sql`insert into jobs (id, kind, run_at, payload, max_attempts) values (${uuidv7()}, 'kit.fail', now(), '{"n":1}', 1)`.execute(
      db,
    );
    let ok = false;
    const handlers = {
      "kit.fail": async () => {
        if (!ok) throw new Error("nope");
      },
    };
    await runDueJobs({ db, workerId: "w", handlers });
    const [jobDl] = await listDeadLetters(db, { source: "job:*" });
    expect(jobDl?.source).toBe("job:kit.fail");
    await replayDeadLetter(db, jobDl?.id as string, {}, { actor: "cli:ops" });
    ok = true;
    expect(await runDueJobs({ db, workerId: "w", handlers })).toBe(1);

    await deadLetterSink(db, "consumer:x")("not json", "unparseable envelope", "evt.x");
    const [bad] = await listDeadLetters(db, { source: "consumer:x" });
    await expect(
      replayDeadLetter(db, bad?.id as string, { consumer: async () => {} }, { actor: "a" }),
    ).rejects.toMatchObject({
      code: "not_replayable",
    });
    await expect(replayDeadLetter(db, bad?.id as string, {}, { actor: "a" })).rejects.toMatchObject({
      code: "no_handler",
    });
    await expect(replayDeadLetter(db, uuidv7(), {}, { actor: "a" })).rejects.toBeInstanceOf(DeadLetterError);
    expect(await dropDeadLetter(db, bad?.id as string, { actor: "a", note: "garbage" })).toMatchObject({
      resolution: "dropped",
    });
  });

  it("runKitOps: list / show / replay / drop / outbox show / outbox skip", async () => {
    const e = released(5);
    await deadLetterSink(db, "consumer:rails--EVT_SENTINEL")(e, "boom", e.subject);
    failing = false;
    const ops = (cmd: string, ...args: string[]) =>
      runKitOps(db, cmd, args, { actor: "cli:test", handlers: { consumer: handler() } });
    const list = (await ops("dead-letters", "list", "--source", "consumer:")) as { id: string }[];
    expect(list).toHaveLength(1);
    expect(await ops("dead-letters", "show", list[0]?.id as string)).toMatchObject({ error: "boom" });
    expect(await ops("dead-letters", "replay", list[0]?.id as string, "--note", "fixed")).toMatchObject({
      resolution: "replayed",
    });
    await expect(ops("dead-letters", "drop", list[0]?.id as string)).rejects.toBeInstanceOf(KitOpsUsageError);
    await expect(ops("dead-letters", "show", "nope")).rejects.toBeInstanceOf(KitOpsUsageError);
    await expect(ops("dead-letters", "frobnicate")).rejects.toBeInstanceOf(KitOpsUsageError);

    const id = (await withTx(db, (tx) => emit(tx, input()))).id;
    expect(await ops("outbox", "show")).toEqual([expect.objectContaining({ id, attempts: 0 })]);
    await expect(ops("outbox", "skip", id)).rejects.toBeInstanceOf(KitOpsUsageError);
    const skipped = (await ops("outbox", "skip", id, "--note", "poison: 2 MB payload")) as { deadLetterId: string };
    expect(await ops("outbox", "show")).toEqual([]);
    expect(await ops("dead-letters", "show", skipped.deadLetterId)).toMatchObject({
      source: "outbox",
      error: expect.stringMatching(/^skipped by cli:test: poison: 2 MB payload/),
    });
    await expect(ops("outbox", "skip", id, "--note", "again")).rejects.toMatchObject({ code: "not_found" });
  });
});
