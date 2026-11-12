# @nearpay-internal/http

Outbound HTTP for internal and integration calls: request budgets, idempotent-only retries with jitter, a circuit breaker, request-id/trace propagation and service-token authentication.

- `httpClient({target, baseUrl, timeoutMs, serviceToken})` → `request(...)`, `call(route, {params, query, body})` (response validated against the spec)
- `runWithContext` / `currentContext` — request id, traceparent, deadline, token
- `circuitBreaker`, `HttpError` (parsed NearPay error, `retryAfter`), `TimeoutError`, `BreakerOpenError`
- Breaker probes are always settled (0.6.0, audit KIT-2): the service token is fetched and the body serialised _before_
  the breaker grants a permit; every exit after it — success, 5xx, network error, timeout (body read included) — records a
  verdict, and a caller abort releases the slot without one. `beforeCall` returns a `BreakerPermit` for
  `record(ok, permit)` / `release(permit)`; results from an earlier breaker period are ignored; a probe that never reports
  re-opens the breaker after `probeTimeoutMs` (default 30 s, the client uses max(30 s, 2 × timeout)).
- `breakerStates()` — every live client breaker by target; `@nearpay-internal/service` exports it as
  `http_breaker_open{target}`. `onBreakerStateChange(state, target)` for logs.

Design: `nearpay-brain/lld/00-foundations.md` (foundations §10). Part of `nearpay-kit`; no domain rules (ADR-0001).
