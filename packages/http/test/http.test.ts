import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getPaymentIntent } from "@nearpay/spec";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BreakerOpenError, circuitBreaker, HttpError, httpClient, runWithContext, TimeoutError } from "../src/index.js";

let server: Server;
let base = "";
const seen: { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }[] =
  [];
let script:
  | ((n: number) => { status: number; body?: unknown; delayMs?: number; headers?: Record<string, string> })
  | null = null;
let count = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      seen.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      const r = script ? script(count++) : { status: 200, body: { ok: true } };
      setTimeout(() => {
        res.writeHead(r.status, { "content-type": "application/json", ...r.headers });
        res.end(r.status === 204 ? undefined : JSON.stringify(r.body ?? {}));
      }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

function reset(s: typeof script) {
  script = s;
  count = 0;
  seen.length = 0;
}
const fast = { sleep: async () => {}, random: () => 0.5 };

describe("httpClient", () => {
  it("propagates request id, traceparent and (opted in) the request token; encodes array queries", async () => {
    reset(null);
    const c = httpClient({
      target: "t",
      baseUrl: base,
      timeoutMs: 1000,
      forwardRequestToken: true,
      serviceToken: async () => "svc",
      ...fast,
    });
    await runWithContext({ requestId: "req_x", traceparent: "00-a-b-01", token: "tok" }, () =>
      c.request({ method: "GET", path: "/x", query: { expand: ["payment_intent"], limit: 2, skip: undefined } }),
    );
    expect(seen[0]?.url).toBe("/x?expand%5B%5D=payment_intent&limit=2");
    expect(seen[0]?.headers["x-request-id"]).toBe("req_x");
    expect(seen[0]?.headers.traceparent).toBe("00-a-b-01");
    expect(seen[0]?.headers["x-nearpay-token"]).toBe("tok");
  });

  it("authenticates with the service token by default, inside a request too", async () => {
    reset(null);
    const c = httpClient({ target: "t", baseUrl: base, timeoutMs: 1000, serviceToken: async () => "svc", ...fast });
    await c.request({ method: "GET", path: "/y" });
    await runWithContext({ requestId: "req_x", token: "tok" }, () => c.request({ method: "GET", path: "/y" }));
    expect(seen.map((s) => s.headers["x-nearpay-token"])).toEqual(["svc", "svc"]);
    const fwd = httpClient({
      target: "t",
      baseUrl: base,
      timeoutMs: 1000,
      forwardRequestToken: true,
      serviceToken: async () => "svc",
      ...fast,
    });
    await fwd.request({ method: "GET", path: "/y" });
    expect(seen[2]?.headers["x-nearpay-token"]).toBe("svc");
    const none = httpClient({ target: "t", baseUrl: base, timeoutMs: 1000, ...fast });
    await runWithContext({ token: "tok" }, () =>
      none.request({ method: "GET", path: "/y", headers: { "X-NearPay-Token": "explicit" } }),
    );
    await none.request({ method: "GET", path: "/y" });
    expect(seen[3]?.headers["x-nearpay-token"]).toBe("explicit");
    expect(seen[4]?.headers["x-nearpay-token"]).toBeUndefined();
  });

  it("retries idempotent requests on 5xx and stops after 3 attempts", async () => {
    reset(() => ({
      status: 503,
      body: {
        error: {
          type: "api_error",
          code: "api_error",
          message: "m",
          doc_url: "https://docs.nearpay.money/errors/api_error",
          request_id: "req_01jbz9k3m4n5p6q7r8s9t0v1w2",
        },
      },
    }));
    const c = httpClient({ target: "rails", baseUrl: base, timeoutMs: 1000, breaker: false, ...fast });
    const err = await c.request({ method: "GET", path: "/z" }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.error.code).toBe("api_error");
    expect(seen).toHaveLength(3);
  });

  it("never retries a POST without an Idempotency-Key, retries one with it", async () => {
    reset((n) => (n === 0 ? { status: 502 } : { status: 201, body: { id: 1 } }));
    const c = httpClient({ target: "t", baseUrl: base, timeoutMs: 1000, breaker: false, ...fast });
    await expect(c.request({ method: "POST", path: "/p", body: {} })).rejects.toBeInstanceOf(HttpError);
    expect(seen).toHaveLength(1);
    reset((n) => (n === 0 ? { status: 502 } : { status: 201, body: { id: 1 } }));
    const r = await c.request({ method: "POST", path: "/p", body: { a: 1 }, idempotencyKey: "attempt:pa_1" });
    expect(r.body).toEqual({ id: 1 });
    expect(seen.map((s) => s.headers["idempotency-key"])).toEqual(["attempt:pa_1", "attempt:pa_1"]);
    expect(seen[1]?.body).toBe('{"a":1}');
  });

  it("does not retry 4xx except 409 idempotency_in_progress and 429", async () => {
    reset(() => ({ status: 400, body: {} }));
    const c = httpClient({ target: "t", baseUrl: base, timeoutMs: 1000, breaker: false, ...fast });
    await expect(c.request({ method: "GET", path: "/q" })).rejects.toMatchObject({ status: 400 });
    expect(seen).toHaveLength(1);
    const env = {
      error: {
        type: "idempotency_error",
        code: "idempotency_in_progress",
        message: "m",
        doc_url: "https://docs.nearpay.money/errors/idempotency_in_progress",
        request_id: "req_01jbz9k3m4n5p6q7r8s9t0v1w2",
      },
    };
    reset((n) =>
      n === 0
        ? { status: 409, body: env }
        : n === 1
          ? { status: 429, headers: { "retry-after": "0" } }
          : { status: 200, body: {} },
    );
    const sleeps: number[] = [];
    const c2 = httpClient({
      target: "t",
      baseUrl: base,
      timeoutMs: 1000,
      breaker: false,
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0.5,
    });
    await c2.request({ method: "POST", path: "/q", idempotencyKey: "k" });
    expect(seen).toHaveLength(3);
    expect(sleeps).toEqual([100, 0]); // backoff 100 ms, then Retry-After: 0
  });

  it("times out per call and respects the remaining request budget", async () => {
    reset(() => ({ status: 200, body: {}, delayMs: 300 }));
    const c = httpClient({ target: "slow", baseUrl: base, timeoutMs: 50, attempts: 1, breaker: false });
    await expect(c.request({ method: "GET", path: "/s" })).rejects.toBeInstanceOf(TimeoutError);
    const c2 = httpClient({ target: "slow", baseUrl: base, timeoutMs: 5000, attempts: 1, breaker: false });
    const t0 = Date.now();
    await expect(
      runWithContext({ deadline: Date.now() + 200 }, () => c2.request({ method: "GET", path: "/s" })),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - t0).toBeLessThan(250);
    await expect(
      runWithContext({ deadline: Date.now() + 50 }, () => c2.request({ method: "GET", path: "/s" })),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("calls spec routes and validates responses", async () => {
    reset(() => ({ status: 200, body: { not: "an intent" } }));
    const c = httpClient({ target: "payments", baseUrl: base, timeoutMs: 1000, ...fast });
    await expect(c.call(getPaymentIntent, { params: { id: "pi_01jbz9k3m4n5p6q7r8s9t0v1w2" } })).rejects.toThrow();
    expect(seen[0]?.url).toBe("/v1/payment_intents/pi_01jbz9k3m4n5p6q7r8s9t0v1w2");
  });

  it("reports results for metrics", async () => {
    reset(null);
    const onResult = vi.fn();
    await httpClient({ target: "t", baseUrl: base, timeoutMs: 1000, onResult }).request({ method: "GET", path: "/m" });
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ target: "t", outcome: "ok", status: 200 }));
  });
});

describe("circuitBreaker", () => {
  it("opens at ≥ 50 % failures over ≥ 20 calls, half-opens after 15 s, closes on a good probe", () => {
    let t = 0;
    const b = circuitBreaker({}, () => t);
    for (let i = 0; i < 19; i++) b.record(false);
    expect(b.state()).toBe("closed");
    b.record(true);
    expect(b.state()).toBe("open");
    expect(() => b.beforeCall("x")).toThrow(BreakerOpenError);
    t += 15_000;
    expect(b.state()).toBe("half_open");
    b.beforeCall("x");
    expect(() => b.beforeCall("x")).toThrow(BreakerOpenError); // one probe at a time
    b.record(true);
    expect(b.state()).toBe("closed");
  });
  it("re-opens on a failed probe and forgets failures outside the 30 s window", () => {
    let t = 0;
    const b = circuitBreaker({}, () => t);
    for (let i = 0; i < 20; i++) b.record(false);
    t += 15_000;
    b.beforeCall("x");
    b.record(false);
    expect(b.state()).toBe("open");
    const c = circuitBreaker({}, () => t);
    for (let i = 0; i < 15; i++) c.record(false);
    t += 31_000;
    for (let i = 0; i < 10; i++) c.record(false);
    for (let i = 0; i < 10; i++) c.record(true);
    expect(c.state()).toBe("open"); // 10/20 in window
    const d = circuitBreaker({}, () => t);
    for (let i = 0; i < 9; i++) d.record(false);
    for (let i = 0; i < 11; i++) d.record(true);
    expect(d.state()).toBe("closed"); // 45 %
  });
  it("short-circuits client calls while open", async () => {
    reset(() => ({ status: 500 }));
    const c = httpClient({
      target: "down",
      baseUrl: base,
      timeoutMs: 1000,
      attempts: 1,
      breaker: { minCalls: 2 },
      ...fast,
    });
    await expect(c.request({ method: "GET", path: "/a" })).rejects.toBeInstanceOf(HttpError);
    await expect(c.request({ method: "GET", path: "/a" })).rejects.toBeInstanceOf(HttpError);
    expect(c.breakerState()).toBe("open");
    await expect(c.request({ method: "GET", path: "/a" })).rejects.toBeInstanceOf(BreakerOpenError);
    expect(seen).toHaveLength(2);
  });
});
