/**
 * Service bootstrap (lld/00-foundations.md §4, §9–§13): a Fastify app serving spec routes with
 * internal-token authentication and route authorization, request ids, W3C trace context, request
 * budgets (10 s public / 5 s internal), zod validation in the API's parameter notation, error
 * envelopes, optional automatic idempotency, SSE, `/healthz` + `/readyz` on :8080, Prometheus
 * metrics on :9464, background tasks, and a graceful drain.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type AnyRoute,
  HEADERS,
  type RouteDefinition,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
  type ServiceName,
  toFastifyPath,
} from "@nearpay/spec";
import {
  AuthError,
  authorizeRoute,
  type InternalClaims,
  jwksCache,
  type KeySource,
  verifyInternalJwt,
} from "@nearpay-internal/auth";
import { runWithContext } from "@nearpay-internal/http";
import { isId, newId, toUuid } from "@nearpay-internal/ids";
import type { Span } from "@opentelemetry/api";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  LogController,
  type RawServerDefault,
} from "fastify";
import type { DestinationStream } from "pino";
import type { z } from "zod";
import type { BaseConfig } from "./config.js";
import { ApiError, fromZodError, toErrorResponse } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";
import { createMetrics, type ServiceMetrics, serveMetrics } from "./metrics.js";
import { parseQuery } from "./query.js";
import { openSse, type SseLimits, type SseStream } from "./sse.js";
import { formatTraceparent, SpanKind, SpanStatusCode, startSpan, startTracing, type Tracing } from "./tracing.js";

// ---------------------------------------------------------------------------------------------
// Route bindings
// ---------------------------------------------------------------------------------------------

/** Request body after validation. */
export type RouteBodyOut<R> =
  R extends RouteDefinition<infer _P, infer _Q, infer B, infer _R>
    ? B extends z.ZodType
      ? z.output<B>
      : undefined
    : never;
/** Request headers after validation (lower-case names). */
export type RouteHeadersOut<R extends AnyRoute> = R["headers"] extends z.ZodType
  ? z.output<R["headers"]>
  : Readonly<Record<string, string | string[] | undefined>>;
/** Event names of a streaming route. */
export type RouteEvents<R extends AnyRoute> =
  NonNullable<R["stream"]> extends { events: infer E } ? Extract<keyof E, string> : never;

export interface RequestContext<R extends AnyRoute = AnyRoute> {
  readonly route: R;
  readonly params: RouteParams<R>;
  readonly query: RouteQuery<R>;
  readonly body: RouteBodyOut<R>;
  readonly headers: RouteHeadersOut<R>;
  /** Exact request bytes (signature verification of provider webhooks). */
  readonly rawBody: Buffer | undefined;
  /** The authorized principal; null on open routes (`anonymous`, `client_secret`, `internal`, …) without one. */
  readonly principal: InternalClaims | null;
  /** Livemode of the principal (false without one). */
  readonly livemode: boolean;
  readonly requestId: string;
  readonly idempotencyKey: string | undefined;
  /** Epoch ms by which the response must be sent (outbound calls use the remaining budget). */
  readonly deadline: number;
  /** Aborted when the budget is exhausted or the client goes away. */
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly span: Span;
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
  /** Opens the route's server-sent-event stream (routes with `stream` only); `limits` on the first call only. */
  sse(limits?: SseLimits): SseStream<RouteEvents<R>>;
}

const RESPONDED = Symbol("nearpay.responded");

export interface Responded<T> {
  readonly [RESPONDED]: true;
  readonly status: number;
  readonly body: T;
  readonly headers: Readonly<Record<string, string>>;
}

/** A success response with a status other than the route's default, or extra headers. */
export function respond<T>(status: 200 | 201 | 202 | 204, body: T, headers: Record<string, string> = {}): Responded<T> {
  return { [RESPONDED]: true, status, body, headers };
}

const isResponded = (v: unknown): v is Responded<unknown> => typeof v === "object" && v !== null && RESPONDED in v;

/** Body-less and streaming routes' handlers simply return (a `void` function). */
// biome-ignore lint/suspicious/noConfusingVoidType: a handler without a return statement returns Promise<void>.
type NoBody<R extends AnyRoute> = undefined extends RouteResponse<R> ? void : never;

