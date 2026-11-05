import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeSuffix,
  encodeUuid,
  fromUuid,
  isId,
  newId,
  parseId,
  toUuid,
  uuidTimestamp,
  uuidv7,
} from "../src/index.js";

const require = createRequire(import.meta.url);
const vectors = JSON.parse(readFileSync(require.resolve("@nearpay/spec/test-vectors/ids.json"), "utf8"));

describe("TypeID encoding (spec vectors)", () => {
  it("matches the upstream TypeID vectors", () => {
    for (const v of vectors.upstream_typeid) {
      expect(encodeUuid(v.uuid)).toBe(v.suffix);
      expect(decodeSuffix(v.suffix)).toBe(v.uuid);
    }
  });
  it("matches the NearPay vectors", () => {
    for (const v of vectors.nearpay) {
      expect(fromUuid(v.prefix, v.uuid)).toBe(v.id);
      expect(toUuid(v.id, v.prefix)).toBe(v.uuid);
    }
  });
  it("rejects the invalid vectors", () => {
    for (const v of vectors.invalid) {
      expect(isId("pi", v.id), v.reason).toBe(false);
      expect(() => parseId(v.id), v.reason).toThrow();
    }
  });
  it("round-trips any UUID", () => {
    fc.assert(
      fc.property(fc.uuid(), (u) => {
        expect(decodeSuffix(encodeUuid(u))).toBe(u);
      }),
    );
  });
});

describe("UUIDv7", () => {
  it("sets version 7, RFC variant and the timestamp", () => {
    const u = uuidv7({ now: () => 1793873400123, random: (b) => b.fill(0xab) });
    expect(u[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(u[19]);
    expect(uuidTimestamp(u)).toBe(1793873400123);
  });
  it("is strictly monotonic within one millisecond and across a clock step back", () => {
    let t = 1793873400000;
    const src = { now: () => t, random: (b: Uint8Array) => crypto.getRandomValues(b) };
    const ids: string[] = [];
    for (let i = 0; i < 5000; i++) {
      if (i === 2500) t -= 5; // clock moves backwards
      ids.push(uuidv7(src));
    }
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("produces time-sortable prefixed ids", () => {
    const a = newId("pi");
    const b = newId("pi");
    expect(isId("pi", a)).toBe(true);
    expect(a < b).toBe(true);
  });
});

describe("prefixed ids", () => {
  it("validates prefixes and shapes", () => {
    expect(() => newId("nope" as never)).toThrow(/unknown id prefix/);
    expect(() => toUuid(newId("cs"), "pi")).toThrow(/expected a pi_/);
    expect(isId("pi", 42)).toBe(false);
    expect(() => parseId("pi")).toThrow();
    expect(() => encodeUuid("not-a-uuid")).toThrow();
    expect(() => uuidTimestamp("00000000-0000-4000-8000-000000000000")).toThrow();
  });
  it("accepts upper-case UUID input but always renders lower case", () => {
    expect(fromUuid("acct", "01972A6F-3C80-7000-8000-000000000001")).toBe("acct_01jwn6yf40e008000000000001");
  });
});
