/** Internal JWTs for tests (a fresh Ed25519 key per process; never used outside tests). */
import { generateKeyPairSync } from "node:crypto";
import { type ClaimsInput, loadSigningKey, type SigningKey, signInternalJwt, staticKeys } from "@nearpay-internal/auth";

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
