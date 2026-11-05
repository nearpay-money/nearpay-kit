import { ErrorEnvelope, SERVICE_CLIENT_SCOPES } from "@nearpay/spec";
import { verifyInternalJwt } from "@nearpay-internal/auth";
import { HttpError, httpClient } from "@nearpay-internal/http";
import { newId } from "@nearpay-internal/ids";
import { createScreening, getSettlementContext, INTERNAL_ROUTES } from "@nearpay-internal/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type MockPeer,
  mintServiceToken,
  mintTestToken,
  mockError,
  mockPeer,
  testKeySource,
  testServiceToken,
} from "../src/index.js";

let compliance: MockPeer;

beforeAll(async () => {
  compliance = await mockPeer({ service: "compliance", routes: INTERNAL_ROUTES });
});
afterAll(async () => {
  await compliance?.stop();
});

const screenBody = {
  subject_type: "address",
  chain: "eip155:8453",
  subject: "0x52908400098527886e0f7030069857d2e4169ee7",
  context: "payment",
  livemode: false,
};

describe("mockPeer", () => {
  it("serves a mocked route to a caller holding the right service scope and records the call", async () => {
    compliance.reset();
    compliance.on(createScreening, async (ctx) => ({
      screening_id: newId("scr"),
      decision: ctx.body.subject.includes("sanctioned") ? ("block" as const) : ("allow" as const),
      risk: null,
      reasons: [],
      cached: false,
      post_screen_required: false,
    }));
    const client = httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      serviceToken: testServiceToken("rails"),
    });
    const res = await client.call(createScreening, { body: screenBody });
    expect(res.decision).toBe("allow");
    expect(compliance.callsTo(createScreening)).toHaveLength(1);
    expect(compliance.calls[0]?.principal?.sub).toBe("rails");
  });

  it("rejects a caller without the scope the route requires (as production would)", async () => {
    compliance.reset();
    compliance.on(createScreening, async () => mockError("api_error"));
    const client = httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      serviceToken: testServiceToken("webhooks"), // webhooks holds no outbound scopes
    });
    const err = await client.call(createScreening, { body: screenBody }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect([(err as HttpError).status, (err as HttpError).error?.code]).toEqual([403, "permission_denied"]);
    expect(compliance.calls).toHaveLength(0);
  });

  it("validates the caller's request against the spec", async () => {
    compliance.reset();
    const client = httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      serviceToken: testServiceToken("rails"),
    });
    const err = (await client
      .request({ method: "POST", path: "/internal/screenings", body: { ...screenBody, unknown: 1 } })
      .catch((e) => e)) as HttpError;
    expect([err.status, err.error?.code]).toEqual([400, "invalid_request"]);
  });

  it("answers 500 for routes without a handler and still records the call", async () => {
    compliance.reset();
    const client = httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      attempts: 1,
      serviceToken: testServiceToken("rails"),
    });
    const err = (await client.call(createScreening, { body: screenBody }).catch((e) => e)) as HttpError;
    expect(err.status).toBe(500);
    expect(ErrorEnvelope.parse(err.body).error.message).toContain("not mocked");
    expect(compliance.callsTo(createScreening)).toHaveLength(1);
  });

  it("rejects a mocked response that violates the contract", async () => {
    compliance.reset();
    compliance.on(createScreening, async () => ({ decision: "maybe" }) as never);
    const client = httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      attempts: 1,
      serviceToken: testServiceToken("rails"),
    });
    const err = (await client.call(createScreening, { body: screenBody }).catch((e) => e)) as HttpError;
    expect(err.status).toBe(500);
  });

  it("refuses handlers for routes the peer does not own", async () => {
    expect(() => compliance.on(getSettlementContext, async () => ({}) as never)).toThrow(/not a compliance route/);
  });

  it("mints service tokens with the catalogue scopes", async () => {
    const claims = await verifyInternalJwt(await mintServiceToken("payments"), testKeySource());
    expect([claims.ptype, claims.sub, claims.scp]).toEqual([
      "service",
      "payments",
      [...SERVICE_CLIENT_SCOPES.payments],
    ]);
    const other = await verifyInternalJwt(
      await mintTestToken({ sub: "x", ptype: "anonymous", scp: [] }),
      testKeySource(),
    );
    expect(other.ptype).toBe("anonymous");
  });
});
