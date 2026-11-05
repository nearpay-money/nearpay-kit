import { jetstream } from "@nats-io/jetstream";
import { uuidv7 } from "@nearpay-internal/ids";
import { durableName, STREAMS } from "@nearpay-internal/spec";
import {
  domainEvent,
  eventProbe,
  expectEvent,
  paymentIntent,
  type Started,
  startNats,
} from "@nearpay-internal/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Bus,
  busReady,
  connectBus,
  consumerLag,
  type Envelope,
  ensureStreams,
  publish,
  subscribe,
} from "../src/index.js";

const SUCCEEDED = "evt.payments.payment_intent.succeeded";
const CREATED = "evt.payments.payment_intent.created";
const STREAM = STREAMS.payments.name;

let nats: Started;
let bus: Bus;

const event = (subject: typeof SUCCEEDED | typeof CREATED = SUCCEEDED) =>
  domainEvent(subject, paymentIntent({ status: subject === SUCCEEDED ? "succeeded" : "requires_payment" }));

async function until<T>(f: () => T | Promise<T>, ok: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await f();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`condition not met within ${timeoutMs} ms (last: ${JSON.stringify(v)})`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  nats = await startNats();
  bus = await connectBus({ url: nats.url, name: "kit-bus-test" });
  await ensureStreams(bus, Object.values(STREAMS));
});

afterAll(async () => {
  await bus?.close();
  await nats?.stop();
});

describe("connection", () => {
  it("reports readiness and refuses an unreachable server", async () => {
    expect(busReady(bus)).toBe(true);
    await expect(connectBus({ url: "nats://127.0.0.1:1", name: "nope", timeoutMs: 500 })).rejects.toThrow();
  });
});

describe("streams", () => {
  it("creates one file-backed stream per domain with the foundations retention and dedupe window", async () => {
    for (const def of Object.values(STREAMS)) {
      const info = await bus.jsm.streams.info(def.name);
      expect(info.config.subjects).toEqual([...def.subjects]);
      expect(info.config.storage).toBe("file");
      expect(info.config.max_age).toBe(7 * 24 * 3600 * 1e9);
      expect(info.config.duplicate_window).toBe(120 * 1e9);
    }
  });

  it("is idempotent and repairs drifted settings", async () => {
    await ensureStreams(bus, Object.values(STREAMS));
    await bus.jsm.streams.update(STREAMS.billing.name, {
      max_age: 3600 * 1e9,
      duplicate_window: 60 * 1e9,
      subjects: ["evt.billing.>", "evt.billing2.>"],
    });
    await ensureStreams(bus, [STREAMS.billing]);
    const info = await bus.jsm.streams.info(STREAMS.billing.name);
    expect(info.config.subjects).toEqual(["evt.billing.>"]);
    expect(info.config.max_age).toBe(7 * 24 * 3600 * 1e9);
    expect(info.config.duplicate_window).toBe(120 * 1e9);
  });

  it("refuses to adopt a memory-backed stream", async () => {
    await bus.jsm.streams.add({ name: "EVT_SCRATCH", subjects: ["evt.scratch.>"], storage: "memory" as never });
    await expect(
      ensureStreams(bus, [
        {
          name: "EVT_SCRATCH",
          subjects: ["evt.scratch.>"],
          storage: "file",
          maxAgeSeconds: 60,
          duplicateWindowSeconds: 120,
        },
      ]),
    ).rejects.toThrow(/must be recreated as file storage/);
    await bus.jsm.streams.delete("EVT_SCRATCH");
  });
});

describe("publish", () => {
  it("de-duplicates by event id inside the window", async () => {
    const e = event();
    const first = await publish(bus, SUCCEEDED, e);
    const again = await publish(bus, SUCCEEDED, e);
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.seq).toBe(first.seq);
  });

  it("rejects a subject that differs from the envelope", async () => {
    await expect(publish(bus, CREATED, event(SUCCEEDED))).rejects.toThrow(/subject mismatch/);
  });

  it("is seen by core subscribers (event probe)", async () => {
    const probe = await eventProbe(nats.url);
    const e = event(CREATED);
    await publish(bus, CREATED, e);
    const got = await probe.next(CREATED, (x) => x.id === e.id);
    expect(got.aggregate.id).toBe(e.aggregate.id);
    const partial = await expectEvent(probe, CREATED, { id: e.id, data: { object: { status: "requires_payment" } } });
    expect(partial.id).toBe(e.id);
    await expect(
      expectEvent(probe, CREATED, { id: e.id, data: { object: { status: "succeeded" } } }, 200),
    ).rejects.toThrow(/no evt\.payments\.payment_intent\.created event within 200 ms/);
    await probe.close();
  });
});

