/**
 * Internal authentication (lld/00-foundations.md §9, ADR-0014).
 *
 * - Request tokens are minted by identity's `/internal/authz` (60 s); service tokens by
 *   `/internal/service-tokens` (5 min). Both are EdDSA (Ed25519) JWTs with a `kid`.
 * - Services verify locally against identity's JWKS (cached 5 min, refetched on an unknown kid)
 *   and authorize every route from its spec definition (principal type, scopes, roles, step-up).
 */
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type AnyRoute,
  type InternalTokenClaims as Claims,
  type ErrorCode,
  HEADERS,
  InternalTokenClaims,
  OPS_ROLE_SCOPES,
  OPS_ROLES,
  type OpsRole,
  TOKEN_TTL_SECONDS,
} from "@nearpay-money/spec";
import { decodeProtectedHeader, exportJWK, importJWK, type JWK, jwtVerify, SignJWT } from "jose";

export type { Claims as InternalClaims };
export { HEADERS };

/** Claims a minter supplies; `iss`, `aud`, `iat` and `exp` are added when signing. */
export type ClaimsInput = Pick<
  Claims,
  "sub" | "acct" | "lm" | "ptype" | "scp" | "rid" | "role" | "step_up_until" | "ops_role"
>;

const ISSUER = "nearpay-identity";
const AUDIENCE = "nearpay";

