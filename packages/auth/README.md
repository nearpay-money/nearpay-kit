# @nearpay-internal/auth

Internal authentication: EdDSA (Ed25519) request and service tokens, JWKS verification, and route authorization from spec definitions.

- `loadSigningKey`, `publicJwk`, `signInternalJwt` (identity only)
- `jwksCache({url})`, `staticKeys`, `verifyInternalJwt(token, keys)`
- `authorizeRoute(claims, route)` — principal type, scopes, roles, step-up, test-mode-only; `requireScope`
- `serviceTokenClient({identityUrl, clientId, secretFile})` — cached until 30 s before expiry

Design: `nearpay-brain/lld/00-foundations.md` (foundations §9). Part of `nearpay-kit`; no domain rules (ADR-0001).
