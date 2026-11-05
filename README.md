# nearpay-kit

> Small, versioned TypeScript runtime libraries shared by services: integer money, IDs, service bootstrap (Fastify + OpenTelemetry), Postgres helpers (outbox, inbox, idempotency), internal auth, NEAR Intents payload build/sign/verify, chain address validation, test utilities.

| | |
|---|---|
| Group | Contracts & shared |
| Kind | library |
| Ships as | npm (private): @nearpay-internal/{money,ids,service,db,auth,intents,chains,testing} |
| Owns | Cross-cutting runtime code (no domain logic) |
| Depends on (published artifacts only) | nearpay-spec |
| Roadmap phase | P0 Foundations |

## Documentation

This repo stays surgical: design docs live in [`nearpay-brain`](../nearpay-brain/README.md), not here.

- `nearpay-brain/architecture/hld.md` — system design
- `nearpay-brain/architecture/repositories.md` — repo topology and dependency rules
- `nearpay-brain/decisions/ADR-0004-postgres-outbox-nats.md`
- `nearpay-brain/architecture/domain-model.md#3-money-representation-inv-5-inv-6`

## Layout

```
nearpay-kit/
├── packages/
│   ├── auth/
│   ├── chains/
│   ├── db/
│   ├── ids/
│   ├── intents/
│   ├── money/
│   ├── service/
│   └── testing/
└── .github/
    └── workflows/
```

## Status

Scaffold only. Implementation starts in phase **P0 Foundations** (`nearpay-brain/roadmap/roadmap.md`).
