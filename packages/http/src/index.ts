/**
 * Outbound HTTP (lld/00-foundations.md §10): timeout = min(remaining budget − 100 ms,
 * per-integration timeout); retries only for idempotent methods or requests with an
 * Idempotency-Key (3 attempts, 100 ms × 2^n ± 20 %); circuit breaker opens after 50 % failures
 * over ≥ 20 calls in 30 s and half-opens after 15 s; request id and traceparent propagate from the
 * current request context; calls authenticate with the service token (or, opted in, forward the
 * caller's request token).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  type AnyRoute,
  buildPath,
  type ErrorEnvelope,
  ErrorEnvelope as ErrorEnvelopeSchema,
  HEADERS,
  type RouteResponse,
} from "@nearpay/spec";

// ---------------------------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------------------------

export interface RequestContext {
  readonly requestId?: string;
  readonly traceparent?: string;
  /** Absolute deadline (epoch ms) of the inbound request. */
  readonly deadline?: number;
  /** Request token to forward on calls made for this request. */
  readonly token?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext {
  return storage.getStore() ?? {};
}

// ---------------------------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------------------------

export interface BreakerOptions {
  failureRate?: number;
  minCalls?: number;
  windowMs?: number;
  halfOpenAfterMs?: number;
}

export type BreakerState = "closed" | "open" | "half_open";

export class BreakerOpenError extends Error {
  constructor(readonly target: string) {
    super(`circuit open for ${target}`);
    this.name = "BreakerOpenError";
  }
}

