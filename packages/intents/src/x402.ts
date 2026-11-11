/**
 * x402 `near-intents` helpers for agentpay (lld/agentpay.md §3.1; spec 0.3.0 `X402NearIntentsBindingInput`,
 * `X402OperationTokenInput`, vectors `test-vectors/x402-near-intents.json`).
 *
 * - `nearIntentsBinding(input)` = `np1:` + base58(sha256(JCS(input))).
 * - `operationToken` = `<kid>.<expiry>.<mac>`, mac = unpadded base64url(HMAC-SHA256(key, JCS(input))).
 *
 * The inputs hold only strings, safe integers, null and nested objects, for which RFC 8785 (JCS) is
 * JSON with lexicographically sorted keys; `jcs()` refuses anything else. The input types are the spec
 * schemas' output types; results are cross-checked against the spec's `parseOperationToken` and
 * `quotedRequirements` in the tests.
 */
import type { X402NearIntentsBindingInput, X402OperationTokenInput, z } from "@nearpay-money/spec";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";

/** Drops the index signature a zod loose object adds, keeping the declared fields (so `Omit` works). */
type Declared<T> = { readonly [K in keyof T as string extends K ? never : K]: T[K] };

/** Spec `X402NearIntentsBindingInput` (declared fields). */
export type NearIntentsBindingInput = Declared<z.output<typeof X402NearIntentsBindingInput>>;

/** Spec `X402OperationTokenInput` (declared fields). */
export type OperationTokenInput = Declared<z.output<typeof X402OperationTokenInput>>;

type Json = string | number | null | { readonly [k: string]: Json };

/** RFC 8785 for strings, safe integers, null and objects (no arrays, floats or booleans needed here). */
export function jcs(value: unknown): string {
  if (value === null || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError(`jcs: only safe integers are supported, got ${value}`);
    return String(value);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, Json>).filter(([, v]) => v !== undefined);
    // JCS sorts by UTF-16 code units, which is JavaScript's default string order
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${jcs(v)}`).join(",")}}`;
  }
  throw new TypeError(`jcs: unsupported value of type ${Array.isArray(value) ? "array" : typeof value}`);
}

const enc = new TextEncoder();

/** `np1:` binding of a `near-intents` unquoted entry. */
export function nearIntentsBinding(input: NearIntentsBindingInput): string {
  if (input.method !== "near-intents") throw new RangeError("binding input method must be near-intents");
  if (!/^[0-9a-f]{32}$/.test(input.nonce16)) throw new RangeError("nonce16 must be 16 bytes of lower-case hex");
  return `np1:${bs58.encode(sha256(enc.encode(jcs(input))))}`;
}

const KID_RE = /^[a-z0-9-]{1,32}$/;
const TOKEN_RE = /^([a-z0-9-]{1,32})\.([0-9]{1,12})\.([A-Za-z0-9_-]{43})$/;

function mac(key: Uint8Array, input: OperationTokenInput): string {
  return Buffer.from(hmac(sha256, key, enc.encode(jcs(input)))).toString("base64url");
}

/** Mints an operation token; `input.expiry` is the token's expiry (refund deadline + ≥ 24 h). */
export function mintOperationToken(key: Uint8Array, kid: string, input: OperationTokenInput): string {
  if (!KID_RE.test(kid)) throw new RangeError(`kid must match ${KID_RE}`);
  if (key.length < 32) throw new RangeError("operation token key must be at least 32 bytes");
  if (input.v !== 1) throw new RangeError("operation token input version must be 1");
  return `${kid}.${input.expiry}.${mac(key, input)}`;
}

export type OperationTokenCheck =
  | { readonly ok: true; readonly kid: string; readonly expiry: number }
  | { readonly ok: false; readonly reason: "malformed" | "expired" | "unknown_key" | "invalid" };

/**
 * Verifies a token against the facilitator's keys and the recomputed input (built from
 * `accepted.network`, the payload's deposit address/memo, `resource.url`, the server's own
 * destination terms and the binding). Expiry is checked first, without a key lookup
 * (`invalid_exact_near_intents_token_expired`); `unknown_key` and `invalid` map to `…_token_invalid`.
 */
export function verifyOperationToken(
  token: string,
  keys: ReadonlyMap<string, Uint8Array>,
  input: Omit<OperationTokenInput, "expiry">,
  nowSeconds: number,
): OperationTokenCheck {
  const m = TOKEN_RE.exec(token);
  if (!m) return { ok: false, reason: "malformed" };
  const kid = m[1] as string;
  const expiry = Number(m[2]);
  if (expiry <= nowSeconds) return { ok: false, reason: "expired" };
  const key = keys.get(kid);
  if (!key) return { ok: false, reason: "unknown_key" };
  const expected = mac(key, { ...input, expiry } as OperationTokenInput);
  const a = Buffer.from(expected);
  const b = Buffer.from(m[3] as string);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0 ? { ok: true, kid, expiry } : { ok: false, reason: "invalid" };
}
