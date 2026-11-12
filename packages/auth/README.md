# @nearpay-internal/auth

Internal authentication: EdDSA (Ed25519) request and service tokens, JWKS verification, and route authorization from spec definitions.

- `loadSigningKey`, `publicJwk`, `signInternalJwt` (identity only)
- `jwksCache({url})`, `staticKeys`, `verifyInternalJwt(token, keys)`
- `authorizeRoute(claims, route)` — principal type, scopes, roles, step-up, test-mode-only; `requireScope`
- `serviceTokenClient({identityUrl, clientId, secretFile})` — cached; since 0.6.0 (audit KIT-3) refreshed in the
  background from `exp − 60 s` while callers keep the cached token, failed refreshes retried with back-off
  (1 s → 30 s, jitter), the cached token served until `exp − 5 s`; only a caller without a usable token waits for (and
  fails with) identity. `ALERT service_token_refresh_failing` is logged once per failure streak (stderr JSON, or
  `onRefreshFailing` / `onRefreshRecovered`).

Design: `nearpay-brain/lld/00-foundations.md` (foundations §9). Part of `nearpay-kit`; no domain rules (ADR-0001).
