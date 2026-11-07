/**
 * Spec-driven peer mocks (development plan step 1.2: "mocks of peers generated from spec").
 *
 * `mockPeer` serves every route the spec assigns to a peer service, through the same bootstrap the
 * real service uses (`@nearpay-internal/service`), so each call a service under test makes is
 * checked against the contract on both sides: path, query, headers and body are validated, the
 * caller's internal token is verified and authorized from the route's `auth` list (a call with the
 * wrong service scope fails exactly as it would in production), and every mocked response is
 * validated against the route's response schema (a mock cannot drift from the spec).
 *
 * Routes without a handler answer `500 api_error` ("not mocked") and are recorded, so a test notices
 * an unexpected call.
 */
import {
  type AnyRoute,
  type ErrorCode,
  type RouteBody,
  type RouteParams,
  type RouteQuery,
  type RouteResponse,
  SERVICE_CLIENT_SCOPES,
  type ServiceName,
} from "@nearpay/spec";
import type { InternalClaims, KeySource } from "@nearpay-internal/auth";
import {
  ApiError,
  type ApiErrorOptions,
  createService,
  type Handler,
  implement,
  type RequestContext,
  type Service,
} from "@nearpay-internal/service";
import { mintTestToken, testKeySource } from "./tokens.js";

/** One request the mock received (after validation and authorization). */
export interface MockCall {
  readonly routeId: string;
  readonly method: string;
  readonly path: string;
  readonly params: unknown;
  readonly query: unknown;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly principal: InternalClaims | null;
  readonly idempotencyKey: string | undefined;
}

/** A handler for a mocked route: return the response body (validated), or throw `ApiError`. */
export type MockHandler<R extends AnyRoute> = Handler<R>;

export interface MockPeer {
  /** Base URL (`http://127.0.0.1:<port>`). */
  readonly url: string;
  readonly service: Service;
  /** Every call in arrival order (including calls to routes without a handler). */
  readonly calls: readonly MockCall[];
  /** Sets (or replaces) the handler of a route. */
  on<R extends AnyRoute>(route: R, handler: MockHandler<R>): MockPeer;
  /** Removes every handler and forgets recorded calls. */
  reset(): void;
  /** Calls of one route. */
  callsTo(route: AnyRoute): MockCall[];
  stop(): Promise<void>;
}

export interface MockPeerOptions {
  /** Peer service whose routes are served (e.g. `identity`). */
  service: ServiceName;
  /**
   * Route table to take the peer's routes from (`INTERNAL_ROUTES`, `PUBLIC_ROUTES`, or both).
   * `INTERNAL_ROUTES` includes the console routes (`OPS_ROUTES`); pass `OPS_ROUTES` alone for an
   * ops-only peer. Call it as an operator with `testOpsToken({role, stepUp})` (ops role, scope and
   * step-up are enforced exactly as in production).
   */
  routes: readonly AnyRoute[];
  /** Verifies caller tokens; default: tokens minted by `mintTestToken`. */
  keys?: KeySource;
  /** Initial handlers keyed by route id. */
  handlers?: Readonly<Record<string, Handler<AnyRoute>>>;
}

/** Throws a catalogue error from a mock handler (e.g. `mockError("rail_unavailable")`). */
export function mockError(code: ErrorCode, o: ApiErrorOptions = {}): never {
  throw new ApiError(code, o);
}

/** Starts a mock of `service` on an ephemeral port. */
export async function mockPeer(o: MockPeerOptions): Promise<MockPeer> {
  const own = o.routes.filter((r) => r.service === o.service);
  if (own.length === 0) throw new Error(`no ${o.service} routes in the given route table`);
  const handlers = new Map<string, Handler<AnyRoute>>(Object.entries(o.handlers ?? {}));
  const calls: MockCall[] = [];
  const known = new Set(own.map((r) => r.id));

  const dispatch: Handler<AnyRoute> = async (ctx: RequestContext) => {
    calls.push({
      routeId: ctx.route.id,
      method: ctx.route.method,
      path: ctx.request.url.split("?")[0] as string,
      params: ctx.params,
      query: ctx.query,
      body: ctx.body,
      headers: ctx.request.headers,
      principal: ctx.principal,
      idempotencyKey: ctx.idempotencyKey,
    });
    const h = handlers.get(ctx.route.id);
    if (!h) throw new ApiError("api_error", { message: `mock ${o.service}: ${ctx.route.id} is not mocked` });
    return h(ctx);
  };

  const service = createService({
    name: o.service,
    config: { env: "test", logLevel: "silent", host: "127.0.0.1", port: 0, metricsPort: 0 },
    keys: o.keys ?? testKeySource(),
    responseValidation: "enforce",
    routes: own.map((r) => implement(r, dispatch)),
  });
  const { port } = await service.start();

  const peer: MockPeer = {
    url: `http://127.0.0.1:${port}`,
    service,
    calls,
    on(route, handler) {
      if (!known.has(route.id)) throw new Error(`${route.id} is not a ${o.service} route`);
      handlers.set(route.id, handler as unknown as Handler<AnyRoute>);
      return peer;
    },
    reset() {
      handlers.clear();
      calls.splice(0);
    },
    callsTo(route) {
      return calls.filter((c) => c.routeId === route.id);
    },
    stop: () => service.stop(),
  };
  return peer;
}

/** A service token for `service` with its catalogue scopes (foundations §9), minted by the test key. */
export function mintServiceToken(service: ServiceName, ttlSeconds = 300): Promise<string> {
  return mintTestToken({ sub: service, ptype: "service", scp: [...SERVICE_CLIENT_SCOPES[service]] }, ttlSeconds);
}

/** `serviceToken` provider for `httpClient` in tests (no identity round trip). */
export function testServiceToken(service: ServiceName): () => Promise<string> {
  let cached: { token: string; until: number } | null = null;
  return async () => {
    const now = Date.now();
    if (cached && now < cached.until) return cached.token;
    const token = await mintServiceToken(service);
    cached = { token, until: now + 240_000 };
    return token;
  };
}

/** Typed body accessor for assertions on recorded calls. */
export type CallBody<R extends AnyRoute> = RouteBody<R>;
export type CallParams<R extends AnyRoute> = RouteParams<R>;
export type CallQuery<R extends AnyRoute> = RouteQuery<R>;
export type CallResponse<R extends AnyRoute> = RouteResponse<R>;