describe("subscribe", () => {
  it("delivers typed envelopes from the filter subjects only and acks them", async () => {
    const durable = durableName("webhooks", STREAM);
    const got: Envelope[] = [];
    const sub = await subscribe(bus, {
      stream: STREAM,
      durable,
      filterSubjects: [CREATED],
      handler: async (e) => void got.push(e),
      onDeadLetter: async () => {
        throw new Error("unexpected dead letter");
      },
    });
    const mine = event(CREATED);
    await publish(bus, SUCCEEDED, event(SUCCEEDED));
    await publish(bus, CREATED, mine);
    await until(
      () => got.map((e) => e.id),
      (ids) => ids.includes(mine.id),
    );
    expect(got.every((e) => e.subject === CREATED)).toBe(true);
    await until(
      () => consumerLag(bus, STREAM, durable),
      (n) => n === 0,
    );
    const info = await bus.jsm.consumers.info(STREAM, durable);
    expect(info.config.ack_wait).toBe(30 * 1e9);
    expect(info.config.max_deliver).toBe(20);
    expect(info.config.backoff ?? []).toEqual([]);
    expect(info.config.filter_subjects).toEqual([CREATED]);
    await sub.stop();
  });

  it("retries a failing handler with the backoff delay, then succeeds", async () => {
    const e = event();
    const seen: { delivery: number; at: number }[] = [];
    const errors: unknown[] = [];
    const sub = await subscribe(bus, {
      stream: STREAM,
      durable: "retry-test",
      filterSubjects: [SUCCEEDED],
      backoffSeconds: [0.3, 0.6],
      handler: async (env, msg) => {
        if (env.id !== e.id) return;
        seen.push({ delivery: msg.info.deliveryCount, at: Date.now() });
        if (seen.length < 3) throw new Error(`boom ${seen.length}`);
      },
      onDeadLetter: async () => {
        throw new Error("unexpected dead letter");
      },
      onError: (x) => errors.push(x),
    });
    await publish(bus, SUCCEEDED, e);
    await until(
      () => seen.length,
      (n) => n === 3,
    );
    expect(seen.map((s) => s.delivery)).toEqual([1, 2, 3]);
    expect((seen[1]?.at ?? 0) - (seen[0]?.at ?? 0)).toBeGreaterThanOrEqual(250);
    expect((seen[2]?.at ?? 0) - (seen[1]?.at ?? 0)).toBeGreaterThanOrEqual(550);
    expect(errors.map((x) => (x as Error).message)).toEqual(["boom 1", "boom 2"]);
    await sub.stop();
  });

  it("dead-letters after the last delivery and acks", async () => {
    const e = event();
    const dead: { raw: unknown; error: string; subject: string }[] = [];
    let attempts = 0;
    const sub = await subscribe(bus, {
      stream: STREAM,
      durable: "dlq-test",
      filterSubjects: [SUCCEEDED],
      maxDeliver: 3,
      backoffSeconds: [0.05],
      handler: async (env) => {
        if (env.id !== e.id) return;
        attempts++;
        throw new Error("permanent");
      },
      onDeadLetter: async (raw, error, subject) => void dead.push({ raw, error, subject }),
    });
    await publish(bus, SUCCEEDED, e);
    await until(
      () => dead.length,
      (n) => n === 1,
    );
    expect(attempts).toBe(3);
    expect(dead[0]).toMatchObject({ error: "permanent", subject: SUCCEEDED, raw: { id: e.id } });
    await until(
      () => consumerLag(bus, STREAM, "dlq-test"),
      (n) => n === 0,
    );
    await sub.stop();
  });

  it("dead-letters unparseable payloads and envelopes published on the wrong subject", async () => {
    const dead: { error: string; subject: string }[] = [];
    const handled: string[] = [];
    const sub = await subscribe(bus, {
      stream: STREAMS.rails.name,
      durable: "poison-test",
      filterSubjects: ["evt.rails.>"],
      handler: async (env) => void handled.push(env.id),
      onDeadLetter: async (_raw, error, subject) => void dead.push({ error, subject }),
    });
    const js = jetstream(bus.nc);
    await js.publish("evt.rails.execution.updated", "not json", { msgID: uuidv7() });
    await js.publish("evt.rails.execution.updated", JSON.stringify({ id: "x" }), { msgID: uuidv7() });
    const wrong = { ...event(SUCCEEDED) };
    await js.publish("evt.rails.execution.settled", JSON.stringify(wrong), { msgID: wrong.id });
    await until(
      () => dead.length,
      (n) => n === 3,
    );
    expect(handled).toEqual([]);
    expect(dead[0]?.error).toMatch(/^unparseable envelope/);
    expect(dead[1]?.error).toMatch(/^unparseable envelope/);
    expect(dead[2]?.error).toMatch(/does not match evt\.rails\.execution\.settled/);
    await sub.stop();
  });

  it("naks when the dead-letter sink fails, so nothing is lost", async () => {
    let sinkCalls = 0;
    const sub = await subscribe(bus, {
      stream: STREAMS.agentpay.name,
      durable: "sink-down-test",
      filterSubjects: ["evt.agentpay.>"],
      maxDeliver: 5,
      backoffSeconds: [0.05],
      handler: async () => {},
      onDeadLetter: async () => {
        sinkCalls++;
        if (sinkCalls < 2) throw new Error("db down");
      },
      onError: () => {},
    });
    await jetstream(bus.nc).publish("evt.agentpay.agent_payment.settled", "garbage", { msgID: uuidv7() });
    await until(
      () => sinkCalls,
      (n) => n === 2,
    );
    await until(
      () => consumerLag(bus, STREAMS.agentpay.name, "sink-down-test"),
      (n) => n === 0,
    );
    await sub.stop();
  });

  it("resumes a durable where it stopped and updates its filter and limits", async () => {
    const durable = "resume-test";
    const got: string[] = [];
    const opts = {
      stream: STREAM,
      durable,
      filterSubjects: [CREATED] as string[],
      handler: async (e: Envelope) => void got.push(e.id),
      onDeadLetter: async () => {},
    };
    const first = await subscribe(bus, opts);
    await until(
      () => consumerLag(bus, STREAM, durable),
      (n) => n === 0,
    );
    await first.stop();
    const before = got.length;
    const missed = event(CREATED);
    await publish(bus, CREATED, missed);
    const second = await subscribe(bus, {
      ...opts,
      filterSubjects: [CREATED, SUCCEEDED],
      maxDeliver: 7,
      ackWaitSeconds: 10,
    });
    await until(
      () => got,
      (ids) => ids.includes(missed.id),
    );
    expect(got.slice(before).filter((id) => id === missed.id)).toHaveLength(1);
    const info = await bus.jsm.consumers.info(STREAM, durable);
    expect(info.config.filter_subjects).toEqual([CREATED, SUCCEEDED]);
    expect(info.config.max_deliver).toBe(7);
    expect(info.config.ack_wait).toBe(10 * 1e9);
    await second.stop();
  });

  it("clears a consumer backoff left by an older configuration", async () => {
    await bus.jsm.consumers.add(STREAM, {
      durable_name: "legacy-test",
      ack_policy: "explicit" as never,
      ack_wait: 30e9,
      max_deliver: 20,
      backoff: [1e9, 5e9],
    });
    expect((await bus.jsm.consumers.info(STREAM, "legacy-test")).config.ack_wait).toBe(1e9);
    const sub = await subscribe(bus, {
      stream: STREAM,
      durable: "legacy-test",
      filterSubjects: [CREATED],
      handler: async () => {},
      onDeadLetter: async () => {},
    });
    const info = await bus.jsm.consumers.info(STREAM, "legacy-test");
    expect(info.config.ack_wait).toBe(30e9);
    expect(info.config.backoff ?? []).toEqual([]);
    await sub.stop();
  });

  it("rejects an empty filter", async () => {
    await expect(
      subscribe(bus, {
        stream: STREAM,
        durable: "empty",
        filterSubjects: [],
        handler: async () => {},
        onDeadLetter: async () => {},
      }),
    ).rejects.toThrow(/filter subject/);
  });
});
