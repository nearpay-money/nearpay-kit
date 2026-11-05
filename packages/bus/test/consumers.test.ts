import { describe, expect, it } from "vitest";
import { durablesOf, unhandledSubjects } from "../src/index.js";

describe("unhandledSubjects", () => {
  it("lists catalogue subjects routed to a service without a handler", () => {
    const all = unhandledSubjects("rails", {});
    expect(all.sort()).toEqual(
      [
        "evt.identity.settlement_destination.activated",
        "evt.identity.settlement_destination.disabled",
        "evt.sentinel.kill_switch.engaged",
        "evt.sentinel.kill_switch.released",
      ].sort(),
    );
    const h = async () => {};
    expect(
      unhandledSubjects("rails", {
        "evt.identity.settlement_destination.activated": h,
        "evt.identity.settlement_destination.disabled": h,
        "evt.sentinel.kill_switch.engaged": h,
        "evt.sentinel.kill_switch.released": h,
      }),
    ).toEqual([]);
    expect(unhandledSubjects("sandbox", {})).toEqual([]);
  });
});

describe("durablesOf", () => {
  it("names one durable per producing stream", () => {
    expect(
      durablesOf("rails", [
        "evt.identity.settlement_destination.activated",
        "evt.identity.settlement_destination.disabled",
        "evt.sentinel.kill_switch.engaged",
      ]),
    ).toEqual([
      { stream: "EVT_IDENTITY", durable: "rails--EVT_IDENTITY" },
      { stream: "EVT_SENTINEL", durable: "rails--EVT_SENTINEL" },
    ]);
  });
});
