# @nearpay-internal/bus

NATS JetStream: one file-backed stream per producing domain (7 days, 120 s de-duplication), durable pull consumers with explicit filters, retries with a backoff schedule, and dead letters.

- `connectBus`, `busReady`, `ensureStreams(bus, Object.values(STREAMS))`
- `publish(bus, subject, envelope)` — `Nats-Msg-Id` = event id
- `subscribe(bus, {stream, durable, filterSubjects, handler, onDeadLetter})` — ack wait 30 s, max deliver 20, failures retried after 1 s, 5 s, 30 s, 2 min, 10 min
- `startDomainConsumers` / `domainConsumersTask({bus, consumer, handlers, onDeadLetter})` — one durable per producing stream from the event catalogue; `unhandledSubjects`, `durablesOf`
- `consumerLag`, `redeliveryDelayMs`

Design: `nearpay-brain/lld/00-foundations.md` (foundations §8). Part of `nearpay-kit`; no domain rules (ADR-0001).
