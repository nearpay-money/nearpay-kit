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
  TOKEN_TTL_SECONDS,
} from "@nearpay/spec";
import { decodeProtectedHeader, exportJWK, importJWK, type JWK, jwtVerify, SignJWT } from "jose";

export type { Claims as InternalClaims };
export { HEADERS };

/** Claims a minter supplies; `iss`, `aud`, `iat` and `exp` are added when signing. */
export type ClaimsInput = Pick<Claims, "sub" | "acct" | "lm" | "ptype" | "scp" | "rid" | "role" | "step_up_until">;

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

/**
 * Authorizes a verified principal for a route from its spec definition. Routes that are
 * anonymous at the gateway (`anonymous`, `client_secret`, `gateway`, `internal`, `service_client`)
 * are not handled here.
 */
export function authorizeRoute(
  claims: Claims,
  route: Pick<AnyRoute, "auth" | "roles" | "stepUp" | "testModeOnly" | "id">,
  now = Math.floor(Date.now() / 1000),
): void {
  if (route.testModeOnly && claims.lm === true)
    throw new AuthError("livemode_forbidden", `${route.id} is test-mode only`);
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
      case "ops":
        return a.startsWith("ops:") && claims.scp.includes(a.slice("ops:".length));
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
    if (route.stepUp && !(claims.step_up_until !== undefined && claims.step_up_until > now)) {
      throw new AuthError("step_up_required", `${route.id} needs a fresh step-up`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Service tokens (client credentials)
// ---------------------------------------------------------------------------------------------

export interface ServiceTokenClient {
  getToken(): Promise<string>;
}

/** Fetches and caches a service token until 30 s before expiry; concurrent callers share one request. */
export function serviceTokenClient(opts: {
  identityUrl: string;
  clientId: string;
  secret?: string;
  secretFile?: string;
  fetch?: typeof fetch;
  now?: () => number;
}): ServiceTokenClient {
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const secret = opts.secret ?? (opts.secretFile ? readFileSync(opts.secretFile, "utf8").trim() : undefined);
  if (!secret) throw new Error("service client secret is required");
  const basic = Buffer.from(`${opts.clientId}:${secret}`).toString("base64");
  let cached: { token: string; refreshAt: number } | null = null;
  let inflight: Promise<string> | null = null;
  return {
    async getToken() {
      if (cached && now() < cached.refreshAt) return cached.token;
      inflight ??= (async () => {
        try {
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
          cached = {
            token: body.access_token,
            refreshAt: now() + body.expires_in - TOKEN_TTL_SECONDS.serviceRefreshBefore,
          };
          return body.access_token;
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
  };
}
