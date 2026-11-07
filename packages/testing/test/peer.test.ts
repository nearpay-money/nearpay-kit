import { ErrorEnvelope, OPS_ROLE_SCOPES, SERVICE_CLIENT_SCOPES } from "@nearpay/spec";
import { verifyInternalJwt } from "@nearpay-internal/auth";
import { HttpError, httpClient } from "@nearpay-internal/http";
import { newId } from "@nearpay-internal/ids";
import {
  createScreening,
  getSettlementContext,
  INTERNAL_ROUTES,
  listOpsCases,
  OPS_ROUTES,
  removeOpsBlocklistEntry,
} from "@nearpay-internal/spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type MockPeer,
  mintOpsToken,
  mintServiceToken,
  mintTestToken,
  mockError,
  mockPeer,
  opsClaims,
  opsHeaders,
  testKeySource,
  testOpsToken,
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

describe("ops principals (console)", () => {
  const opsClient = (o: Parameters<typeof testOpsToken>[0]) =>
    httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      attempts: 1,
      serviceToken: testOpsToken(o),
    });

  it("mints ops tokens with the role's scopes, ops_role and optional step-up", async () => {
    const plain = await verifyInternalJwt(await mintOpsToken(), testKeySource());
    expect([plain.ptype, plain.ops_role, plain.scp, plain.step_up_until]).toEqual([
      "ops",
      "ops",
      [...OPS_ROLE_SCOPES.ops],
      undefined,
    ]);
    expect(plain.sub).toMatch(/^usr_/);
    const admin = await verifyInternalJwt(await mintOpsToken({ role: "ops_admin", stepUp: true }), testKeySource());
    expect(admin.ops_role).toBe("ops_admin");
    expect(admin.step_up_until).toBeGreaterThan(Date.now() / 1000 + 500);
    expect(opsClaims({ stepUp: -5 }, 1000).step_up_until).toBe(995);
    expect(opsClaims({ scopes: ["sentinel.read"] }).scp).toEqual(["sentinel.read"]);
    expect(Object.keys(await opsHeaders())).toEqual(["X-NearPay-Token"]);
  });

  it("serves console routes of a peer and enforces opsRoles, scope and step-up", async () => {
    compliance.reset();
    compliance.on(
      listOpsCases,
      async () => ({ object: "list" as const, data: [], has_more: false, url: "/ops/cases" }) as never,
    );
    compliance.on(removeOpsBlocklistEntry, async () => mockError("resource_missing"));
    const page = await opsClient({ role: "ops" }).call(listOpsCases, { query: { livemode: false } as never });
    expect(page.data).toEqual([]);
    expect(compliance.calls[0]?.principal?.ops_role).toBe("ops");

    const remove = (o: Parameters<typeof testOpsToken>[0]) =>
      opsClient(o)
        .call(removeOpsBlocklistEntry, { params: { id: "bl_01jbz9k3m4n5p6q7r8s9t0v1w2" } as never, body: {} as never })
        .then(
          () => null,
          (e) => e as HttpError,
        );
    const asOps = await remove({ role: "ops", stepUp: true });
    expect([asOps?.status, asOps?.error?.code]).toEqual([403, "permission_denied"]);
    const noStepUp = await remove({ role: "ops_admin" });
    expect([noStepUp?.status, noStepUp?.error?.code]).toEqual([401, "step_up_required"]);
    const service = await httpClient({
      target: "compliance",
      baseUrl: compliance.url,
      timeoutMs: 2_000,
      attempts: 1,
      serviceToken: testServiceToken("payments"),
    })
      .call(listOpsCases, { query: { livemode: false } as never })
      .then(
        () => null,
        (e) => e as HttpError,
      );
    expect(service?.status).toBe(403);
    expect(compliance.callsTo(removeOpsBlocklistEntry)).toHaveLength(0);
  });

  it("starts an ops-only peer from OPS_ROUTES", async () => {
    const sentinel = await mockPeer({ service: "sentinel", routes: OPS_ROUTES });
    try {
      expect(sentinel.service).toBeTruthy();
    } finally {
      await sentinel.stop();
    }
  });
});
