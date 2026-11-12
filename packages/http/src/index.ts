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
} from "@nearpay-money/spec";

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
  /**
   * A half-open probe that has neither reported (`record`) nor been released within this time counts as failed: the
   * breaker re-opens and half-opens again after `halfOpenAfterMs` (default 30 s). A safety net only — the client
   * always reports or releases its probe; this bounds the damage of a caller that does not (KIT-2).
   */
  probeTimeoutMs?: number;
  /** Called on every state change (logs, metrics). Exceptions are swallowed. */
  onStateChange?: (state: BreakerState, previous: BreakerState) => void;
}

export type BreakerState = "closed" | "open" | "half_open";

/**
 * What `beforeCall` grants: hand it back to `record` (verdict) or `release` (no verdict). `probe` marks the single
 * half-open trial call. `generation` ties the result to the breaker period it started in, so a call that began before
 * the breaker opened can never close it, and a probe that timed out cannot decide the next one.
 */
export interface BreakerPermit {
  readonly probe: boolean;
  readonly generation: number;
}

export class BreakerOpenError extends Error {
  constructor(readonly target: string) {
    super(`circuit open for ${target}`);
    this.name = "BreakerOpenError";
  }
}

export interface CircuitBreaker {
  /** Current state (open turns half-open after `halfOpenAfterMs`; a stale probe re-opens). */
  state(): BreakerState;
  /** Throws BreakerOpenError when calls are not allowed; otherwise returns the permit for this call. */
  beforeCall(target: string): BreakerPermit;
  /**
   * Reports a call's outcome. With the permit from `beforeCall`, only results that belong to the current period count;
   * without one (legacy callers) a result while half-open decides the probe.
   */
  record(ok: boolean, permit?: BreakerPermit): void;
  /** Returns a permit without a verdict (the call never reached the target, or the caller aborted it). */
  release(permit: BreakerPermit): void;
}

/**
 * Opens at `failureRate` failures over ≥ `minCalls` calls in `windowMs`; half-opens after `halfOpenAfterMs`, then lets
 * exactly one probe through: success closes, failure re-opens. The probe slot is freed on every outcome — `record`,
 * `release`, or the `probeTimeoutMs` safety net — so the breaker always eventually closes or re-opens and can never
 * stay half-open refusing every call (audit KIT-2).
 */
