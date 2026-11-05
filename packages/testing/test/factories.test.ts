import { verifyInternalJwt } from "@nearpay-internal/auth";
import { describe, expect, it } from "vitest";
import {
  account,
  agentPayment,
  balanceTransaction,
  checkoutSession,
  domainEvent,
  execution,
  fakeClock,
  internalSettlementDestination,
  matchesPartial,
  mintTestToken,
  paymentIntent,
  settlementDestination,
  testKeySource,
} from "../src/index.js";

describe("factories", () => {
  it("build valid objects and apply deep overrides", () => {
    expect(account({ settings: { late_payments: true } }).settings).toMatchObject({
      late_payments: true,
      session_ttl_default: 3600,
    });
    expect(settlementDestination({ status: "cooling_off" }).status).toBe("cooling_off");
    expect(internalSettlementDestination().address_norm).toBe("merchant.near");
    expect(paymentIntent({ status: "succeeded" }).status).toBe("succeeded");
    expect(checkoutSession().object).toBe("checkout_session");
    expect(execution({ state: "succeeded" }).state).toBe("succeeded");
    expect(agentPayment().object).toBe("agent_payment");
    expect(balanceTransaction({ type: "overpayment", gross: null, fee: null }).type).toBe("overpayment");
  });
  it("refuse overrides that violate the contract", () => {
    expect(() => paymentIntent({ amount_settled: "-1" })).toThrow();
    expect(() => account({ id: "nope" as never })).toThrow();
  });
  it("build typed domain events", () => {
    const e = domainEvent("evt.rails.execution.settled", execution({ state: "succeeded", version: 4 }));
    expect(e.aggregate).toMatchObject({ type: "execution", version: 4 });
    expect(() => domainEvent("evt.rails.execution.settled", { not: "an execution" })).toThrow();
  });
});

describe("clock and tokens", () => {
  it("moves the fake clock forward only", () => {
    const c = fakeClock(1000);
    c.advance(500);
    expect(c.now()).toBe(1500);
    expect(() => c.advance(-1)).toThrow();
    c.set(new Date(5000));
    expect(c.nowSeconds()).toBe(5);
  });
  it("mints tokens the test key source verifies", async () => {
    const t = await mintTestToken({ sub: "payments", ptype: "service", scp: ["rails.read"] });
    await expect(verifyInternalJwt(t, testKeySource())).resolves.toMatchObject({ sub: "payments", ptype: "service" });
  });
});

describe("matchesPartial", () => {
  it("matches deep partial objects and exact arrays", () => {
    const e = { id: "x", data: { object: { status: "succeeded", tags: ["a", "b"], n: 0 } } };
    expect(matchesPartial(e, {})).toBe(true);
    expect(matchesPartial(e, { data: { object: { status: "succeeded" } } })).toBe(true);
    expect(matchesPartial(e, { data: { object: { tags: ["a", "b"] } } })).toBe(true);
    expect(matchesPartial(e, { data: { object: { tags: ["a"] } } })).toBe(false);
    expect(matchesPartial(e, { data: { object: { status: "failed" } } })).toBe(false);
    expect(matchesPartial(e, { data: { missing: { deeper: 1 } } })).toBe(false);
    expect(matchesPartial(e, { data: { object: { n: -0 } } })).toBe(false);
    expect(matchesPartial(null, {})).toBe(false);
    expect(matchesPartial({ a: null }, { a: null })).toBe(true);
  });
});