/** Returns the response body (or `respond(…)`); routes without a body and streaming routes return nothing. */
export type Handler<R extends AnyRoute> = (
  ctx: RequestContext<R>,
) => Promise<RouteResponse<R> | Responded<RouteResponse<R>> | NoBody<R>>;

export interface BindingOptions {
  /** Request budget override in ms (default 10 000 public, 5 000 internal). */
  budgetMs?: number;
  /** Body size limit in bytes (default 1 MiB). */
  bodyLimit?: number;
}

export interface RouteBinding {
  readonly route: AnyRoute;
  readonly handler: Handler<AnyRoute>;
  readonly options: BindingOptions;
}

/** Binds a handler to a spec route. */
export function implement<R extends AnyRoute>(
  route: R,
  handler: Handler<R>,
  options: BindingOptions = {},
): RouteBinding {
  return { route, handler: handler as unknown as Handler<AnyRoute>, options };
}

/** Spec routes of `service` (up to `stage`) that have no binding — for each service's contract test. */
export function unimplementedRoutes(
  service: ServiceName,
  routes: readonly AnyRoute[],
  bindings: readonly RouteBinding[],
  stage = 1,
): AnyRoute[] {
  const bound = new Set(bindings.map((b) => b.route.id));
  return routes.filter((r) => r.service === service && r.stage <= stage && !bound.has(r.id));
}

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------

export interface IdempotencyScope {
  accountId: string;
  livemode: boolean;
  key: string;
  method: string;
  path: string;
  body: unknown;
}

/** Stores idempotent results (`@nearpay-internal/db` `idempotencyStore`). */
export interface IdempotencyStore {
  run(
    scope: IdempotencyScope,
    fn: () => Promise<{ status: number; body: unknown }>,
  ): Promise<{ status: number; body: unknown; replayed: boolean }>;
}

export interface BackgroundTask {
  readonly name: string;
  start(): { stop(): Promise<void> } | Promise<{ stop(): Promise<void> }>;
}

export type ReadinessCheck = () => Promise<unknown> | unknown;

export interface ServiceOptions {
  name: ServiceName;
  config: BaseConfig;
  routes?: readonly RouteBinding[];
  /** Verifies internal tokens; default: JWKS cache over `config.jwksUrl`. */
  keys?: KeySource;
  /** Automatic idempotency for `idempotent` routes called by an account principal with `Idempotency-Key`. */
  idempotency?: IdempotencyStore;
  readiness?: Record<string, ReadinessCheck>;
  /** Started after the listener is up, stopped (in reverse) during the drain. */
  background?: readonly BackgroundTask[];
  /** Check handler responses against the route schema: `enforce` (500 on violation), `log`, or `off`. Default `enforce`, `log` when env=server. */
  responseValidation?: "enforce" | "log" | "off";
  logDestination?: DestinationStream;
  tracing?: Tracing;
  metrics?: ServiceMetrics;
  /** Per-check readiness timeout (default 2 s). */
  readinessTimeoutMs?: number;
}

export interface ReadyReport {
  status: "ready" | "not_ready" | "draining";
  checks: Record<string, "ok" | string>;
}

export type ServiceApp = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse<IncomingMessage>, Logger>;

export interface Service {
  readonly name: ServiceName;
  readonly app: ServiceApp;
  readonly log: Logger;
  readonly metrics: ServiceMetrics;
  readonly tracing: Tracing;
  readonly draining: boolean;
  addReadiness(name: string, check: ReadinessCheck): void;
  addBackground(task: BackgroundTask): void;
  /** Runs after HTTP and background tasks stopped, last registered first (close pools, connections). */
  onShutdown(fn: () => Promise<void> | void): void;
  ready(): Promise<ReadyReport>;
  start(): Promise<{ port: number; metricsPort: number }>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------------------------

const TOKENLESS = new Set(["anonymous", "client_secret", "gateway", "internal", "service_client"]);
/** Ops (console) routes are gateway-routed and operator-facing like public ones. */
const BUDGET_MS = { public: 10_000, internal: 5_000, ops: 10_000 } as const;
const MAX_IDEMPOTENCY_KEY = 255;

interface RequestState {
  readonly started: number;
  readonly routeId: string;
  readonly span: Span;
  readonly log: Logger;
  principal: InternalClaims | null;
  finished: boolean;
}

function headerValue(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (k, v) => {
    if (k === "__proto__" || (k === "constructor" && v && typeof v === "object" && "prototype" in v))
      throw new SyntaxError("forbidden key");
    return v;
  });
}

