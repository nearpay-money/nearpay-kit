# @nearpay-internal/bus

NATS JetStream: one file-backed stream per producing domain (7 days, 120 s de-duplication), durable pull consumers with explicit filters, retries with a backoff schedule, and dead letters.

- `connectBus`, `busReady`, `ensureStreams(bus, Object.values(STREAMS))`
- `publish(bus, subject, envelope)` — `Nats-Msg-Id` = event id
- `subscribe(bus, {stream, durable, filterSubjects, handler, onDeadLetter})` — ack wait 30 s, max deliver 20, failures retried after 1 s, 5 s, 30 s, 2 min, 10 min
- `startDomainConsumers` / `domainConsumersTask({bus, consumer, handlers, onDeadLetter})` — one durable per producing stream from the event catalogue; `unhandledSubjects`, `durablesOf`
- Supervised consume loop (0.6.0, audit KIT-1): when a durable's loop ends or throws without `stop()` (durable deleted,
  stream recreated after a NATS data loss, terminal consume error) it is reported through `onError` and re-created
  (`info`/`add` + `consume`) after `restartDelayMs` (1 s → 60 s, ×2, ±20 % jitter) until it consumes again; `stop()`
  interrupts the back-off. Only the first setup throws. `subscribe` returns `running()` / `restarts()`;
  `onRunningChange`, `onRestart`; `consumerRunning()` (exported by the service as `consumer_running{durable}`).
- Liveness (KIT-4): `heartbeat` is beaten every second while the loop consumes or waits to restart, never while a handler
  hangs or after the connection is closed for good. `domainConsumersTask` declares `maxSilenceMs` (default 120 s) and
  takes the heartbeat `@nearpay-internal/service` hands to `start`.
- `consumerLag`, `redeliveryDelayMs`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §8). Part of `nearpay-kit`; no domain rules (ADR-0001).
