# Changelog

All packages in this repository share one version. Breaking changes bump the major version and
carry a migration note here (semver, foundations §4).

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
