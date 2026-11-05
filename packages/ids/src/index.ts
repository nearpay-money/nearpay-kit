/**
 * Prefixed identifiers (lld/00-foundations.md §5): `<prefix>_<26 chars>` = UUIDv7 in TypeID
 * encoding (lower-case Crockford base32 of the 128-bit value left-padded to 130 bits).
 * Databases store the UUID; APIs render and accept the prefixed form.
 */
import { ID_ALPHABET, ID_PREFIXES, type IdPrefix, idPattern } from "@nearpay/spec";

export type { IdPrefix };
export type PrefixedId<P extends IdPrefix = IdPrefix> = `${P}_${string}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DECODE: Record<string, bigint> = Object.fromEntries([...ID_ALPHABET].map((c, i) => [c, BigInt(i)]));

/** Encodes a canonical UUID string as a 26-character TypeID suffix. */
export function encodeUuid(uuid: string): string {
  if (!UUID_RE.test(uuid)) throw new Error(`invalid uuid: ${uuid}`);
  let n = BigInt(`0x${uuid.replace(/-/g, "")}`);
  let s = "";
  for (let i = 0; i < 26; i++) {
    s = ID_ALPHABET[Number(n & 31n)] + s;
    n >>= 5n;
  }
  return s;
}

/** Decodes a 26-character TypeID suffix to a canonical (lower-case) UUID string. */
export function decodeSuffix(suffix: string): string {
  if (!/^[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(suffix)) throw new Error(`invalid id suffix: ${suffix}`);
  let n = 0n;
  for (const c of suffix) n = (n << 5n) | (DECODE[c] as bigint);
  const hex = n.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------------------------
// UUIDv7 (RFC 9562 §5.7, method 1: 12-bit counter in rand_a keeps ids monotonic within a ms)
// ---------------------------------------------------------------------------------------------

let lastMs = -1;
let counter = 0;

/** Clock and randomness are injectable for tests. */
export interface UuidSource {
  now(): number;
  random(bytes: Uint8Array): Uint8Array;
}

const defaultSource: UuidSource = {
  now: () => Date.now(),
  random: (b) => crypto.getRandomValues(b),
};

/** Generates a UUIDv7 string; monotonic within a process. */
export function uuidv7(source: UuidSource = defaultSource): string {
  let ms = source.now();
  const rnd = source.random(new Uint8Array(10));
  if (ms <= lastMs) {
    ms = lastMs;
    counter += 1;
    if (counter > 0xfff) {
      // counter exhausted within one millisecond: advance the logical clock
      ms = lastMs + 1;
      counter = (rnd[0] as number) & 0x7ff;
    }
  } else {
    counter = (((rnd[0] as number) << 8) | (rnd[1] as number)) & 0x7ff; // leave headroom for increments
  }
  lastMs = ms;
  const b = new Uint8Array(16);
  const msBig = BigInt(ms);
  for (let i = 0; i < 6; i++) b[i] = Number((msBig >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  b[8] = 0x80 | ((rnd[2] as number) & 0x3f);
  for (let i = 9; i < 16; i++) b[i] = rnd[i - 6] as number;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Milliseconds since epoch encoded in a UUIDv7. */
export function uuidTimestamp(uuid: string): number {
  if (!UUID_RE.test(uuid) || uuid[14] !== "7") throw new Error(`not a UUIDv7: ${uuid}`);
  return Number.parseInt(uuid.replace(/-/g, "").slice(0, 12), 16);
}

// ---------------------------------------------------------------------------------------------
// Prefixed ids
// ---------------------------------------------------------------------------------------------

function assertPrefix(prefix: string): asserts prefix is IdPrefix {
  if (!(prefix in ID_PREFIXES)) throw new Error(`unknown id prefix: ${prefix}`);
}

/** New id with a fresh UUIDv7. */
export function newId<P extends IdPrefix>(prefix: P, source?: UuidSource): PrefixedId<P> {
  assertPrefix(prefix);
  return `${prefix}_${encodeUuid(uuidv7(source))}` as PrefixedId<P>;
}

/** Prefixed id for an existing UUID (e.g. a database key). */
export function fromUuid<P extends IdPrefix>(prefix: P, uuid: string): PrefixedId<P> {
  assertPrefix(prefix);
  return `${prefix}_${encodeUuid(uuid.toLowerCase())}` as PrefixedId<P>;
}

/** Splits an id into prefix and UUID; throws on anything malformed. */
export function parseId(id: string): { prefix: IdPrefix; uuid: string } {
  const i = id.lastIndexOf("_");
  if (i <= 0) throw new Error(`invalid id: ${id}`);
  const prefix = id.slice(0, i);
  assertPrefix(prefix);
  if (!idPattern(prefix).test(id)) throw new Error(`invalid id: ${id}`);
  return { prefix, uuid: decodeSuffix(id.slice(i + 1)) };
}

/** UUID of an id, checking the expected prefix. */
export function toUuid(id: string, expected?: IdPrefix): string {
  const { prefix, uuid } = parseId(id);
  if (expected && prefix !== expected) throw new Error(`expected a ${expected}_ id, got ${prefix}_`);
  return uuid;
}

/** True when `s` is a well-formed id with this prefix. */
export function isId<P extends IdPrefix>(prefix: P, s: unknown): s is PrefixedId<P> {
  return typeof s === "string" && idPattern(prefix).test(s);
}
