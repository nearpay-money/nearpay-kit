# Changelog

All packages in this repository share one version. Breaking changes bump the major version and
carry a migration note here (semver, foundations §4).

## 0.2.0 — 2026-11-07

Stage 2 kit release (step 2.1). Additive except the ops-principal tightening below (a 0.x minor;
see the migration note).

### spec 0.2.0

- Every package depends on `@nearpay/spec` / `@nearpay-internal/spec` **0.2.0** (Stage 2 contract
  freeze). No kit code reads the 1Click `OneClick*` fields that became nullish.
- `@nearpay-internal/service`: `ops` routes (`visibility: "ops"`, `/ops/…`) get the 10 s request
  budget of gateway-routed routes (internal routes keep 5 s).

### money / http / intents (rails-fx, CR-15-16)

- `@nearpay-internal/money`: `RoundingMode` (`floor`, `ceil`, `half_even` — banker's, `half_up`) and
  `roundRational`; `toDecimalString` accepts every mode; `toDisplayDecimal` (≤ 18 places, half-even,
  trailing zeros dropped — the spec `RateDecimal`); `ratioToWire` / `ratioFromWire` for the spec 0.1.6
  `Ratio` (`{num, den}` integer strings); `convertUnits(amount, fromExp, rate, toExp, mode)` (fiat↔fiat,
  fiat↔asset at an exact rate) and `toUsdMicros`; `parseJsonDecimals(text)` keeps every JSON number as
  its source text so feed prices (CoinGecko) never pass through a float (rails §8.2).
- `@nearpay-internal/http`: `call(route, {headers})` sends extra request headers a route declares (e.g.
  the payer's `X-NearPay-Client-Secret` forwarded by agentpay); a caller-supplied `X-NearPay-Token` is
  dropped so route calls always authenticate as the client (CR-15-16).
- `@nearpay-internal/intents`: `sendSignedTx({bytes, txHash, waitUntil?, timeoutMs?})` sends an
  already-signed transaction (from `buildExecuteTx`, whose hash the caller stored first) and returns
  the outcome; `ExecuteResult.blockHash` (optional) is the including block's hash; `TxWaitUntil` type;
  `executeIntents` now delegates to `sendSignedTx` (CR-15-16).

### ops principals (auth / service / testing)

- `@nearpay-internal/auth` `authorizeRoute` — which `@nearpay-internal/service` runs for every route —
  enforces console (ops) principals, fail closed: the token must carry a known `ops_role`
  (`OPS_ROLES`) and no other principal type may carry one; the route must list an `ops:<scope>` that
  the principal holds and its role is granted (`OPS_ROLE_SCOPES`); `ops_role` must be in the route's
  `opsRoles` (an `ops` route without `opsRoles` admits nobody; internal routes that declare
  `opsRoles`, e.g. `decideKyb`, are checked too); `stepUp` routes need a fresh `step_up_until`
  exactly as for sessions. `ops` routes refuse every non-ops principal (anonymous sign-in routes
  under `/ops/auth/` stay anonymous); non-ops routes admit ops principals only through an explicit
  `ops:` entry (e.g. `listEvidence` with `ops:rails.read`). New exported type `AuthorizableRoute`;
  `ClaimsInput` gains `ops_role`.
- **Migration:** ops tokens without `ops_role` (possible before spec 0.2.0) are now refused with
  `permission_denied`; identity mints `ops_role` for every `ptype=ops` token (identity §6.3).
- `@nearpay-internal/testing`: `opsClaims`, `mintOpsToken({role, scopes, stepUp, sub})`,
  `testOpsToken(...)` (a token provider for `httpClient({serviceToken})`), `opsHeaders(...)`;
  `mockPeer` serves console routes (`OPS_ROUTES`, also part of `INTERNAL_ROUTES`) with the same
  enforcement as production.

### new `@nearpay-internal/ui`

- New package `@nearpay-internal/ui` — the NearPay design system (tokens, component CSS, React 19
  components, money/countdown/contrast helpers) with a static gallery. Peer: `react@^19`. Decision:
  `nearpay-brain/decisions/0021-shared-ui-package.md`.
- Stat values never overflow their column: stat columns shrink (`minmax(min(200px, 100%), 1fr)`), each
  stat is an inline-size container, values step down to h3 below 180 px and h4 below 140 px, the
  suffix symbol may wrap (gallery Ref C · Payment detail fix).
- `scripts/build-package.mjs`: optional `kitBuild` in a package's `package.json` (`compilerOptions`
  merged into the build tsconfig, `copy` for non-TS assets such as CSS).
- Unit tests may be `.test.tsx`; `packages/ui` tests run in jsdom.

## 0.1.2 — Stage 1, step 1.2

Additive (no migration needed):

- `@nearpay-internal/db`: `inboxHandler(db, fn)` (inbox dedupe + apply in one transaction, foundations
  §8), `deadLetterSink(db, source)`, background tasks `outboxRelayTask`, `jobWorkerTask`, `leaderTask`
  and `recurringJobsTask` (leader-elected enqueue of hourly/daily jobs, one job per slot via the dedupe
  key) with `recurringSlot`.
- `@nearpay-internal/bus`: `startDomainConsumers` / `domainConsumersTask` (one durable per producing
  stream, filters from the handlers, refuses subjects the catalogue does not route to the service),
  `unhandledSubjects` for contract tests, `durablesOf` for consumer-lag metrics.
- `@nearpay-internal/testing`: `provisionServiceDatabase(adminUrl, service)` creates migrator/app roles
  exactly like `nearpay-deploy`'s `postgres-init` (`pg` is now a dependency).

## 0.1.1 — Stage 1, step 1.2

Additive (no migration needed):

- `@nearpay-internal/testing`: `mockPeer({service, routes})` serves a peer's spec routes through the
  real service bootstrap (request validation, token verification and route authorization, response
  validation), records calls and answers `500 not mocked` for routes without a handler;
  `mockError`, `mintServiceToken(service)` and `testServiceToken(service)` (catalogue scopes).
- Every package depends on `@nearpay/spec` / `@nearpay-internal/spec` 0.1.1.

## 0.1.0 — Stage 1, step 1.1

First release of all ten packages: `ids`, `money`, `chains`, `intents`, `db`, `bus`, `auth`,
`http`, `service`, `testing`.