function parseWith<S extends z.ZodType>(schema: S, value: unknown, where?: "query" | "path" | "header"): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw fromZodError(r.error, where);
  return r.data;
}

/** Only the headers a route declares are validated (requests carry many others). */
function declaredHeaders(schema: z.ZodType, req: FastifyRequest): Record<string, unknown> {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  if (!shape) return req.headers;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(shape)) {
    const v = req.headers[k.toLowerCase()];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const isEmptyBody = (b: unknown) =>
  b === undefined ||
  b === null ||
  (typeof b === "object" && !Array.isArray(b) && Object.keys(b as object).length === 0);

export function createService(o: ServiceOptions): Service {
  const { config } = o;
  const log = createLogger({
    service: o.name,
    env: config.env,
    level: config.logLevel,
    ...(o.logDestination ? { destination: o.logDestination } : {}),
  });
  const metrics = o.metrics ?? createMetrics(o.name);
  const tracing =
    o.tracing ??
    startTracing({
      service: o.name,
      env: config.env,
      ...(config.otelEndpoint ? { endpoint: config.otelEndpoint } : {}),
    });
  const validation = o.responseValidation ?? (config.env === "server" ? "log" : "enforce");
  const bindings = [...(o.routes ?? [])];
  const readiness = new Map<string, ReadinessCheck>(Object.entries(o.readiness ?? {}));
  const background: BackgroundTask[] = [...(o.background ?? [])];
  const shutdownHooks: (() => Promise<void> | void)[] = [];
  const streams = new Set<SseStream>();
  const states = new WeakMap<FastifyRequest, RequestState>();
  const rawBodies = new WeakMap<FastifyRequest, Buffer>();
  let draining = false;

  // Bindings must belong to this service and be unique.
  const seen = new Set<string>();
  for (const b of bindings) {
    if (b.route.service !== o.name) throw new Error(`route ${b.route.id} belongs to ${b.route.service}, not ${o.name}`);
    const k = `${b.route.method} ${b.route.path}`;
    if (seen.has(k)) throw new Error(`route ${k} is bound twice`);
    seen.add(k);
  }
  const needsKeys = bindings.some((b) => !b.route.auth.some((a) => TOKENLESS.has(a)));
  const keys: KeySource | null = o.keys ?? (config.jwksUrl ? jwksCache({ url: config.jwksUrl }) : null);
  if (needsKeys && !keys) throw new Error(`${o.name}: authenticated routes need a key source (set NP_JWKS_URL)`);

  const app = Fastify({
    loggerInstance: log,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: (req) => {
      const h = req.headers["x-request-id"];
      const v = Array.isArray(h) ? h[0] : h;
      return isId("req", v) ? v : newId("req");
    },
    requestIdHeader: false,
    trustProxy: true,
    exposeHeadRoutes: false,
    return503OnClosing: true,
    forceCloseConnections: "idle",
    requestTimeout: 30_000,
    bodyLimit: 1_048_576,
    routerOptions: { querystringParser: parseQuery, maxParamLength: 256 },
  });

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const buf = body as Buffer;
    rawBodies.set(req, buf);
    if (buf.length === 0) return done(null, undefined);
    try {
      done(null, safeJsonParse(buf.toString("utf8")));
    } catch {
      done(ApiError.invalid("the request body is not valid JSON"), undefined);
    }
  });

  // ---- per-request state, logs, metrics, spans -------------------------------------------------

  app.addHook("onRequest", async (req) => {
    const routeId = (req.routeOptions.config as { routeId?: string } | undefined)?.routeId ?? "unmatched";
    if (routeId === "health") return;
    const span = startSpan(
      tracing.tracer,
      routeId === "unmatched" ? `${req.method} unmatched` : `${req.method} ${req.routeOptions.url}`,
      {
        kind: SpanKind.SERVER,
        parent: headerValue(req, HEADERS.traceparent) ?? null,
        attributes: {
          "http.request.method": req.method,
          "http.route": req.routeOptions.url ?? "",
          "nearpay.route": routeId,
          "nearpay.request_id": req.id,
        },
      },
    );
    const sc = span.spanContext();
    states.set(req, {
      started: performance.now(),
      routeId,
      span,
      log: log.child({ rid: req.id, trace_id: sc.traceId, span_id: sc.spanId }),
      principal: null,
      finished: false,
    });
  });

  const finish = (req: FastifyRequest, status: number) => {
    const st = states.get(req);
    if (!st || st.finished) return;
    st.finished = true;
    const seconds = (performance.now() - st.started) / 1000;
    metrics.observeRequest(st.routeId, status, seconds);
    st.span.setAttribute("http.response.status_code", status);
    if (status >= 500) st.span.setStatus({ code: SpanStatusCode.ERROR });
    st.span.end();
    const fields = {
      method: req.method,
      route: st.routeId,
      status,
      ms: Math.round(seconds * 1000),
      ...(st.principal ? { acct: st.principal.acct, lm: st.principal.lm } : {}),
    };
    if (status >= 500) st.log.error(fields, "request failed");
    else st.log.info(fields, "request completed");
  };

  app.addHook("onResponse", async (req, reply) => finish(req, reply.statusCode));
  // While draining, responses close their keep-alive connection so the listener can shut down.
  app.addHook("onSend", async (_req, reply, payload) => {
    if (draining) reply.header("connection", "close");
    return payload;
  });

  const sendError = (req: FastifyRequest, reply: FastifyReply, e: unknown) => {
    const st = states.get(req);
    const l = st?.log ?? log;
    if (reply.sent) {
      l.error({ err: e }, "error after the response was sent");
      return;
    }
    const m = toErrorResponse(e, req.id);
    if (m.unexpected) {
      l.error({ err: e }, "unhandled error");
      st?.span.recordException(e instanceof Error ? e : String(e));
    } else if (m.status >= 500) l.warn({ code: m.envelope.error.code, err: e }, "request failed");
    reply
      .code(m.status)
      .headers({ ...m.headers, [HEADERS.requestId]: req.id, "content-type": "application/json; charset=utf-8" })
      .send(JSON.stringify(m.envelope));
  };

  app.setErrorHandler((err, req, reply) => {
    const code = (err as { code?: string }).code;
    let mapped: unknown = err;
    if (err instanceof ApiError || err instanceof AuthError) mapped = err;
    else if (code === "FST_ERR_CTP_BODY_TOO_LARGE") mapped = ApiError.invalid("the request body is too large");
    else if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" || code === "FST_ERR_CTP_INVALID_CONTENT_LENGTH")
      mapped = ApiError.invalid("send a JSON body with Content-Type: application/json");
    else if (code === "FST_ERR_HANDLER_TIMEOUT")
      mapped = new ApiError("api_error", {
        message: "The request did not complete in time. Retry with the same Idempotency-Key.",
      });
    else if (code === "FST_ERR_BAD_URL" || code === "FST_ERR_ASYNC_CONSTRAINT")
      mapped = ApiError.invalid("malformed request URL");
    sendError(req, reply, mapped);
  });

  app.setNotFoundHandler((req, reply) => {
    sendError(
      req,
      reply,
      new ApiError("resource_missing", {
        message: `Unrecognized request URL (${req.method} ${req.url.split("?")[0]}).`,
      }),
    );
  });

  // ---- health -----------------------------------------------------------------------------------

  const readinessTimeout = o.readinessTimeoutMs ?? 2_000;

  async function ready(): Promise<ReadyReport> {
    if (draining) return { status: "draining", checks: {} };
    const checks: Record<string, string> = {};
    await Promise.all(
      [...readiness].map(async ([name, check]) => {
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            Promise.resolve().then(check),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error(`timed out after ${readinessTimeout} ms`)), readinessTimeout);
            }),
          ]);
          checks[name] = "ok";
        } catch (e) {
          checks[name] = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    const ok = Object.values(checks).every((v) => v === "ok");
    return { status: ok ? "ready" : "not_ready", checks };
  }

  app.get("/healthz", { config: { routeId: "health" } }, async (_req, reply) =>
    reply.type("text/plain; charset=utf-8").send("ok\n"),
  );
  app.get("/readyz", { config: { routeId: "health" } }, async (_req, reply) => {
    const r = await ready();
    return reply.code(r.status === "ready" ? 200 : 503).send(r);
  });

  // ---- routes -----------------------------------------------------------------------------------

  async function authenticate(route: AnyRoute, req: FastifyRequest): Promise<InternalClaims | null> {
    const token = headerValue(req, HEADERS.token);
    const open = route.auth.some((a) => TOKENLESS.has(a));
    if (!token) {
      if (open) return null;
      throw new AuthError("authentication_required", "no X-NearPay-Token");
    }
    if (!keys) return null; // only open routes can get here (checked at construction)
    let claims: InternalClaims;
    try {
      claims = await verifyInternalJwt(token, keys);
    } catch (e) {
      if (open) return null;
      throw e;
    }
    try {
      authorizeRoute(claims, route);
      return claims;
    } catch (e) {
      if (open) return null;
      throw e;
    }
  }

  function checkResponse(route: AnyRoute, status: number, body: unknown, l: Logger): void {
    if (validation === "off") return;
    let problem: string | null = null;
    if (route.response === null || status === 204) {
      if (body !== undefined) problem = "a body was returned for a route without one";
    } else {
      const r = route.response.safeParse(body);
      if (!r.success) {
        const i = r.error.issues[0];
        problem = `${i?.path.join(".") || "(root)"}: ${i?.message ?? "invalid"}`;
      }
    }
    if (!problem) return;
    if (validation === "enforce") throw new Error(`response of ${route.id} violates the contract: ${problem}`);
    l.error({ route: route.id, problem }, "response violates the contract");
  }

  for (const b of bindings) {
    const route = b.route;
    const budget = b.options.budgetMs ?? BUDGET_MS[route.visibility];
    app.route({
      method: route.method,
      url: toFastifyPath(route.path),
      config: { routeId: route.id },
      ...(route.stream ? {} : { handlerTimeout: budget }),
      ...(b.options.bodyLimit ? { bodyLimit: b.options.bodyLimit } : {}),
      handler: async (req, reply) => {
        const st = states.get(req) as RequestState;
        const deadline = Date.now() + budget;
        let sse: SseStream | null = null;
        try {
          const principal = await authenticate(route, req);
          st.principal = principal;
          const l = principal ? st.log.child({ acct: principal.acct, lm: principal.lm }) : st.log;
          const headers = route.headers
            ? parseWith(route.headers, declaredHeaders(route.headers, req), "header")
            : req.headers;
          const params = route.params ? parseWith(route.params, req.params, "path") : {};
          const rawQuery = (req.query ?? {}) as Record<string, unknown>;
          let query: unknown = {};
          if (route.query) query = parseWith(route.query, rawQuery, "query");
          else if (Object.keys(rawQuery).length)
            throw ApiError.invalid(`unknown parameter ${Object.keys(rawQuery)[0]}`, Object.keys(rawQuery)[0]);
          let body: unknown;
          if (route.body) body = parseWith(route.body, req.body ?? {});
          else if (!isEmptyBody(req.body)) throw ApiError.invalid("this endpoint does not accept a request body");
          const idempotencyKey = headerValue(req, HEADERS.idempotencyKey);
          if (
            idempotencyKey !== undefined &&
            (idempotencyKey.length === 0 || idempotencyKey.length > MAX_IDEMPOTENCY_KEY)
          ) {
            throw ApiError.invalid(
              `Idempotency-Key must be 1–${MAX_IDEMPOTENCY_KEY} characters`,
              HEADERS.idempotencyKey,
            );
          }

          const traceparent = formatTraceparent(st.span.spanContext());
          const ctx: RequestContext = {
            route,
            params: params as never,
            query: query as never,
            body: body as never,
            headers: headers as never,
            rawBody: rawBodies.get(req),
            principal,
            livemode: principal?.lm ?? false,
            requestId: req.id,
            idempotencyKey,
            deadline,
            signal: req.signal,
            log: l,
            span: st.span,
            request: req,
            reply,
            sse(limits?: SseLimits) {
              if (!route.stream) throw new Error(`${route.id} is not a streaming route`);
              if (sse) return sse;
              reply.hijack();
              const s = openSse(reply.raw, route.stream, { [HEADERS.requestId]: req.id }, limits);
              sse = s;
              streams.add(s);
              s.onClose(() => {
                streams.delete(s);
                finish(req, 200);
              });
              return s;
            },
          };
          const run = () =>
            runWithContext(
              {
                requestId: req.id,
                traceparent,
                deadline,
                ...(headerValue(req, HEADERS.token) ? { token: headerValue(req, HEADERS.token) } : {}),
              },
              () => b.handler(ctx),
            );

          if (route.stream) {
            await run();
            if (!sse) throw new Error(`${route.id} returned without opening its stream`);
            return;
          }

          const execute = async () => {
            const result = await run();
            const out = isResponded(result) ? result : { status: route.status, body: result, headers: {} };
            if (out.status < 200 || out.status > 299)
              throw new Error(`${route.id} responded with non-success status ${out.status}`);
            checkResponse(route, out.status, out.body, l);
            return out;
          };

          let status: number;
          let resBody: unknown;
          let resHeaders: Record<string, string> = {};
          if (route.idempotent && idempotencyKey && principal?.acct && o.idempotency) {
            let extra: Record<string, string> = {};
            const r = await o.idempotency.run(
              {
                accountId: toUuid(principal.acct, "acct"),
                livemode: principal.lm ?? false,
                key: idempotencyKey,
                method: req.method,
                path: req.url.split("?")[0] as string,
                body: req.body ?? null,
              },
              async () => {
                const x = await execute();
                extra = { ...x.headers };
                return { status: x.status, body: x.body };
              },
            );
            status = r.status;
            resBody = r.body;
            resHeaders = r.replayed ? { [HEADERS.idempotentReplayed]: "true" } : extra;
          } else {
            const x = await execute();
            status = x.status;
            resBody = x.body;
            resHeaders = { ...x.headers };
          }
          if (reply.sent) return; // the budget expired and a 500 was already sent
          reply.code(status).headers({ ...resHeaders, [HEADERS.requestId]: req.id });
          if (status === 204 || resBody === undefined) return reply.send();
          return reply.type("application/json; charset=utf-8").send(JSON.stringify(resBody));
        } catch (e) {
          if (sse) {
            st.log.error({ err: e }, "stream handler failed");
            (sse as SseStream).close();
            return;
          }
          sendError(req, reply, e);
        }
      },
    });
  }

  // ---- lifecycle --------------------------------------------------------------------------------

  let started: { stop(): Promise<void> }[] = [];
  let metricsServer: { port: number; close(): Promise<void> } | null = null;
  let stopping: Promise<void> | null = null;

  async function stopBackground() {
    for (const t of started.reverse()) {
      try {
        await t.stop();
      } catch (e) {
        log.error({ err: e }, "background task failed to stop");
      }
    }
    started = [];
  }

  return {
    name: o.name,
    app,
    log,
    metrics,
    tracing,
    get draining() {
      return draining;
    },
    addReadiness: (name, check) => void readiness.set(name, check),
    addBackground: (task) => void background.push(task),
    onShutdown: (fn) => void shutdownHooks.push(fn),
    ready,

    async start() {
      await app.listen({ host: config.host, port: config.port });
      const port = (app.server.address() as { port: number }).port;
      try {
        metricsServer = await serveMetrics(metrics, config.metricsPort, config.host);
        for (const t of background) {
          started.push(await t.start());
          log.info({ task: t.name }, "background task started");
        }
      } catch (e) {
        await stopBackground();
        await metricsServer?.close();
        await app.close();
        throw e;
      }
      log.info({ port, metricsPort: metricsServer.port, routes: bindings.length }, "service started");
      return { port, metricsPort: metricsServer.port };
    },

    stop() {
      stopping ??= (async () => {
        draining = true;
        log.info("draining");
        for (const s of [...streams]) s.close();
        const sweep = setInterval(() => app.server.closeIdleConnections(), 250);
        try {
          await app.close();
        } finally {
          clearInterval(sweep);
        }
        await stopBackground();
        for (const fn of shutdownHooks.reverse()) {
          try {
            await fn();
          } catch (e) {
            log.error({ err: e }, "shutdown hook failed");
          }
        }
        await metricsServer?.close();
        await tracing.shutdown().catch(() => {});
        log.info("stopped");
      })();
      return stopping;
    },
  };
}
