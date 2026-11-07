/** Internal JWTs for tests (a fresh Ed25519 key per process; never used outside tests). */
import { generateKeyPairSync } from "node:crypto";
import { HEADERS, OPS_ROLE_SCOPES, type OpsRole } from "@nearpay/spec";
import { type ClaimsInput, loadSigningKey, type SigningKey, signInternalJwt, staticKeys } from "@nearpay-internal/auth";
import { newId } from "@nearpay-internal/ids";

let key: SigningKey | null = null;

export function testSigningKey(): SigningKey {
  key ??= loadSigningKey(
    "test-1",
    generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  );
  return key;
}

/** Key source that verifies tokens minted by `mintTestToken`. */
export function testKeySource() {
  return staticKeys([testSigningKey()]);
}

export function mintTestToken(claims: ClaimsInput, ttlSeconds = 60): Promise<string> {
  return signInternalJwt(claims, testSigningKey(), ttlSeconds);
}

// ---- ops (console) principals — spec 0.2.0 ------------------------------------------------------

export interface OpsTokenOptions {
  /** Console role (`ops_role` claim). Default `ops`. */
  role?: OpsRole;
  /** Operator id (`sub`, a user id). Default: a fresh `usr_…`. */
  sub?: string;
  /** Scopes (`scp`). Default: what identity mints for the role (`OPS_ROLE_SCOPES`). */
  scopes?: readonly string[];
  /**
   * Step-up freshness: `true` = fresh for 10 min, a number = fresh for that many seconds (negative =
   * expired that long ago), `false`/absent = no step-up claim.
   */
  stepUp?: boolean | number;
  /** Request id (`rid`). Default: a fresh `req_…`. */
  rid?: string;
}

/** Claims of an ops principal (`ptype=ops`) as identity's `/internal/authz` mints them on the console host. */
export function opsClaims(o: OpsTokenOptions = {}, now = Math.floor(Date.now() / 1000)): ClaimsInput {
  const role = o.role ?? "ops";
  const fresh = o.stepUp === true ? 600 : typeof o.stepUp === "number" ? o.stepUp : undefined;
  return {
    sub: o.sub ?? newId("usr"),
    ptype: "ops",
    ops_role: role,
    scp: [...(o.scopes ?? OPS_ROLE_SCOPES[role])],
    rid: o.rid ?? newId("req"),
    ...(fresh !== undefined ? { step_up_until: now + fresh } : {}),
  };
}

/** A request token for an ops principal, minted by the test key (send it as `X-NearPay-Token`). */
export function mintOpsToken(o: OpsTokenOptions = {}, ttlSeconds = 60): Promise<string> {
  return mintTestToken(opsClaims(o), ttlSeconds);
}

/**
 * Token provider for `httpClient({serviceToken})` that calls a peer (or a `mockPeer`) as an ops
 * principal; mints a fresh token per call so step-up freshness is computed at call time.
 */
export function testOpsToken(o: OpsTokenOptions = {}): () => Promise<string> {
  const sub = o.sub ?? newId("usr");
  return () => mintOpsToken({ ...o, sub });
}

/** `{ "X-NearPay-Token": <ops token> }` for `app.inject` / `fetch` in tests. */
export async function opsHeaders(o: OpsTokenOptions = {}): Promise<Record<string, string>> {
  return { [HEADERS.token]: await mintOpsToken(o) };
}
