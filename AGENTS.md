# AGENTS.md — nearpay-kit

You are working in **nearpay-kit**, one of 27 NearPay repositories (`nearpay-brain/architecture/repositories.md`).
Scope: Small, versioned TypeScript runtime libraries shared by services: integer money, IDs, service bootstrap (Fastify + OpenTelemetry), Postgres helpers (outbox, inbox, idempotency), internal auth, NEAR Intents payload build/sign/verify, chain address validation, test utilities.

## Before changing anything

1. Read `../nearpay-brain/AGENTS.md`, then this repo's LLD (`../nearpay-brain/lld/00-foundations.md`) — it is the implementation spec; do not make design decisions it already makes.
2. Contracts (requests, responses, events, errors) come from `@nearpay/spec`. If one must change, open a PR in `nearpay-spec` first; never hand-write contract types here.
3. Check your change against invariants INV-1…INV-9 in `nearpay-brain/product/requirements.md`.

## Rules for this repo

- Semver; every breaking change needs a major version and a migration note in the CHANGELOG.
- No domain logic in shared libraries.

## Never

- Import source code from another NearPay repo (depend on published packages/images only).
- Read or write another service's database.
- Add design documents here — update `nearpay-brain` and link to it.
- Commit secrets, private keys or real customer data.
- Merge changes to paths listed in `.github/CODEOWNERS` without the required human review.
