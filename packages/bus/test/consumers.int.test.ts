import { domainEvent, paymentIntent, type Started, startNats } from "@nearpay-internal/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Bus,
  connectBus,
  domainConsumersTask,
  type Envelope,
  publish,
  startDomainConsumers,
} from "../src/index.js";

let nats: Started;
let bus: Bus;
beforeAll(async () => {
  nats = await startNats();
  bus = await connectBus({ url: nats.url, name: "kit-consumers-test" });
});
afterAll(async () => {
  await bus?.close();
  await nats?.stop();
});

async function until(ok: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("startDomainConsumers", () => {
  it("creates the streams, one durable per stream, and routes by subject", async () => {
    const got: string[] = [];
    const sub = await startDomainConsumers({
      bus,
      consumer: "webhooks",
      handlers: {
        "evt.payments.payment_intent.succeeded": async (e: Envelope) => void got.push(e.subject),
        "evt.agentpay.agent_payment.settled": async (e: Envelope) => void got.push(e.subject),
      },
      onDeadLetter: async () => {},
    });
    const pi = domainEvent("evt.payments.payment_intent.succeeded", paymentIntent({ status: "succeeded" }));
    await publish(bus, pi.subject, pi);
    // a subject the durable does not filter is never delivered
    const created = domainEvent("evt.payments.payment_intent.created", paymentIntent());
    await publish(bus, created.subject, created);
    await until(() => got.length >= 1);
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toEqual(["evt.payments.payment_intent.succeeded"]);
    const durables = (await bus.jsm.consumers.list("EVT_PAYMENTS").next()).map((c) => c.name);
    expect(durables).toContain("webhooks--EVT_PAYMENTS");
    expect((await bus.jsm.consumers.list("EVT_AGENTPAY").next()).map((c) => c.name)).toContain(
      "webhooks--EVT_AGENTPAY",
    );
    await sub.stop();
  });

  it("refuses a handler for a subject the catalogue does not route to the service", async () => {
    await expect(
      startDomainConsumers({
        bus,
        consumer: "rails",
        handlers: { "evt.payments.payment_intent.succeeded": async () => {} },
        onDeadLetter: async () => {},
      }),
    ).rejects.toThrow(/not a consumer/);
    await expect(
      startDomainConsumers({
        bus,
        consumer: "rails",
        handlers: { "evt.nope.thing.happened": async () => {} } as never,
        onDeadLetter: async () => {},
      }),
    ).rejects.toThrow(/not a catalogue subject/);
  });
});

describe("domainConsumersTask liveness (KIT-1, KIT-4)", () => {
  it("declares a silence budget and keeps beating while a failed durable backs off (an outage is not a dead loop)", async () => {
    const task = domainConsumersTask({
      bus,
      consumer: "webhooks",
      handlers: {
        "evt.payments.payment_intent.succeeded": async () => {},
        "evt.agentpay.agent_payment.settled": async () => {},
      },
      onDeadLetter: async () => {},
      onError: () => {},
      restartBackoff: { initialMs: 60_000, maxMs: 60_000 },
    });
    expect(task.maxSilenceMs).toBe(120_000);
    expect(
      domainConsumersTask({
        bus,
        consumer: "webhooks",
        handlers: {},
        onDeadLetter: async () => {},
        maxSilenceMs: false,
      }).maxSilenceMs,
    ).toBeUndefined();
    let beats = 0;
    const sub = await task.start({ beat: () => void beats++, idle: () => {} });
    expect(sub.subscriptions).toHaveLength(2);
    await until(() => beats >= 2, 5_000);
    expect(sub.running()).toBe(true);
    // one durable dies and waits a minute to restart: the task's heartbeat must not be kept alive by the other one
    await bus.jsm.consumers.delete("EVT_AGENTPAY", "webhooks--EVT_AGENTPAY");
    await until(() => !sub.running(), 30_000);
    await new Promise((r) => setTimeout(r, 1_200));
    const before = beats;
    await new Promise((r) => setTimeout(r, 2_200));
    // the dead one is backing off (alive, retrying), so beats continue: an outage is not a dead loop
    expect(beats).toBeGreaterThan(before);
    await sub.stop();
  });
});