export function circuitBreaker(opts: BreakerOptions = {}, now: () => number = Date.now): CircuitBreaker {
  const rate = opts.failureRate ?? 0.5;
  const minCalls = opts.minCalls ?? 20;
  const windowMs = opts.windowMs ?? 30_000;
  const halfOpenAfter = opts.halfOpenAfterMs ?? 15_000;
  const probeTimeout = opts.probeTimeoutMs ?? 30_000;
  let calls: { t: number; ok: boolean }[] = [];
  let current: BreakerState = "closed";
  let generation = 0;
  let openedAt = 0;
  let probing = false;
  let probeStartedAt = 0;

  const transition = (next: BreakerState) => {
    if (next === current) return;
    const previous = current;
    current = next;
    generation++;
    probing = false;
    if (next === "open") openedAt = now();
    if (next === "closed") calls = [];
    try {
      opts.onStateChange?.(next, previous);
    } catch {
      // an observer must never break the breaker
    }
  };

  const prune = () => {
    const cutoff = now() - windowMs;
    calls = calls.filter((c) => c.t >= cutoff);
  };

  const resolveProbe = (ok: boolean) => transition(ok ? "closed" : "open");

  const state = (): BreakerState => {
    if (current === "open" && now() - openedAt >= halfOpenAfter) transition("half_open");
    if (current === "half_open" && probing && now() - probeStartedAt >= probeTimeout) transition("open");
    return current;
  };

  return {
    state,
    beforeCall(target) {
      const s = state();
      if (s === "open") throw new BreakerOpenError(target);
      if (s === "half_open") {
        if (probing) throw new BreakerOpenError(target);
        probing = true;
        probeStartedAt = now();
        return { probe: true, generation };
      }
      return { probe: false, generation };
    },
    record(ok, permit) {
      const s = state();
      if (permit) {
        if (permit.generation !== generation) return; // a result from an earlier period
        if (permit.probe) {
          if (s === "half_open" && probing) resolveProbe(ok);
          return;
        }
        if (s !== "closed") return;
      } else if (s === "half_open" || probing) {
        resolveProbe(ok);
        return;
      } else if (s === "open") {
        return;
      }
      calls.push({ t: now(), ok });
      prune();
      const failures = calls.filter((c) => !c.ok).length;
      if (calls.length >= minCalls && failures / calls.length >= rate) transition("open");
    },
    release(permit) {
      if (permit.probe && permit.generation === generation && current === "half_open") probing = false;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Breaker registry (metrics: `http_breaker_open{target}`)
// ---------------------------------------------------------------------------------------------

const breakers = new Set<WeakRef<CircuitBreaker>>();
const breakerTargets = new WeakMap<CircuitBreaker, string>();

/**
 * State of every live client breaker, by target (the least healthy one when several clients share a target).
 * `@nearpay-internal/service` exports it as `http_breaker_open{target}` (1 when open or half-open).
 */
export function breakerStates(): Record<string, BreakerState> {
  const rank = { closed: 0, half_open: 1, open: 2 } as const;
  const out: Record<string, BreakerState> = {};
  for (const ref of breakers) {
    const breaker = ref.deref();
    const target = breaker && breakerTargets.get(breaker);
    if (!breaker || target === undefined) {
      breakers.delete(ref);
      continue;
    }
    const s = breaker.state();
    const prev = out[target];
    if (prev === undefined || rank[s] > rank[prev]) out[target] = s;
  }
  return out;
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
  /** Called when the client's circuit breaker changes state (logs; the gauge is automatic, see `breakerStates`). */
  readonly onBreakerStateChange?: (state: BreakerState, target: string) => void;
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
  const breakerOpts = opts.breaker === false ? null : (opts.breaker ?? {});
  const breaker =
    breakerOpts === null
      ? null
      : circuitBreaker(
          {
            // A probe outlives at most one call (timeout covers the body read), plus slack.
            probeTimeoutMs: Math.max(30_000, 2 * opts.timeoutMs),
            ...breakerOpts,
            onStateChange: (state, previous) => {
              breakerOpts.onStateChange?.(state, previous);
              opts.onBreakerStateChange?.(state, opts.target);
            },
          },
          now,
        );
  if (breaker) {
    breakerTargets.set(breaker, opts.target);
    breakers.add(new WeakRef(breaker));
  }
  const base = opts.baseUrl.replace(/\/$/, "");

  async function attempt(o: RequestOptions, ctx: RequestContext): Promise<HttpResponse> {
    const remaining = ctx.deadline !== undefined ? ctx.deadline - now() - 100 : Number.POSITIVE_INFINITY;
    const timeout = Math.min(o.timeoutMs ?? opts.timeoutMs, remaining);
    if (timeout <= 0) throw new TimeoutError(opts.target, 0);
    // Everything that can fail without contacting the target happens before the breaker grants a permit: a failing
    // token source (identity down) or an unserialisable body must never hold the half-open probe slot (KIT-2).
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
    const payload = o.body === undefined ? undefined : JSON.stringify(o.body);
    const url = `${base}${o.path}${queryString(o.query)}`;

    const permit = breaker?.beforeCall(opts.target);
    // Verdict for the breaker: true/false = the target answered well/badly; null = no verdict (the caller aborted).
    let verdict = false as boolean | null;
    const started = now();
    const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    let res: Response;
    let text: string;
    try {
      res = await f(url, { method: o.method, headers, body: payload, signal });
      text = await res.text(); // the timeout signal covers the body read too
      verdict = res.status < 500;
    } catch (e) {
      const timedOut = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
      const callerAborted = timedOut && o.signal?.aborted === true;
      verdict = callerAborted ? null : false;
      opts.onResult?.({ target: opts.target, outcome: timedOut ? "timeout" : "error", ms: now() - started });
      if (timedOut && !callerAborted) throw new TimeoutError(opts.target, timeout);
      throw e;
    } finally {
      // Always settle the permit — success, failure, timeout or abort — so a probe can never leak (KIT-2).
      if (breaker && permit) {
        if (verdict === null) breaker.release(permit);
        else breaker.record(verdict, permit);
      }
    }
    let body: unknown = text;
    if (text && (res.headers.get("content-type") ?? "").includes("json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
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
