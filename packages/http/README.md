# @nearpay-internal/http

Outbound HTTP for internal and integration calls: request budgets, idempotent-only retries with jitter, a circuit breaker, request-id/trace propagation and service-token authentication.

- `httpClient({target, baseUrl, timeoutMs, serviceToken})` → `request(...)`, `call(route, {params, query, body})` (response validated against the spec)
- `runWithContext` / `currentContext` — request id, traceparent, deadline, token
- `circuitBreaker`, `HttpError` (parsed NearPay error, `retryAfter`), `TimeoutError`, `BreakerOpenError`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §10). Part of `nearpay-kit`; no domain rules (ADR-0001).
