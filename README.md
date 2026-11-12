# nearpay-kit

Small, versioned TypeScript libraries shared by the NearPay services and frontends: integer money, ids, service bootstrap (Fastify + OpenTelemetry), Postgres helpers (outbox, inbox, idempotency, jobs), the NATS JetStream bus, internal auth, a resilient HTTP client, NEAR Intents payload build/sign/verify, chain address validation, test utilities and the UI design system.

Part of [NearPay](https://github.com/nearpay-money/nearpay) — start there for the live demo, the architecture diagram and the full "do X, see Y" walkthrough.

- **Where it sits:** one layer above `nearpay-spec`. The ten services import the runtime packages; checkout, dashboard and console import `@nearpay-internal/ui`. It holds no domain logic and calls no NearPay service.
- **Status:** internal packages (`@nearpay-internal/*`), not on npmjs.com; they are published to NearPay's local package registry. Current release: 0.6.0 for `auth`, `bus`, `db`, `http`, `service` and `testing` (resilience: supervised consumers, a circuit-breaker fix, liveness from loop heartbeats, outbox dead-letter); `ids` and `intents` 0.5.0, `ui` 0.5.0, `chains` and `money` 0.4.0. NearPay runs on NEAR mainnet as a closed beta (https://nearpay.money).

|                                       |                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Group                                 | Contracts & shared                                                                              |
| Kind                                  | library                                                                                         |
| Ships as                              | npm (private): @nearpay-internal/{ids,money,chains,intents,db,bus,auth,http,service,testing,ui} |
| Owns                                  | Cross-cutting runtime code (no domain logic)                                                    |
| Depends on (published artifacts only) | nearpay-spec                                                                                    |
| First built in                        | Stage 1 (step 1.1)                                                                              |

## Documentation

Design docs live in [`nearpay-brain`](https://github.com/nearpay-money/nearpay-brain), not here.

- [`lld/00-foundations.md`](https://github.com/nearpay-money/nearpay-brain/blob/main/lld/00-foundations.md) — low-level design this repo is implemented from
- [`lld/audits/00-foundations.md`](https://github.com/nearpay-money/nearpay-brain/blob/main/lld/audits/00-foundations.md) — audit findings already folded into the LLD
- [`roadmap/development-plan.md`](https://github.com/nearpay-money/nearpay-brain/blob/main/roadmap/development-plan.md) — stage and step this repo is built in
- [`architecture/hld.md`](https://github.com/nearpay-money/nearpay-brain/blob/main/architecture/hld.md) — system design
- [`architecture/repositories.md`](https://github.com/nearpay-money/nearpay-brain/blob/main/architecture/repositories.md) — repo topology and dependency rules
- [`decisions/ADR-0004-postgres-outbox-nats.md`](https://github.com/nearpay-money/nearpay-brain/blob/main/decisions/ADR-0004-postgres-outbox-nats.md)
- [`architecture/domain-model.md#3-money-representation-inv-5-inv-6`](https://github.com/nearpay-money/nearpay-brain/blob/main/architecture/domain-model.md#3-money-representation-inv-5-inv-6)

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
│   ├── testing/    Testcontainers fixtures, factories, event probes, test tokens
│   └── ui/         design system: tokens, component CSS, React components, gallery
├── scripts/        build-package.mjs, release-local.mjs
└── .github/workflows/ci.yml
```

Each package has its own README with its public surface. Contracts (`@nearpay-money/spec`, `@nearpay-internal/spec`) come from the local registry; packages never import another repo's source.

## Verify this repo

Needs Node 22 (`.nvmrc`) and pnpm 9. The kit takes the two spec packages from a local package registry (`.npmrc`), so start that first.

1. Start the local registry (no Docker, Node 22 only):
   `git clone https://github.com/nearpay-money/nearpay-deploy ../nearpay-deploy && ../nearpay-deploy/scripts/registry.sh start`
   → `curl http://127.0.0.1:4873/-/ping` answers `{}`.
2. `pnpm install --frozen-lockfile` → ends with `Done in …`, no registry errors.
3. `pnpm test` (unit and property tests of all eleven packages; no Docker) → `Test Files  28 passed (28)`, `Tests  586 passed (586)`.
4. `pnpm verify` (the full gate: typecheck, lint, unit and integration tests, build of every package) → exits 0. The integration tests (`*.int.test.ts`) run against real Postgres, NATS and Valkey started by Testcontainers, so this step needs a running Docker daemon; steps 1–3 do not.

## Commands

| Command                          | What it does                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile` | Install (Node 22, pnpm 9); `@nearpay-money/*` and `@nearpay-internal/*` resolve from the local registry (`.npmrc`) |
| `pnpm test`                      | Unit tests                                                                                                         |
| `pnpm test:integration`          | Integration tests on real Postgres, NATS and Valkey (Testcontainers; needs Docker)                                 |
| `pnpm verify`                    | typecheck + lint + all tests + build                                                                               |
| `pnpm release:local`             | Verify, then publish the packages to the local registry (`NP_REGISTRY_URL`, `NP_REGISTRY_PASSWORD`); idempotent    |

`NP_LIVE_NEAR=1 pnpm exec vitest run --project integration packages/intents/test/live.int.test.ts` runs read-only checks of the signing formats against the live `intents.near` contract on NEAR mainnet (view calls and simulation only; no transactions, no funds; needs outbound access to a NEAR RPC, no Docker). Without the variable those tests are skipped. `nearpay-deploy/scripts/up.sh` publishes the kit automatically when the pinned version is missing from the local registry.

## Status

`0.6.0` — resilience release (see `CHANGELOG.md`): the bus supervises its consume loop and restarts it with back-off; the HTTP circuit breaker always settles its half-open probe; service tokens are served through identity outages; `/healthz` liveness comes from background-loop heartbeats; pool and leadership timeouts; outbox dead-letter and replay. Versions between 0.1.2 and 0.6.0 are in `CHANGELOG.md`.

`0.1.2` — Stage 1 (step 1.2): consumer glue and background tasks in `db`/`bus`, `provisionServiceDatabase` in `testing`; `0.1.1`: spec-driven peer mocks (`mockPeer`). See `CHANGELOG.md`.

`0.1.0` — Stage 1 (step 1.1): the first ten packages (`ui` came later, ADR-0021). Unit tests cover the pure code; integration tests run the database, bus and service packages against real Postgres and NATS containers with the stack's pinned images.

## Built with

- Runtime: TypeScript 5 on Node 22; zod 4; Fastify 5, pino, prom-client, OpenTelemetry (api, resources, sdk-trace, OTLP/HTTP exporter); Kysely + pg; NATS JetStream client (`@nats-io/jetstream`, `@nats-io/transport-node`); jose; `@noble/curves` and `@noble/hashes`; bs58; `@near-js/transactions` and `@near-js/crypto`; React and Instrument Sans (`@fontsource-variable/instrument-sans`) in `ui`.
- Tests and tooling: Testcontainers, Vitest, fast-check, Biome, tsx.
- Licence: Apache-2.0 (`LICENSE`).

Code and documentation are written with AI assistance (Claude) under human direction and review. Built for the NEAR Hackathon (Nov 2026).
