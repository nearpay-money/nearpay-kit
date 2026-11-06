import { uuidv7 } from "@nearpay-internal/ids";
import { type Started, startPostgres } from "@nearpay-internal/testing";
import { type Kysely, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  type Database,
  deadLetterSink,
  type Envelope,
  inboxHandler,
  type KitTables,
  migrate,
  recurringJobsTask,
} from "../src/index.js";

interface Svc extends KitTables {
  applied: { event_id: string };
}

let pg: Started;
let database: Database<Svc>;
let db: Kysely<Svc>;

beforeAll(async () => {
  pg = await startPostgres();
  database = createDb<Svc>({ url: pg.url });
  db = database.db;
  await migrate(db, null);
  await sql`create table applied (event_id uuid primary key)`.execute(db);
});
afterAll(async () => {
  await database?.close();
  await pg?.stop();
});

const envelope = (): Envelope =>
  ({
    id: uuidv7(),
    subject: "evt.payments.payment_intent.succeeded",
    occurred_at: new Date().toISOString(),
    account_id: uuidv7(),
    livemode: false,
    aggregate: { type: "payment_intent", id: "pi_01jbz9k3m4n5p6q7r8s9t0v1w2", version: 1 },
    data: { object: {} },
  }) as Envelope;

describe("inboxHandler", () => {
  it("applies an event once and skips redeliveries", async () => {
    let runs = 0;
    const h = inboxHandler(db, async (tx, e) => {
      runs++;
      await tx.insertInto("applied").values({ event_id: e.id }).execute();
    });
    const e = envelope();
    await h(e);
    await h(e);
    expect(runs).toBe(1);
  });

  it("rolls the inbox row back when the handler fails, so the retry applies it", async () => {
    let fail = true;
    const h = inboxHandler(db, async (tx, e) => {
      await tx.insertInto("applied").values({ event_id: e.id }).execute();
      if (fail) throw new Error("boom");
    });
    const e = envelope();
    await expect(h(e)).rejects.toThrow("boom");
    expect(
      await db.selectFrom("inbox").select("event_id").where("event_id", "=", e.id).executeTakeFirst(),
    ).toBeUndefined();
    fail = false;
    await h(e);
    expect(
      await db.selectFrom("applied").select("event_id").where("event_id", "=", e.id).executeTakeFirst(),
    ).toBeDefined();
  });
});

describe("deadLetterSink", () => {
  it("records the raw message, error and subject", async () => {
    await deadLetterSink(db, "consumer:test")({ a: 1 }, "bad", "evt.x.y.z");
    const row = await db
      .selectFrom("dead_letters")
      .selectAll()
      .where("source", "=", "consumer:test")
      .executeTakeFirstOrThrow();
    expect([row.error, row.subject, row.payload]).toEqual(["bad", "evt.x.y.z", { a: 1 }]);
  });
});

describe("recurringJobsTask", () => {
  it("enqueues each slot once across replicas and ticks", async () => {
    let now = Date.UTC(2026, 10, 5, 10, 15);
    const mk = () =>
      recurringJobsTask({
        db,
        pool: database.pool,
        name: "test:recurring",
        jobs: [{ kind: "purge.things", everyMs: 3_600_000 }],
        tickMs: 20,
        now: () => now,
      });
    const a = await mk().start();
    const b = await mk().start();
    await new Promise((r) => setTimeout(r, 200));
    now = Date.UTC(2026, 10, 5, 11, 1);
    await new Promise((r) => setTimeout(r, 200));
    await a.stop();
    await b.stop();
    const jobs = await db
      .selectFrom("jobs")
      .select(["dedupe_key", "run_at"])
      .where("kind", "=", "purge.things")
      .orderBy("run_at")
      .execute();
    expect(jobs.map((j) => j.dedupe_key)).toEqual([
      "purge.things:2026-11-05T10:00:00.000Z",
      "purge.things:2026-11-05T11:00:00.000Z",
    ]);
  });

  it("refuses sub-second periods", () => {
    expect(() => recurringJobsTask({ db, pool: database.pool, name: "x", jobs: [{ kind: "k", everyMs: 10 }] })).toThrow(
      /at least 1000/,
    );
  });
});
