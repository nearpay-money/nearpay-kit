# Changelog

All packages in this repository share one version. Breaking changes bump the major version and
carry a migration note here (semver, foundations §4).

## Unreleased

### rails-fx (Stage 2, step 2.1)

Additive (no migration needed); no version bump (the lead releases):

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