/** Authentication/authorization failure carrying the public error code to return. */
export class AuthError extends Error {
  constructor(
    readonly code: Extract<
      ErrorCode,
      | "authentication_required"
      | "invalid_api_key"
      | "permission_denied"
      | "step_up_required"
      | "livemode_forbidden"
      | "invalid_client"
    >,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------

export interface SigningKey {
  readonly kid: string;
  readonly privateKey: KeyObject;
}

/** Loads an Ed25519 PKCS#8 PEM (e.g. from `openssl genpkey -algorithm ed25519`). */
export function loadSigningKey(kid: string, pemOrPath: string): SigningKey {
  const pem = pemOrPath.includes("-----BEGIN") ? pemOrPath : readFileSync(pemOrPath, "utf8");
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error(`${kid}: expected an Ed25519 key`);
  return { kid, privateKey };
}

/** Public JWK (`OKP`/`Ed25519`) of a signing key, for JWKS publication. */
export async function publicJwk(key: SigningKey): Promise<JWK & { kid: string }> {
  const jwk = await exportJWK(createPublicKey(key.privateKey));
  return { kty: "OKP", crv: "Ed25519", x: jwk.x as string, kid: key.kid, alg: "EdDSA", use: "sig" };
}

/** Signs internal claims. `iss`, `aud`, `iat` and `exp` are set here. */
export async function signInternalJwt(
  claims: ClaimsInput,
  key: SigningKey,
  ttlSeconds: number = TOKEN_TTL_SECONDS.request,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid, typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(key.privateKey);
}

// ---------------------------------------------------------------------------------------------
// JWKS
// ---------------------------------------------------------------------------------------------

export interface KeySource {
  getKey(kid: string): Promise<KeyObject | CryptoKey | Uint8Array>;
}

/** Static key source (tests, or identity verifying its own tokens). */
export function staticKeys(keys: readonly SigningKey[]): KeySource {
  const map = new Map(keys.map((k) => [k.kid, createPublicKey(k.privateKey)]));
  return {
    async getKey(kid) {
      const k = map.get(kid);
      if (!k) throw new AuthError("authentication_required", `unknown key id ${kid}`);
      return k;
    },
  };
}

/** JWKS fetched from identity, cached `ttlMs`; an unknown kid triggers at most one refetch per `minRefetchMs`. */
export function jwksCache(opts: {
  url: string;
  ttlMs?: number;
  minRefetchMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}): KeySource {
  const ttl = opts.ttlMs ?? 300_000;
  const minRefetch = opts.minRefetchMs ?? 10_000;
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let keys = new Map<string, KeyObject | CryptoKey | Uint8Array>();
  let fetchedAt = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    inflight ??= (async () => {
      try {
        const res = await f(opts.url, { signal: AbortSignal.timeout(2_000) });
        if (!res.ok) throw new Error(`JWKS ${res.status}`);
        const body = (await res.json()) as { keys?: (JWK & { kid?: string })[] };
        const next = new Map<string, KeyObject | CryptoKey | Uint8Array>();
        for (const jwk of body.keys ?? []) {
          if (jwk.kty === "OKP" && jwk.crv === "Ed25519" && jwk.kid) next.set(jwk.kid, await importJWK(jwk, "EdDSA"));
        }
        keys = next;
        fetchedAt = now();
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    async getKey(kid) {
      const stale = now() - fetchedAt > ttl;
      if (stale || (!keys.has(kid) && now() - fetchedAt > minRefetch)) {
        try {
          await refresh();
        } catch (e) {
          if (keys.size === 0)
            throw new AuthError("authentication_required", `JWKS unavailable: ${(e as Error).message}`);
        }
      }
      const k = keys.get(kid);
      if (!k) throw new AuthError("authentication_required", `unknown key id ${kid}`);
      return k;
    },
  };
}

/** Verifies an internal JWT and validates its claims against the spec. */
export async function verifyInternalJwt(
  token: string,
  keys: KeySource,
  opts: { now?: number; clockToleranceSeconds?: number } = {},
): Promise<Claims> {
  let kid: string | undefined;
  try {
    kid = decodeProtectedHeader(token).kid;
  } catch {
    throw new AuthError("authentication_required", "malformed token");
  }
  if (!kid) throw new AuthError("authentication_required", "token has no kid");
  const key = await keys.getKey(kid);
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["EdDSA"],
      clockTolerance: opts.clockToleranceSeconds ?? 5,
      ...(opts.now !== undefined ? { currentDate: new Date(opts.now * 1000) } : {}),
    });
    const claims = InternalTokenClaims.safeParse(payload);
    if (!claims.success) throw new Error("claims do not match the contract");
    return claims.data;
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError("authentication_required", `invalid token: ${(e as Error).message}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------------------------

/** Throws `permission_denied` unless the principal holds `scope` (secret keys hold every key scope). */
export function requireScope(claims: Claims, scope: string): void {
  if (claims.ptype === "secret_key") return;
  if (!claims.scp.includes(scope)) throw new AuthError("permission_denied", `missing scope ${scope}`);
}

/** The route fields `authorizeRoute` reads. `visibility` absent = not an ops route. */
export type AuthorizableRoute = Pick<AnyRoute, "auth" | "roles" | "stepUp" | "testModeOnly" | "id"> &
  Partial<Pick<AnyRoute, "visibility" | "opsRoles">>;

const isOpsRole = (r: unknown): r is OpsRole => (OPS_ROLES as readonly unknown[]).includes(r);

/**
 * Authorizes a verified principal for a route from its spec definition. Routes that are
 * anonymous at the gateway (`anonymous`, `client_secret`, `gateway`, `internal`, `service_client`)
 * are not handled here.
 *
 * Ops principals (`ptype=ops`, console / ops CLI; spec 0.2.0, foundations §9) fail closed:
 * - the token must carry a known `ops_role`; no other principal type may carry one;
 * - the route must list an `ops:<scope>` entry whose scope the principal holds and its role is
 *   granted (`OPS_ROLE_SCOPES`); a non-ops route admits ops principals only through such an entry
 *   (e.g. `listEvidence` with `ops:rails.read`);
 * - `ops_role` must be in the route's `opsRoles`; an `ops` route without `opsRoles` admits nobody;
 * - `stepUp` routes need a fresh `step_up_until`, exactly as for sessions.
 * `ops` routes refuse every other principal type (only anonymous sign-in routes admit `anonymous`).
 */
export function authorizeRoute(claims: Claims, route: AuthorizableRoute, now = Math.floor(Date.now() / 1000)): void {
  if (route.testModeOnly && claims.lm === true)
    throw new AuthError("livemode_forbidden", `${route.id} is test-mode only`);
  const opsRoute = route.visibility === "ops";
  if (claims.ptype === "ops") {
    authorizeOps(claims, route, opsRoute, now);
    return;
  }
  if (claims.ops_role !== undefined) {
    throw new AuthError("permission_denied", `${claims.ptype} principals carry no ops_role`);
  }
  if (opsRoute && claims.ptype !== "anonymous") {
    throw new AuthError("permission_denied", `${claims.ptype} may not call ops route ${route.id}`);
  }
  const allowed = route.auth.some((a) => {
    switch (claims.ptype) {
      case "secret_key":
        return a === "secret_key" || a.startsWith("restricted_key:");
      case "restricted_key":
        return a.startsWith("restricted_key:") && claims.scp.includes(a.slice("restricted_key:".length));
      case "publishable_key":
        return a === "publishable_key";
      case "client_secret":
        return a === "client_secret";
      case "session":
        return a === "session";
      case "service":
        return a.startsWith("service:") && claims.scp.includes(a.slice("service:".length));
      case "anonymous":
        return a === "anonymous";
      default:
        return false;
    }
  });
  if (!allowed) throw new AuthError("permission_denied", `${claims.ptype} may not call ${route.id}`);
  if (claims.ptype === "session") {
    if (route.roles && (!claims.role || !route.roles.includes(claims.role))) {
      throw new AuthError("permission_denied", `role ${claims.role ?? "none"} may not call ${route.id}`);
    }
    requireFreshStepUp(claims, route, now);
  }
}

function authorizeOps(claims: Claims, route: AuthorizableRoute, opsRoute: boolean, now: number): void {
  const role = claims.ops_role;
  if (!isOpsRole(role)) throw new AuthError("permission_denied", `ops principal without a valid ops_role`);
  const granted: readonly string[] = OPS_ROLE_SCOPES[role] ?? [];
  const allowed = route.auth.some((a) => {
    if (!a.startsWith("ops:")) return false;
    const scope = a.slice("ops:".length);
    return claims.scp.includes(scope) && granted.includes(scope);
  });
  if (!allowed) throw new AuthError("permission_denied", `ops may not call ${route.id}`);
  if (opsRoute && !route.opsRoles?.length) {
    throw new AuthError("permission_denied", `ops route ${route.id} declares no opsRoles`);
  }
  if (route.opsRoles && !route.opsRoles.includes(role)) {
    throw new AuthError("permission_denied", `ops role ${role} may not call ${route.id}`);
  }
  requireFreshStepUp(claims, route, now);
}

function requireFreshStepUp(claims: Claims, route: AuthorizableRoute, now: number): void {
  if (route.stepUp && !(claims.step_up_until !== undefined && claims.step_up_until > now)) {
    throw new AuthError("step_up_required", `${route.id} needs a fresh step-up`);
  }
}

// ---------------------------------------------------------------------------------------------
// Service tokens (client credentials)
// ---------------------------------------------------------------------------------------------

export interface ServiceTokenClient {
  getToken(): Promise<string>;
}

export interface ServiceTokenRefreshFailure {
  readonly clientId: string;
  /** Consecutive failed refreshes in this streak (1 on the first). */
  readonly consecutive: number;
  /** Seconds the cached token stays usable (0 when there is none). */
  readonly usableForSeconds: number;
}

export interface ServiceTokenClientOptions {
  identityUrl: string;
  clientId: string;
  secret?: string;
  secretFile?: string;
  fetch?: typeof fetch;
  /** Clock in unix seconds. */
  now?: () => number;
  /** Start refreshing this long before expiry, s (default 60). */
  refreshBeforeSeconds?: number;
  /** Stop using a cached token this long before expiry, s (default 5). */
  expiryMarginSeconds?: number;
  /** Back-off between background refresh attempts, s: 1 → `maxRetrySeconds` (default 30), ×2, ±20 % jitter. */
  maxRetrySeconds?: number;
  random?: () => number;
  /**
   * Called once per failure streak (the first failure) and on recovery. Default: one JSON log line on stderr,
   * `ALERT service_token_refresh_failing` (warn) and `service token refresh recovered` (info).
   */
  onRefreshFailing?: (e: unknown, info: ServiceTokenRefreshFailure) => void;
  onRefreshRecovered?: (info: { clientId: string; failures: number }) => void;
}

const stderrLog = (level: number, msg: string, fields: Record<string, unknown>) => {
  try {
    process.stderr.write(`${JSON.stringify({ level, time: Date.now(), ...fields, msg })}\n`);
  } catch {
    // logging must never break token handling
  }
};

/**
 * Fetches and caches a service token (foundations §9); concurrent callers share one request.
 *
 * Resilient to identity outages (audit KIT-3): from `exp − 60 s` the token is refreshed in the background while
 * callers keep getting the cached one; a failed refresh is retried with back-off (1 s → 30 s, jitter) and the cached
 * token is served until `exp − 5 s`. Only a caller without a usable token waits for identity (and gets its error).
 * Verifiers keep enforcing `exp`, so this changes availability, not security.
 */
export function serviceTokenClient(opts: ServiceTokenClientOptions): ServiceTokenClient {
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const random = opts.random ?? Math.random;
  const secret = opts.secret ?? (opts.secretFile ? readFileSync(opts.secretFile, "utf8").trim() : undefined);
  if (!secret) throw new Error("service client secret is required");
  const refreshBefore = Math.max(opts.refreshBeforeSeconds ?? 60, TOKEN_TTL_SECONDS.serviceRefreshBefore);
  const margin = opts.expiryMarginSeconds ?? 5;
  const maxRetry = opts.maxRetrySeconds ?? 30;
  const basic = Buffer.from(`${opts.clientId}:${secret}`).toString("base64");
  const failing =
    opts.onRefreshFailing ??
    ((e: unknown, info: ServiceTokenRefreshFailure) =>
      stderrLog(40, "ALERT service_token_refresh_failing: identity unavailable, serving the cached service token", {
        svc: info.clientId,
        usable_for_s: info.usableForSeconds,
        err: e instanceof Error ? e.message : String(e),
      }));
  const recovered =
    opts.onRefreshRecovered ??
    ((info: { clientId: string; failures: number }) =>
      stderrLog(30, "service token refresh recovered", { svc: info.clientId, failures: info.failures }));

  let cached: { token: string; refreshAt: number; usableUntil: number } | null = null;
  let inflight: Promise<string> | null = null;
  let failures = 0;
  let retryAt = 0;

  const notify = (fn: () => void) => {
    try {
      fn();
    } catch {
      // observers must never break token handling
    }
  };

  async function fetchToken(): Promise<string> {
    const res = await f(`${opts.identityUrl.replace(/\/$/, "")}/internal/service-tokens`, {
      method: "POST",
      headers: { authorization: `Basic ${basic}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(2_000),
    });
    if (res.status === 401) throw new AuthError("invalid_client", "service client rejected");
    if (!res.ok) throw new Error(`service-token endpoint returned ${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token || !body.expires_in) throw new Error("malformed service-token response");
    const issued = now();
    const exp = issued + body.expires_in;
    cached = {
      token: body.access_token,
      // a token shorter-lived than the refresh window refreshes from half its lifetime
      refreshAt: Math.max(exp - refreshBefore, issued + body.expires_in / 2),
      usableUntil: exp - margin,
    };
    return body.access_token;
  }

  function refresh(): Promise<string> {
    inflight ??= (async () => {
      try {
        const token = await fetchToken();
        if (failures > 0) {
          const n = failures;
          notify(() => recovered({ clientId: opts.clientId, failures: n }));
        }
        failures = 0;
        retryAt = 0;
        return token;
      } catch (e) {
        failures++;
        const delay = Math.min(2 ** (failures - 1), maxRetry) * (0.8 + 0.4 * random());
        retryAt = now() + delay;
        if (failures === 1) {
          const usableForSeconds = cached ? Math.max(0, cached.usableUntil - now()) : 0;
          notify(() => failing(e, { clientId: opts.clientId, consecutive: failures, usableForSeconds }));
        }
        throw e;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    async getToken() {
      const t = now();
      if (cached && t < cached.refreshAt) return cached.token;
      if (cached && t < cached.usableUntil) {
        // Still valid: refresh in the background (with back-off after failures) and serve the cached token.
        if (!inflight && t >= retryAt) refresh().catch(() => {});
        return cached.token;
      }
      return refresh();
    },
  };
}
