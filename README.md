# nearpay-kit

> Small, versioned TypeScript runtime libraries shared by services: integer money, IDs, service bootstrap (Fastify + OpenTelemetry), Postgres helpers (outbox, inbox, idempotency), NATS JetStream bus, internal auth, resilient HTTP, NEAR Intents payload build/sign/verify, chain address validation, test utilities.

|                                       |                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Group                                 | Contracts & shared                                                                           |
| Kind                                  | library                                                                                      |
| Ships as                              | npm (private): @nearpay-internal/{ids,money,chains,intents,db,bus,auth,http,service,testing} |
| Owns                                  | Cross-cutting runtime code (no domain logic)                                                 |
| Depends on (published artifacts only) | nearpay-spec                                                                                 |
| First built in                        | Stage 1 (step 1.1)                                                                           |

## Documentation

This repo stays surgical: design docs live in [`nearpay-brain`](../nearpay-brain/README.md), not here.

- `nearpay-brain/lld/00-foundations.md` — **low-level design (dev-ready; implement from this)**
- `nearpay-brain/lld/audits/00-foundations.md` — audit findings already folded into the LLD
- `nearpay-brain/roadmap/development-plan.md` — stage and step this repo is built in
- `nearpay-brain/architecture/hld.md` — system design
- `nearpay-brain/architecture/repositories.md` — repo topology and dependency rules
- `nearpay-brain/decisions/ADR-0004-postgres-outbox-nats.md`
- `nearpay-brain/architecture/domain-model.md#3-money-representation-inv-5-inv-6`

## Layout

```
nearpay-kit/
├── packages/
│   ├── ids/        prefixed UUIDv7 ids (TypeID encoding)
│   ├── money/      bigint amounts, rounding rules, exact rationals
│   ├── chains/     chain registry, address validation, fingerprints
│   ├── intents/    NEAR Intents payloads: build, sign, verify, events, Verifier RPC
│   ├── db/         Kysely/pg: migrations, outbox, inbox, idempotency, jobs, leadership
│   ├── bus/        NATS JetStream streams, durable consumers, dead letters
│   ├── auth/       internal JWT/JWKS, route authorization, service tokens
│   ├── http/       outbound client: budgets, retries, circuit breaker, propagation
│   ├── service/    Fastify bootstrap from spec routes, health, metrics, tracing, config
│   └── testing/    Testcontainers fixtures, factories, event probes, test tokens
├── scripts/        build-package.mjs, release-local.mjs
└── .github/workflows/ci.yml
```

Each package has its own README with its public surface. Contracts (`@nearpay/spec`, `@nearpay-internal/spec`) come from the local registry; packages never import another repo's source.

## Commands

| Command                 | What it does                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`          | Install (Node 22, pnpm 9); `@nearpay/*` and `@nearpay-internal/*` resolve from the local registry (`.npmrc`)        |
| `pnpm test`             | Unit tests                                                                                                          |
| `pnpm test:integration` | Integration tests on real Postgres, NATS and Valkey (Testcontainers; needs Docker)                                  |
| `pnpm verify`           | typecheck + lint + all tests + build                                                                                |
| `pnpm release:local`    | Verify, then publish all ten packages to the local registry (`NP_REGISTRY_URL`, `NP_REGISTRY_PASSWORD`); idempotent |

`NP_LIVE_NEAR=1 pnpm test` adds read-only checks of the signing formats against the live `intents.near` contract (simulation only; no transactions, no funds). `nearpay-deploy/scripts/up.sh` publishes the kit automatically when the pinned version is missing from the local registry.

## Status

`0.1.1` — Stage 1 (step 1.2): spec-driven peer mocks in `testing` (`mockPeer`, service-token helpers); see `CHANGELOG.md`.

`0.1.0` — Stage 1 (step 1.1): all ten packages. Unit tests cover the pure code; integration tests run the database, bus and service packages against real Postgres and NATS containers with the stack's pinned images.

## Built with

TypeScript 5, Node 22, zod 4, Fastify 5, pino, prom-client, OpenTelemetry (api, sdk-trace, OTLP/HTTP exporter), Kysely + pg, NATS JetStream client, jose, @noble/curves and @noble/hashes, bs58, @near-js/transactions and @near-js/crypto, Testcontainers, Vitest, fast-check, Biome. Code and documentation are written with AI assistance (Claude) under human direction and review.
