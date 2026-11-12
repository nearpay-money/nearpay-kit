# @nearpay-internal/service

Service bootstrap: Fastify serving spec routes with internal-token auth, validation in the API's parameter notation, error envelopes, request budgets, automatic idempotency, SSE, health, metrics, tracing, logging, configuration and graceful shutdown.

- `loadConfig(shape)` with `baseConfigShape`, `secret()` (files only), `url()`, `int()`, `port()`, `flag()`, `list()`
- `NP_ENV` (`local` · `server` · `test`) is **required** — no default; a missing value fails startup. Gate development relaxations with `isDevEnv(config.env)` (true only for `local`/`test`), never by hand
- `createService({name, config, routes: [implement(route, handler)], idempotency, readiness, background})` → `start()` / `stop()` (30 s drain)
- `ApiError`, `respond(status, body, headers)`, `ctx.sse()` for streaming routes, `unimplementedRoutes` for contract tests
- Liveness (0.6.0, audit KIT-4): a background task with `maxSilenceMs` gets a `Heartbeat` in `start(heartbeat)`;
  `service.heartbeat(name, maxSilenceMs)` registers any other loop. `/healthz` answers 503 (`stalled: <loop> …`) while a
  registered loop is active (not `idle()`, e.g. a leader follower) and has not beaten for longer than its budget; loops
  beat on every iteration, failed ones included, so a dependency outage never fails liveness (that is `/readyz`).
  Metrics: `background_last_beat_seconds{task}`, `background_task_stalled{task}`, plus `http_breaker_open{target}` (KIT-2)
  and `consumer_running{durable}` (KIT-1); `ALERT background_task_stalled` is logged on each transition. The kit's own
  tasks (outbox relay, job worker, leaders, recurring jobs, domain consumers) declare budgets by default.
- `/healthz`, `/readyz` on :8080; `nearpay_<svc>_*` metrics on :9464; pino logs with redaction; W3C trace context, OTLP export when `NP_OTEL_ENDPOINT` is set
- `runMain({api, worker, migrate, …})` — process type from argv, exit codes 0/1/2; built-in `healthcheck` process for the image's Docker `HEALTHCHECK`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §4, §9–§15). Part of `nearpay-kit`; no domain rules (ADR-0001).
