import { Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import type { ClaimsInput } from "@nearpay-internal/auth";
import { IdempotencyConflict } from "@nearpay-internal/db";
import { currentContext, httpClient } from "@nearpay-internal/http";
import { newId } from "@nearpay-internal/ids";
import { getInternalPaymentIntent, getOpsReconciliationRun, resolveOpsReconciliationRun } from "@nearpay-internal/spec";
import { checkoutSession, mintTestToken, opsHeaders, paymentIntent, testKeySource } from "@nearpay-internal/testing";
import {
  advancePaymentAttempt,
  cancelPaymentIntent,
  createCheckoutSession,
  ErrorEnvelope,
  getCheckoutSession,
  getInvoicePdf,
  getPaymentIntent,
  getPublicCheckoutSession,
  listPaymentIntents,
  PUBLIC_ROUTES,
  streamCheckoutSession,
} from "@nearpay-money/spec";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import {
  ApiError,
  type BaseConfig,
  binary,
  createService,
  type Heartbeat,
  type IdempotencyStore,
  implement,
  type RouteBinding,
  respond,
  type Service,
  type ServiceOptions,
  type SseStream,
  startTracing,
  unimplementedRoutes,
} from "../src/index.js";

const config: BaseConfig = { env: "test", logLevel: "info", host: "127.0.0.1", port: 0, metricsPort: 0 };
const ACCT = newId("acct");
const secretKey = (over: Partial<ClaimsInput> = {}) =>
  mintTestToken({ sub: newId("key"), acct: ACCT, lm: false, ptype: "secret_key", scp: [], rid: newId("req"), ...over });
const CS = checkoutSession();
const SECRET = `${CS.id}_secret_${"A".repeat(32)}`;
const pi = paymentIntent({ id: CS.payment_intent as never });

function logSink() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      for (const l of String(chunk).split("\n").filter(Boolean)) lines.push(JSON.parse(l));
      cb();
    },
  });
  return { lines, destination };
}

const services: Service[] = [];
afterEach(async () => {
  for (const s of services.splice(0)) await s.stop();
});

function make(routes: RouteBinding[], over: Partial<ServiceOptions> = {}) {
  const logs = logSink();
  const exporter = new InMemorySpanExporter();
  const s = createService({
    name: "payments",
    config,
    routes,
    keys: testKeySource(),
    logDestination: logs.destination,
    tracing: startTracing({ service: "payments", env: "test", exporter }),
    ...over,
  });
  services.push(s);
  return { s, logs, exporter };
}

const parseEnvelope = (body: string) => ErrorEnvelope.parse(JSON.parse(body)).error;

describe("health", () => {
  it("serves /healthz and /readyz with named checks", async () => {
    let dbUp = true;
    const { s } = make([], {
      readiness: { db: () => (dbUp ? undefined : Promise.reject(new Error("connection refused"))) },
      readinessTimeoutMs: 100,
    });
    s.addReadiness("bus", () => {});
    expect((await s.app.inject("/healthz")).body).toBe("ok\n");
    const ok = await s.app.inject("/readyz");
    expect([ok.statusCode, ok.json()]).toEqual([200, { status: "ready", checks: { db: "ok", bus: "ok" } }]);
    dbUp = false;
    s.addReadiness("slow", () => sleep(1_000));
    const bad = await s.app.inject("/readyz");
    expect(bad.statusCode).toBe(503);
    expect(bad.json()).toEqual({
      status: "not_ready",
      checks: { db: "error: connection refused", bus: "ok", slow: "error: timed out after 100 ms" },
    });
  });
});