export function circuitBreaker(opts: BreakerOptions = {}, now: () => number = Date.now) {
  const rate = opts.failureRate ?? 0.5;
  const minCalls = opts.minCalls ?? 20;
  const windowMs = opts.windowMs ?? 30_000;
  const halfOpenAfter = opts.halfOpenAfterMs ?? 15_000;
  let calls: { t: number; ok: boolean }[] = [];
  let state: BreakerState = "closed";
  let openedAt = 0;
  let probing = false;

  const prune = () => {
    const cutoff = now() - windowMs;
    calls = calls.filter((c) => c.t >= cutoff);
  };

  return {
    state(): BreakerState {
      if (state === "open" && now() - openedAt >= halfOpenAfter) state = "half_open";
      return state;
    },
    /** Throws BreakerOpenError when calls are not allowed. */
    beforeCall(target: string): void {
      const s = this.state();
      if (s === "open") throw new BreakerOpenError(target);
      if (s === "half_open") {
        if (probing) throw new BreakerOpenError(target);
        probing = true;
      }
    },
    record(ok: boolean): void {
      if (state === "half_open" || probing) {
        probing = false;
        if (ok) {
          state = "closed";
          calls = [];
        } else {
          state = "open";
          openedAt = now();
        }
        return;
      }
      calls.push({ t: now(), ok });
      prune();
      const failures = calls.filter((c) => !c.ok).length;
      if (calls.length >= minCalls && failures / calls.length >= rate) {
        state = "open";
        openedAt = now();
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

/** A non-2xx response; `error` is the parsed NearPay envelope when the body is one. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly error: ErrorEnvelope["error"] | null,
    readonly body: unknown,
    readonly target: string,
    /** Seconds from a `Retry-After` header, if any. */
    readonly retryAfter: number | null = null,
  ) {
    super(`${target} responded ${status}${error ? ` ${error.code}` : ""}`);
    this.name = "HttpError";
  }
}

export class TimeoutError extends Error {
  constructor(
    readonly target: string,
    readonly timeoutMs: number,
  ) {
    super(`${target} timed out after ${timeoutMs} ms`);
    this.name = "TimeoutError";
  }
}

export interface HttpClientOptions {
  /** Target name for metrics and errors (e.g. `rails`). */
  readonly target: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Total attempts for retryable requests (default 3). */
  readonly attempts?: number;
  readonly breaker?: BreakerOptions | false;
  /**
   * Service token for `X-NearPay-Token` (foundations §9). Internal routes authorize `service:<scope>`
   * principals, so service-to-service calls authenticate as the calling service, inside a request too.
   */
  readonly serviceToken?: () => Promise<string>;
  /**
   * Forward the inbound request token instead, when the current request has one (for targets that
   * authorize the original caller's principal). Default false.
   */
  readonly forwardRequestToken?: boolean;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  /** Observer for metrics: outcome per attempt. */
  readonly onResult?: (r: {
    target: string;
    outcome: "ok" | "error" | "timeout" | "breaker_open";
    status?: number;
    ms: number;
  }) => void;
}

export interface RequestOptions {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | undefined | readonly string[]>;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly idempotencyKey?: string;
  /** Per-call timeout override (still capped by the remaining budget). */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: T;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function queryString(q: RequestOptions["query"]): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const x of v) p.append(`${k}[]`, String(x));
    else p.append(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Drops a caller-supplied `X-NearPay-Token` (case-insensitive): route calls authenticate as the client. */
function withoutTokenHeader(h: Record<string, string>): Record<string, string> {
  const token = HEADERS.token.toLowerCase();
  return Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase() !== token));
}

export function httpClient(opts: HttpClientOptions) {
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const attempts = opts.attempts ?? 3;
  const breaker = opts.breaker === false ? null : circuitBreaker(opts.breaker ?? {}, now);
  const base = opts.baseUrl.replace(/\/$/, "");

  async function attempt(o: RequestOptions, ctx: RequestContext): Promise<HttpResponse> {
    const remaining = ctx.deadline !== undefined ? ctx.deadline - now() - 100 : Number.POSITIVE_INFINITY;
    const timeout = Math.min(o.timeoutMs ?? opts.timeoutMs, remaining);
    if (timeout <= 0) throw new TimeoutError(opts.target, 0);
    breaker?.beforeCall(opts.target);
    const headers: Record<string, string> = { accept: "application/json", ...o.headers };
    if (o.body !== undefined) headers["content-type"] = "application/json";
    if (ctx.requestId) headers[HEADERS.requestId] = ctx.requestId;
    if (ctx.traceparent) headers[HEADERS.traceparent] = ctx.traceparent;
    if (o.idempotencyKey) headers[HEADERS.idempotencyKey] = o.idempotencyKey;
    if (!headers[HEADERS.token]) {
      const token =
        opts.forwardRequestToken && ctx.token ? ctx.token : opts.serviceToken ? await opts.serviceToken() : undefined;
      if (token) headers[HEADERS.token] = token;
    }
    const started = now();
    const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    let res: Response;
    try {
      res = await f(`${base}${o.path}${queryString(o.query)}`, {
        method: o.method,
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal,
      });
    } catch (e) {
      breaker?.record(false);
      const timedOut = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
      opts.onResult?.({ target: opts.target, outcome: timedOut ? "timeout" : "error", ms: now() - started });
      if (timedOut && !o.signal?.aborted) throw new TimeoutError(opts.target, timeout);
      throw e;
    }
    const text = await res.text();
    let body: unknown = text;
    if (text && (res.headers.get("content-type") ?? "").includes("json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    breaker?.record(res.status < 500);
    opts.onResult?.({
      target: opts.target,
      outcome: res.status < 500 ? "ok" : "error",
      status: res.status,
      ms: now() - started,
    });
    if (!res.ok) {
      const env = ErrorEnvelopeSchema.safeParse(body);
      const ra = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      throw new HttpError(
        res.status,
        env.success ? env.data.error : null,
        body,
        opts.target,
        Number.isFinite(ra) && ra >= 0 ? ra : null,
      );
    }
    return { status: res.status, headers: res.headers, body: res.status === 204 ? undefined : body };
  }

  function retryable(o: RequestOptions, e: unknown): boolean {
    if (!(IDEMPOTENT_METHODS.has(o.method) || o.idempotencyKey)) return false;
    if (e instanceof BreakerOpenError) return false;
    if (e instanceof HttpError) return RETRYABLE_STATUS.has(e.status) || e.error?.code === "idempotency_in_progress";
    return true; // network errors and timeouts
  }

  /** Honour Retry-After (capped at 5 s so one call never stalls a request budget). */
  function retryAfterMs(e: unknown): number | null {
    return e instanceof HttpError && e.retryAfter !== null ? Math.min(e.retryAfter * 1000, 5_000) : null;
  }

  return {
    breakerState: (): BreakerState => breaker?.state() ?? "closed",

    async request<T = unknown>(o: RequestOptions): Promise<HttpResponse<T>> {
      const ctx = currentContext();
      let last: unknown;
      for (let i = 0; i < attempts; i++) {
        try {
          return (await attempt(o, ctx)) as HttpResponse<T>;
        } catch (e) {
          last = e;
          if (e instanceof BreakerOpenError) opts.onResult?.({ target: opts.target, outcome: "breaker_open", ms: 0 });
          if (i === attempts - 1 || !retryable(o, e)) throw e;
          const backoff = 100 * 2 ** i * (0.8 + 0.4 * random());
          const wait = retryAfterMs(e) ?? backoff;
          if (ctx.deadline !== undefined && now() + wait >= ctx.deadline - 100) throw e;
          await sleep(wait);
        }
      }
      throw last;
    },

    /**
     * Calls a spec route, validating the response against its schema. `headers` adds request
     * headers the route declares (e.g. `X-NearPay-Client-Secret` forwarded by agentpay, CR-15-16);
     * they never replace the auth token set by the client.
     */
    async call<R extends AnyRoute>(
      route: R,
      p: {
        params?: Record<string, string>;
        query?: RequestOptions["query"];
        body?: unknown;
        idempotencyKey?: string;
        timeoutMs?: number;
        headers?: Record<string, string>;
      } = {},
    ): Promise<RouteResponse<R>> {
      const res = await this.request({
        method: route.method,
        path: buildPath(route, p.params),
        query: p.query,
        body: p.body,
        idempotencyKey: p.idempotencyKey,
        timeoutMs: p.timeoutMs,
        headers: p.headers ? withoutTokenHeader(p.headers) : undefined,
      });
      if (!route.response) return undefined as RouteResponse<R>;
      return route.response.parse(res.body) as RouteResponse<R>;
    },
  };
}

export type HttpClient = ReturnType<typeof httpClient>;