describe("routing, auth and validation", () => {
  const getPi = implement(getPaymentIntent, async (ctx) => {
    expect(ctx.params.id).toBe(pi.id);
    return pi;
  });

  it("serves an authenticated route and returns the request id", async () => {
    const { s, logs } = make([getPi]);
    const res = await s.app.inject({
      url: `/v1/payment_intents/${pi.id}`,
      headers: { "x-nearpay-token": await secretKey() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(pi);
    expect(res.headers["x-request-id"]).toMatch(/^req_[0-9a-z]{26}$/);
    const line = logs.lines.find((l) => l.msg === "request completed");
    expect(line).toMatchObject({
      svc: "payments",
      env: "test",
      route: "getPaymentIntent",
      status: 200,
      acct: ACCT,
      lm: false,
      rid: res.headers["x-request-id"],
    });
    expect(line?.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps a valid inbound request id and replaces a malformed one", async () => {
    const { s } = make([getPi]);
    const rid = newId("req");
    const token = await secretKey();
    expect(
      (
        await s.app.inject({
          url: `/v1/payment_intents/${pi.id}`,
          headers: { "x-nearpay-token": token, "x-request-id": rid },
        })
      ).headers["x-request-id"],
    ).toBe(rid);
    expect(
      (
        await s.app.inject({
          url: `/v1/payment_intents/${pi.id}`,
          headers: { "x-nearpay-token": token, "x-request-id": "evil\nvalue" },
        })
      ).headers["x-request-id"],
    ).not.toBe("evil\nvalue");
  });

  it("rejects missing, invalid and insufficient credentials", async () => {
    const { s } = make([getPi]);
    const url = `/v1/payment_intents/${pi.id}`;
    const none = await s.app.inject({ url });
    expect([none.statusCode, parseEnvelope(none.body).code]).toEqual([401, "authentication_required"]);
    expect(parseEnvelope(none.body).request_id).toBe(none.headers["x-request-id"]);
    const forged = await s.app.inject({
      url,
      headers: { "x-nearpay-token": "eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3QtMSJ9.e30.AAAA" },
    });
    expect([forged.statusCode, parseEnvelope(forged.body).code]).toEqual([401, "authentication_required"]);
    const rk = await s.app.inject({
      url,
      headers: { "x-nearpay-token": await secretKey({ ptype: "restricted_key", scp: ["checkout_sessions.read"] }) },
    });
    expect([rk.statusCode, parseEnvelope(rk.body).code]).toEqual([403, "permission_denied"]);
    const rkOk = await s.app.inject({
      url,
      headers: { "x-nearpay-token": await secretKey({ ptype: "restricted_key", scp: ["payment_intents.read"] }) },
    });
    expect(rkOk.statusCode).toBe(200);
    const expired = await s.app.inject({
      url,
      headers: {
        "x-nearpay-token": await mintTestToken({ sub: "k", acct: ACCT, lm: false, ptype: "secret_key", scp: [] }, -60),
      },
    });
    expect(expired.statusCode).toBe(401);
  });

  it("enforces test-mode-only routes", async () => {
    const { s } = make([implement(advancePaymentAttempt, async () => respond(202, { ok: true } as never))], {
      responseValidation: "off",
    });
    const url = `/v1/test_helpers/payment_attempts/${newId("pa")}/advance`;
    const live = await s.app.inject({
      method: "POST",
      url,
      payload: { to: "succeeded" },
      headers: { "x-nearpay-token": await secretKey({ lm: true }) },
    });
    expect([live.statusCode, parseEnvelope(live.body).code]).toEqual([403, "livemode_forbidden"]);
  });

  it("authorizes internal routes for service principals only", async () => {
    const { s } = make([implement(getInternalPaymentIntent, async () => pi as never)], { responseValidation: "off" });
    const url = `/internal/payment_intents/${pi.id}`;
    const svc = await s.app.inject({
      url,
      headers: { "x-nearpay-token": await mintTestToken({ sub: "notify", ptype: "service", scp: ["payments.read"] }) },
    });
    expect(svc.statusCode).toBe(200);
    const merchant = await s.app.inject({ url, headers: { "x-nearpay-token": await secretKey() } });
    expect(merchant.statusCode).toBe(403);
    const wrongScope = await s.app.inject({
      url,
      headers: {
        "x-nearpay-token": await mintTestToken({ sub: "billing", ptype: "service", scp: ["payments.sessions.create"] }),
      },
    });
    expect(wrongScope.statusCode).toBe(403);
  });

  it("authorizes ops routes for ops principals by ops_role, scope and step-up only", async () => {
    const { s } = make(
      [
        implement(getOpsReconciliationRun, async () => {
          throw new ApiError("resource_missing");
        }),
        implement(resolveOpsReconciliationRun, async () => {
          throw new ApiError("resource_missing");
        }),
      ],
      { responseValidation: "off" },
    );
    const id = newId("rcn");
    const get = async (headers: Record<string, string>) =>
      s.app.inject({ url: `/ops/reconciliation_runs/${id}`, headers });
    const resolve = async (headers: Record<string, string>) =>
      s.app.inject({ method: "POST", url: `/ops/reconciliation_runs/${id}/resolution`, headers, payload: {} });
    const codeOf = (r: { body: string }) => parseEnvelope(r.body).code;

    expect((await get(await opsHeaders({ role: "ops" }))).statusCode).toBe(404); // reached the handler
    expect((await get(await opsHeaders({ role: "ops", scopes: ["rails.read"] }))).statusCode).toBe(403);
    const svc = await get({
      "x-nearpay-token": await mintTestToken({ sub: "payments", ptype: "service", scp: ["payments.read"] }),
    });
    expect([svc.statusCode, codeOf(svc)]).toEqual([403, "permission_denied"]);
    const session = await get({
      "x-nearpay-token": await mintTestToken({
        sub: newId("usr"),
        acct: ACCT,
        lm: false,
        ptype: "session",
        role: "owner",
        scp: ["payments.read"],
        step_up_until: Math.floor(Date.now() / 1000) + 300,
      }),
    });
    expect(session.statusCode).toBe(403);
    expect((await get({ "x-nearpay-token": await secretKey() })).statusCode).toBe(403);

    const stale = await resolve(await opsHeaders({ role: "ops_admin" }));
    expect([stale.statusCode, codeOf(stale)]).toEqual([401, "step_up_required"]);
    const expired = await resolve(await opsHeaders({ role: "ops_admin", stepUp: -1 }));
    expect(codeOf(expired)).toBe("step_up_required");
    const fresh = await resolve(await opsHeaders({ role: "ops_admin", stepUp: true }));
    expect([401, 403]).not.toContain(fresh.statusCode); // past authorization (body validation / handler)
  });

  it("serves open routes without a token and validates their headers", async () => {
    let seen: unknown = "unset";
    const { s } = make(
      [
        implement(getPublicCheckoutSession, async (ctx) => {
          seen = ctx.principal;
          expect(ctx.headers["x-nearpay-client-secret"]).toBe(SECRET);
          return { marker: true } as never;
        }),
      ],
      { responseValidation: "off" },
    );
    const url = `/v1/checkout/sessions/${CS.id}/public`;
    const ok = await s.app.inject({ url, headers: { "x-nearpay-client-secret": SECRET } });
    expect([ok.statusCode, seen]).toEqual([200, null]);
    const anonymousToken = await mintTestToken({ sub: "anonymous", ptype: "anonymous", scp: [] });
    const withToken = await s.app.inject({
      url,
      headers: { "x-nearpay-client-secret": SECRET, "x-nearpay-token": anonymousToken },
    });
    expect([withToken.statusCode, seen]).toEqual([200, null]);
    const garbage = await s.app.inject({
      url,
      headers: { "x-nearpay-client-secret": SECRET, "x-nearpay-token": "garbage" },
    });
    expect(garbage.statusCode).toBe(200);
    const missing = await s.app.inject({ url });
    expect(missing.statusCode).toBe(400);
    expect(parseEnvelope(missing.body)).toMatchObject({ code: "invalid_request", param: "x-nearpay-client-secret" });
  });

  it("validates bodies, params and queries in the API's notation", async () => {
    let received: unknown;
    const { s } = make(
      [
        implement(createCheckoutSession, async (ctx) => {
          received = ctx.body;
          return CS;
        }),
        implement(getCheckoutSession, async (ctx) => {
          received = ctx.query;
          return CS;
        }),
        implement(cancelPaymentIntent, async () => pi),
        getPi,
      ],
      { responseValidation: "log" },
    );
    const token = await secretKey();
    const post = (payload: unknown, headers: Record<string, string> = {}) =>
      s.app.inject({
        method: "POST",
        url: "/v1/checkout/sessions",
        payload: payload as string,
        headers: { "x-nearpay-token": token, "content-type": "application/json", ...headers },
      });

    const ok = await post({ amount: 500, currency: "usd", success_url: "https://merchant.example/ok" });
    expect(ok.statusCode).toBe(201);
    expect(received).toMatchObject({ amount: 500, currency: "usd", ui_mode: "hosted" });

    const unknown = await post({ amount: 500, currency: "usd", success_url: "https://m.example/ok", colour: "red" });
    expect(parseEnvelope(unknown.body)).toMatchObject({
      code: "invalid_request",
      param: "colour",
      message: "The request is invalid: unknown parameter colour",
    });
    const nested = await post({
      amount: 500,
      currency: "usd",
      success_url: "https://m.example/ok",
      metadata: { order: 5 },
    });
    expect(parseEnvelope(nested.body).param).toBe("metadata[order]");
    const empty = await s.app.inject({
      method: "POST",
      url: "/v1/checkout/sessions",
      headers: { "x-nearpay-token": token },
    });
    expect(parseEnvelope(empty.body).code).toBe("invalid_request");
    const notJson = await post("{nope");
    expect(parseEnvelope(notJson.body).message).toBe("The request is invalid: the request body is not valid JSON");
    const poisoned = await post('{"amount":500,"__proto__":{"admin":true}}');
    expect(parseEnvelope(poisoned.body).message).toMatch(/not valid JSON/);
    const form = await s.app.inject({
      method: "POST",
      url: "/v1/checkout/sessions",
      payload: "amount=5",
      headers: { "x-nearpay-token": token, "content-type": "application/x-www-form-urlencoded" },
    });
    expect([form.statusCode, parseEnvelope(form.body).message]).toEqual([
      400,
      "The request is invalid: send a JSON body with Content-Type: application/json",
    ]);
    const huge = await post({
      amount: 500,
      currency: "usd",
      success_url: "https://m.example/ok",
      description: "x".repeat(1_100_000),
    });
    expect([huge.statusCode, parseEnvelope(huge.body).message]).toEqual([
      400,
      "The request is invalid: the request body is too large",
    ]);

    const q = await s.app.inject({
      url: `/v1/checkout/sessions/${CS.id}?expand[]=payment_intent`,
      headers: { "x-nearpay-token": token },
    });
    expect(q.statusCode).toBe(200);
    expect(received).toEqual({ expand: ["payment_intent"] });
    const badQ = await s.app.inject({
      url: `/v1/checkout/sessions/${CS.id}?expand[]=customer`,
      headers: { "x-nearpay-token": token },
    });
    expect(parseEnvelope(badQ.body).param).toBe("expand[0]");
    const stray = await s.app.inject({
      url: `/v1/payment_intents/${pi.id}?debug=1`,
      headers: { "x-nearpay-token": token },
    });
    expect(parseEnvelope(stray.body)).toMatchObject({
      param: "debug",
      message: "The request is invalid: unknown parameter debug",
    });
    const badPath = await s.app.inject({
      url: "/v1/payment_intents/cs_wrongprefix",
      headers: { "x-nearpay-token": token },
    });
    expect([badPath.statusCode, parseEnvelope(badPath.body).param]).toEqual([400, "id"]);
    const actionNoBody = await s.app.inject({
      method: "POST",
      url: `/v1/payment_intents/${pi.id}/cancel`,
      headers: { "x-nearpay-token": token },
    });
    expect(actionNoBody.statusCode).toBe(200);
    const badKey = await post(
      { amount: 500, currency: "usd", success_url: "https://m.example/ok" },
      { "idempotency-key": "k".repeat(256) },
    );
    expect(parseEnvelope(badKey.body).param).toBe("Idempotency-Key");
  });

  it("answers unknown URLs and methods with resource_missing", async () => {
    const { s } = make([getPi]);
    const res = await s.app.inject({ method: "DELETE", url: `/v1/payment_intents/${pi.id}?x=1` });
    expect(res.statusCode).toBe(404);
    expect(parseEnvelope(res.body)).toMatchObject({
      code: "resource_missing",
      message: `Unrecognized request URL (DELETE /v1/payment_intents/${pi.id}).`,
    });
  });
});

describe("handlers", () => {
  it("maps ApiError, hides unexpected errors, and logs them with the stack", async () => {
    let mode = "api";
    const { s, logs, exporter } = make([
      implement(getPaymentIntent, async () => {
        if (mode === "api") throw ApiError.missing("payment_intent", "pi_x", "id");
        throw new Error("secret internals");
      }),
    ]);
    const token = await secretKey();
    const a = await s.app.inject({ url: `/v1/payment_intents/${pi.id}`, headers: { "x-nearpay-token": token } });
    expect([a.statusCode, parseEnvelope(a.body)]).toEqual([
      404,
      expect.objectContaining({ code: "resource_missing", param: "id", message: "No such payment_intent: pi_x" }),
    ]);
    mode = "crash";
    const b = await s.app.inject({ url: `/v1/payment_intents/${pi.id}`, headers: { "x-nearpay-token": token } });
    expect([b.statusCode, parseEnvelope(b.body).code]).toEqual([500, "api_error"]);
    expect(b.body).not.toContain("secret internals");
    const err = logs.lines.find((l) => l.msg === "unhandled error") as {
      err?: { message?: string; stack?: string };
      rid?: string;
    };
    expect(err?.err?.message).toBe("secret internals");
    expect(err?.err?.stack).toContain("service.test.ts");
    expect(err?.rid).toBe(b.headers["x-request-id"]);
    await s.tracing.flush();
    const failed = exporter.getFinishedSpans().filter((x) => x.attributes["http.response.status_code"] === 500);
    expect(failed).toHaveLength(1);
  });

  it("enforces the response contract (or logs it in log mode)", async () => {
    const bad = implement(getPaymentIntent, async () => ({ ...pi, amount: "two hundred" }) as never);
    const enforce = make([bad]);
    const token = await secretKey();
    const r1 = await enforce.s.app.inject({
      url: `/v1/payment_intents/${pi.id}`,
      headers: { "x-nearpay-token": token },
    });
    expect(r1.statusCode).toBe(500);
    expect(enforce.logs.lines.find((l) => l.msg === "unhandled error")).toMatchObject({
      err: { message: expect.stringContaining("response of getPaymentIntent violates the contract: amount") },
    });
    const logOnly = make([bad], { responseValidation: "log" });
    const r2 = await logOnly.s.app.inject({
      url: `/v1/payment_intents/${pi.id}`,
      headers: { "x-nearpay-token": token },
    });
    expect(r2.statusCode).toBe(200);
    expect(logOnly.logs.lines.find((l) => l.msg === "response violates the contract")).toMatchObject({
      route: "getPaymentIntent",
    });
  });

  it("supports explicit statuses and headers with respond()", async () => {
    const { s } = make([implement(createCheckoutSession, async () => respond(200, CS, { "x-existing": "true" }))]);
    const res = await s.app.inject({
      method: "POST",
      url: "/v1/checkout/sessions",
      payload: { amount: 1, currency: "usd", success_url: "https://m.example" },
      headers: { "x-nearpay-token": await secretKey() },
    });
    expect([res.statusCode, res.headers["x-existing"]]).toEqual([200, "true"]);
  });

  it("sends raw bytes for binaryResponse routes with binary() / ctx.binary()", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7\n\x00\xff binary body");
    const inv = newId("in");
    const viaFn = make(
      [implement(getInvoicePdf, async () => binary(pdf, "application/pdf", { "cache-control": "private, no-store" }))],
      {
        name: "billing",
      },
    );
    const token = await secretKey();
    const r1 = await viaFn.s.app.inject({ url: `/v1/invoices/${inv}/pdf`, headers: { "x-nearpay-token": token } });
    expect(r1.statusCode).toBe(200);
    expect(r1.headers["content-type"]).toBe("application/pdf");
    expect(r1.headers["cache-control"]).toBe("private, no-store");
    expect(r1.headers["x-request-id"]).toBeTruthy();
    expect(r1.headers["content-length"]).toBe(String(pdf.byteLength));
    expect(new Uint8Array(r1.rawPayload)).toEqual(pdf);
    // a view into a larger buffer sends only its own bytes
    const big = new Uint8Array(64);
    big.set(pdf, 8);
    const viaCtx = make(
      [implement(getInvoicePdf, async (ctx) => ctx.binary(big.subarray(8, 8 + pdf.byteLength), "application/pdf"))],
      {
        name: "billing",
      },
    );
    const r2 = await viaCtx.s.app.inject({ url: `/v1/invoices/${inv}/pdf`, headers: { "x-nearpay-token": token } });
    expect(new Uint8Array(r2.rawPayload)).toEqual(pdf);
  });

  it("refuses bytes on JSON routes and a content type other than the route's", async () => {
    const token = await secretKey();
    const wrongType = make([implement(getInvoicePdf, async () => binary(new Uint8Array([1]), "text/html"))], {
      name: "billing",
    });
    const inv = newId("in");
    const r1 = await wrongType.s.app.inject({ url: `/v1/invoices/${inv}/pdf`, headers: { "x-nearpay-token": token } });
    expect(r1.statusCode).toBe(500);
    expect(wrongType.logs.lines.find((l) => l.msg === "unhandled error")).toMatchObject({
      err: { message: expect.stringContaining("content type text/html is not application/pdf") },
    });
    const logOnly = make([implement(getInvoicePdf, async () => binary(new Uint8Array([1]), "text/html"))], {
      name: "billing",
      responseValidation: "log",
    });
    const r2 = await logOnly.s.app.inject({ url: `/v1/invoices/${inv}/pdf`, headers: { "x-nearpay-token": token } });
    expect(r2.statusCode).toBe(200);
    expect(logOnly.logs.lines.find((l) => l.msg === "response violates the contract")).toMatchObject({
      route: "getInvoicePdf",
    });
    const onJson = make([
      implement(getPaymentIntent, async () => binary(new Uint8Array([1]), "application/pdf") as never),
    ]);
    const r3 = await onJson.s.app.inject({
      url: `/v1/payment_intents/${pi.id}`,
      headers: { "x-nearpay-token": token },
    });
    expect(r3.statusCode).toBe(500);
  });

  it("runs handlers inside the request context and continues the caller's trace", async () => {
    let ctxSeen: ReturnType<typeof currentContext> = {};
    const { s } = make([
      implement(getPaymentIntent, async (c) => {
        ctxSeen = currentContext();
        expect(c.deadline - Date.now()).toBeGreaterThan(9_000);
        expect(c.signal.aborted).toBe(false);
        return pi;
      }),
    ]);
    const token = await secretKey();
    const rid = newId("req");
    await s.app.inject({
      url: `/v1/payment_intents/${pi.id}`,
      headers: {
        "x-nearpay-token": token,
        "x-request-id": rid,
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      },
    });
    expect(ctxSeen.requestId).toBe(rid);
    expect(ctxSeen.token).toBe(token);
    expect(ctxSeen.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-(?!00f067aa0ba902b7)[0-9a-f]{16}-01$/);
  });

  it("answers within the budget when a handler overruns it", async () => {
    let finished = false;
    const { s, logs } = make([
      implement(
        getPaymentIntent,
        async (c) => {
          await sleep(300);
          finished = c.signal.aborted;
          return pi;
        },
        { budgetMs: 50 },
      ),
    ]);
    const t0 = Date.now();
    const res = await s.app.inject({
      url: `/v1/payment_intents/${pi.id}`,
      headers: { "x-nearpay-token": await secretKey() },
    });
    expect(Date.now() - t0).toBeLessThan(250);
    expect([res.statusCode, parseEnvelope(res.body).code]).toEqual([500, "api_error"]);
    await sleep(350);
    expect(finished).toBe(true);
    expect(logs.lines.some((l) => l.msg === "error after the response was sent")).toBe(false);
  });
});

describe("idempotency", () => {
  function memoryStore() {
    const done = new Map<string, { status: number; body: unknown }>();
    const calls: string[] = [];
    const store: IdempotencyStore = {
      async run(scope, fn) {
        calls.push(`${scope.accountId}:${scope.livemode}:${scope.key}:${scope.method} ${scope.path}`);
        if (scope.key === "busy") throw new IdempotencyConflict("idempotency_in_progress");
        const hit = done.get(scope.key);
        if (hit) return { ...hit, replayed: true };
        const r = await fn();
        done.set(scope.key, r);
        return { ...r, replayed: false };
      },
    };
    return { store, calls };
  }

  it("routes idempotent requests of account principals through the store", async () => {
    let runs = 0;
    const { store, calls } = memoryStore();
    const { s } = make(
      [
        implement(createCheckoutSession, async () => {
          runs++;
          return CS;
        }),
      ],
      { idempotency: store },
    );
    const token = await secretKey();
    const req = (key?: string) =>
      s.app.inject({
        method: "POST",
        url: "/v1/checkout/sessions?",
        payload: { amount: 1, currency: "usd", success_url: "https://m.example" },
        headers: { "x-nearpay-token": token, ...(key ? { "idempotency-key": key } : {}) },
      });
    const first = await req("k1");
    const again = await req("k1");
    expect([first.statusCode, first.headers["idempotent-replayed"]]).toEqual([201, undefined]);
    expect([again.statusCode, again.headers["idempotent-replayed"], again.json()]).toEqual([201, "true", CS]);
    expect(runs).toBe(1);
    expect(calls[0]).toMatch(/^[0-9a-f-]{36}:false:k1:POST \/v1\/checkout\/sessions$/);
    await req();
    expect(runs).toBe(2);
    const busy = await req("busy");
    expect([busy.statusCode, busy.headers["retry-after"], parseEnvelope(busy.body).code]).toEqual([
      409,
      "1",
      "idempotency_in_progress",
    ]);
  });
});

describe("streams", () => {
  it("serves server-sent events, validates payloads and ends streams on shutdown", async () => {
    let stream: SseStream | null = null;
    let closedByServer = false;
    const { s } = make([
      implement(streamCheckoutSession, async (ctx) => {
        const st = ctx.sse();
        stream = st;
        st.onClose(() => {
          closedByServer = true;
        });
        st.send("intent", { id: pi.id, status: "processing", amount_settled: "0", late: false }, "1");
        expect(() => st.send("intent", { id: "nope" })).toThrow(/does not match its schema/);
      }),
    ]);
    const { port } = await s.start();
    const res = await fetch(`http://127.0.0.1:${port}/v1/checkout/sessions/${CS.id}/public/stream`, {
      headers: { "x-nearpay-client-secret": SECRET },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    let text = "";
    while (!text.includes("event: intent")) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain("retry: 3000\n\n");
    expect(text).toContain(
      `id: 1\nevent: intent\ndata: {"id":"${pi.id}","status":"processing","amount_settled":"0","late":false}\n\n`,
    );
    expect(stream).not.toBeNull();
    await s.stop();
    expect(closedByServer).toBe(true);
    const rest = await reader.read();
    expect(rest.done).toBe(true);
  });
});

describe("construction and lifecycle", () => {
  it("rejects foreign, duplicate and unverifiable bindings", () => {
    const getPi = implement(getPaymentIntent, async () => pi);
    const foreign = PUBLIC_ROUTES.find((r) => r.service === "identity") as (typeof PUBLIC_ROUTES)[number];
    expect(() =>
      createService({
        name: "payments",
        config,
        routes: [implement(foreign, async () => undefined as never)],
        keys: testKeySource(),
      }),
    ).toThrow(/belongs to identity/);
    expect(() => createService({ name: "payments", config, routes: [getPi, getPi], keys: testKeySource() })).toThrow(
      /bound twice/,
    );
    expect(() => createService({ name: "payments", config, routes: [getPi] })).toThrow(/NP_JWKS_URL/);
    expect(() =>
      createService({
        name: "payments",
        config,
        routes: [implement(getPublicCheckoutSession, async () => ({}) as never)],
      }),
    ).not.toThrow();
  });

  it("lists spec routes a service has not bound yet", () => {
    const missing = unimplementedRoutes("payments", PUBLIC_ROUTES, [
      implement(getPaymentIntent, async () => pi),
      implement(listPaymentIntents, async () => ({}) as never),
    ]);
    expect(missing.map((r) => r.id)).toContain("createCheckoutSession");
    expect(missing.map((r) => r.id)).not.toContain("getPaymentIntent");
    expect(missing.every((r) => r.service === "payments")).toBe(true);
  });

  it("starts background tasks after listening, serves metrics, and drains in reverse order", async () => {
    const order: string[] = [];
    const task = (name: string) => ({
      name,
      start: async () => {
        order.push(`start ${name}`);
        return { stop: async () => void order.push(`stop ${name}`) };
      },
    });
    let release: () => void = () => {};
    const { s } = make(
      [
        implement(getPaymentIntent, async () => {
          await new Promise<void>((r) => {
            release = r;
          });
          return pi;
        }),
      ],
      { background: [task("relay"), task("consumer")] },
    );
    s.onShutdown(() => void order.push("close db"));
    s.onShutdown(() => void order.push("close bus"));
    s.metrics.collectOutboxLag(() => 1.5);
    s.metrics.collectConsumerLag(() => ({ "payments--EVT_RAILS": 3 }));
    const { port, metricsPort } = await s.start();
    expect(order).toEqual(["start relay", "start consumer"]);
    const inflight = fetch(`http://127.0.0.1:${port}/v1/payment_intents/${pi.id}`, {
      headers: { "x-nearpay-token": await secretKey() },
    });
    await sleep(100);
    const stopping = s.stop();
    expect(s.draining).toBe(true);
    expect((await s.ready()).status).toBe("draining");
    await sleep(50);
    release();
    expect((await inflight).status).toBe(200);
    await stopping;
    expect(order).toEqual(["start relay", "start consumer", "stop consumer", "stop relay", "close bus", "close db"]);
    await expect(fetch(`http://127.0.0.1:${port}/healthz`)).rejects.toThrow();
    void metricsPort;
  });

  it("exposes the mandatory metrics on the metrics port", async () => {
    const { s } = make([implement(getPaymentIntent, async () => pi)]);
    s.metrics.collectOutboxLag(() => 2.5);
    s.metrics.collectConsumerLag(() => ({ "payments--EVT_RAILS": 3 }));
    s.metrics.collectJobsDue(() => ({ "session.expire": 4 }));
    s.metrics.collectDeadLettersOpen(() => {
      throw new Error("db down");
    });
    s.metrics.observeExternalCall({ target: "rails", outcome: "ok", status: 200, ms: 12 });
    const { port, metricsPort } = await s.start();
    await fetch(`http://127.0.0.1:${port}/v1/payment_intents/${pi.id}`, {
      headers: { "x-nearpay-token": await secretKey() },
    });
    await fetch(`http://127.0.0.1:${port}/v1/nothing`);
    await fetch(`http://127.0.0.1:${port}/healthz`);
    const text = await (await fetch(`http://127.0.0.1:${metricsPort}/metrics`)).text();
    expect(text).toContain('nearpay_payments_http_requests_total{route="getPaymentIntent",code="200"} 1');
    expect(text).toContain('nearpay_payments_http_requests_total{route="unmatched",code="404"} 1');
    expect(text).not.toContain('route="health"');
    expect(text).toMatch(
      /nearpay_payments_http_request_duration_seconds_bucket\{le="0\.005",route="getPaymentIntent"\}/,
    );
    expect(text).toContain("nearpay_payments_outbox_lag_seconds 2.5");
    expect(text).toContain('nearpay_payments_consumer_lag_messages{durable="payments--EVT_RAILS"} 3');
    expect(text).toContain('nearpay_payments_jobs_due{kind="session.expire"} 4');
    expect(text).toContain("nearpay_payments_dead_letters_open -1");
    expect(text).toContain('nearpay_payments_external_calls_total{target="rails",outcome="ok"} 1');
    expect(text).toContain("nearpay_payments_external_call_duration_seconds_count");
    expect(text).toContain("nearpay_payments_process_cpu_seconds_total");
    expect((await fetch(`http://127.0.0.1:${metricsPort}/other`)).status).toBe(404);
  });

  it("fails /healthz when a background task stops beating for longer than maxSilenceMs (KIT-4)", async () => {
    let beat: () => void = () => {};
    const got: unknown[] = [];
    const { s, logs } = make([], {
      background: [
        {
          name: "poller",
          maxSilenceMs: 150,
          start: (hb) => {
            got.push(hb);
            beat = () => hb?.beat();
            return { stop: async () => {} };
          },
        },
        {
          name: "legacy",
          start: (hb) => {
            got.push(hb);
            return { stop: async () => {} };
          },
        },
      ],
    });
    await s.start();
    expect(got[0]).toBeDefined();
    expect(got[1]).toBeUndefined(); // no budget: no heartbeat, never part of liveness
    const ok = await s.app.inject("/healthz");
    expect([ok.statusCode, ok.body]).toEqual([200, "ok\n"]);
    await sleep(100);
    beat();
    await sleep(100);
    expect((await s.app.inject("/healthz")).statusCode).toBe(200); // 100 ms since the last beat
    await sleep(100);
    const dead = await s.app.inject("/healthz");
    expect(dead.statusCode).toBe(503);
    expect(dead.body).toMatch(/^stalled: poller \(silent 0 s, max 0 s\)/);
    expect(s.liveness()).toMatchObject({ status: "stalled", loops: { poller: { active: true, stalled: true } } });
    expect(logs.lines.filter((l) => l.msg === "ALERT background_task_stalled")).toHaveLength(1);
    beat();
    expect((await s.app.inject("/healthz")).statusCode).toBe(200);
  });

  it("does not fail /healthz for an idle loop (a leader follower) and recovers on its next beat", async () => {
    let hb: Heartbeat | undefined;
    const { s } = make([], {
      background: [
        {
          name: "leader:x",
          maxSilenceMs: 50,
          start: (h) => {
            hb = h;
            return { stop: async () => {} };
          },
        },
      ],
    });
    await s.start();
    hb?.idle();
    await sleep(120);
    expect((await s.app.inject("/healthz")).statusCode).toBe(200);
    expect(s.liveness().loops["leader:x"]).toMatchObject({ active: false, stalled: false });
    hb?.beat(); // won leadership
    expect((await s.app.inject("/healthz")).statusCode).toBe(200);
    await sleep(120);
    expect((await s.app.inject("/healthz")).statusCode).toBe(503);
  });

  it("registers loops directly, exports per-loop gauges, and forgets stopped tasks", async () => {
    const { s } = make([], {
      background: [{ name: "relay", maxSilenceMs: 60_000, start: () => ({ stop: async () => {} }) }],
    });
    const client = httpClient({ target: "kit4-gauge-probe", baseUrl: "http://127.0.0.1:1", timeoutMs: 100 });
    const reg = Symbol.for("nearpay.kit.bus.consumers");
    const g = globalThis as { [k: symbol]: unknown };
    const saved = g[reg];
    g[reg] = new Map([["payments--EVT_RAILS", new Set([{ running: () => false }])]]);
    onTestFinished(() => {
      g[reg] = saved;
    });
    const manual = s.heartbeat("ticker", 40);
    const twin = s.heartbeat("ticker", 40);
    expect(() => s.heartbeat("bad", 0)).toThrow(RangeError);
    twin.stop();
    const { metricsPort } = await s.start();
    await sleep(80);
    expect((await s.app.inject("/healthz")).statusCode).toBe(503);
    const text = await (await fetch(`http://127.0.0.1:${metricsPort}/metrics`)).text();
    expect(text).toMatch(
      /nearpay_payments_background_last_beat_seconds\{task="relay"\} 0\.\d+|nearpay_payments_background_last_beat_seconds\{task="relay"\} 0/,
    );
    expect(text).toContain('nearpay_payments_background_task_stalled{task="ticker"} 1');
    expect(text).toContain('nearpay_payments_background_task_stalled{task="relay"} 0');
    expect(text).not.toContain('task="ticker#2"');
    expect(text).toContain('nearpay_payments_http_breaker_open{target="kit4-gauge-probe"} 0');
    expect(text).toContain('nearpay_payments_consumer_running{durable="payments--EVT_RAILS"} 0');
    manual.stop();
    expect((await s.app.inject("/healthz")).statusCode).toBe(200);
    expect(client.breakerState()).toBe("closed");
    await s.stop();
    expect(s.liveness().loops).toEqual({});
  });

  it("cleans up when a background task fails to start", async () => {
    const stopped: string[] = [];
    const { s } = make([], {
      background: [
        { name: "ok", start: () => ({ stop: async () => void stopped.push("ok") }) },
        {
          name: "broken",
          start: () => {
            throw new Error("nats unreachable");
          },
        },
      ],
    });
    await expect(s.start()).rejects.toThrow("nats unreachable");
    expect(stopped).toEqual(["ok"]);
  });

  it("redacts PII and credentials in logs", async () => {
    const { s, logs } = make([]);
    s.log.info(
      {
        email: "a@b.c",
        payer: { email: "x@y.z", ip: "1.2.3.4" },
        headers: { authorization: "Bearer sk", "x-nearpay-token": "t" },
        secret: "whsec_1",
      },
      "probe",
    );
    const line = logs.lines.find((l) => l.msg === "probe");
    expect(JSON.stringify(line)).not.toMatch(/a@b\.c|x@y\.z|1\.2\.3\.4|Bearer sk|whsec_1|"t"/);
    expect(line).toMatchObject({ email: "[redacted]", payer: { email: "[redacted]", ip: "[redacted]" } });
  });
});
