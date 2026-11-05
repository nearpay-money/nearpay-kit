import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson, createEnvelopeCipher, jobBackoffMs, loadKek, parseKek, requestHash } from "../src/index.js";

describe("envelope cipher", () => {
  const kek = randomBytes(32);
  const c = createEnvelopeCipher(kek);
  it("round-trips and uses a fresh data key per value", () => {
    const a = c.encrypt('{"client_secret":"cs_x_secret_y"}', "aad");
    const b = c.encrypt('{"client_secret":"cs_x_secret_y"}', "aad");
    expect(a.equals(b)).toBe(false);
    expect(c.decrypt(a, "aad").toString()).toBe('{"client_secret":"cs_x_secret_y"}');
    expect(a.includes(Buffer.from("cs_x_secret"))).toBe(false);
  });
  it("fails closed on tampering, wrong AAD or wrong KEK", () => {
    const a = c.encrypt("secret", "aad");
    const t = Buffer.from(a);
    t[t.length - 1] = (t[t.length - 1] as number) ^ 1;
    expect(() => c.decrypt(t, "aad")).toThrow();
    expect(() => c.decrypt(a, "other")).toThrow();
    expect(() => createEnvelopeCipher(randomBytes(32)).decrypt(a, "aad")).toThrow();
    expect(() => c.decrypt(Buffer.from([2, 0]), "")).toThrow(/unsupported/);
  });
  it("loads KEKs as base64 or hex, 32 bytes only", () => {
    const dir = mkdtempSync(join(tmpdir(), "kek-"));
    writeFileSync(join(dir, "b64"), `${kek.toString("base64")}\n`);
    writeFileSync(join(dir, "hex"), kek.toString("hex"));
    expect(loadKek(join(dir, "b64")).equals(kek)).toBe(true);
    expect(loadKek(join(dir, "hex")).equals(kek)).toBe(true);
    expect(() => parseKek(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(() => createEnvelopeCipher(randomBytes(16))).toThrow();
  });
});

describe("request hashing", () => {
  it("is key-order independent and method/path sensitive", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 1 }], u: undefined })).toBe('{"a":[{"c":1,"d":2}],"b":1}');
    expect(requestHash("post", "/v1/x", { a: 1, b: 2 }).equals(requestHash("POST", "/v1/x", { b: 2, a: 1 }))).toBe(
      true,
    );
    expect(requestHash("POST", "/v1/x", { a: 1 }).equals(requestHash("POST", "/v1/y", { a: 1 }))).toBe(false);
    expect(requestHash("POST", "/v1/x", { a: 1 }).equals(requestHash("POST", "/v1/x", { a: 2 }))).toBe(false);
  });
});

describe("job backoff", () => {
  it("is min(2^n × 5 s, 1 h) ± 20 %", () => {
    expect(jobBackoffMs(1, () => 0.5)).toBe(10_000);
    expect(jobBackoffMs(3, () => 0.5)).toBe(40_000);
    expect(jobBackoffMs(20, () => 0.5)).toBe(3_600_000);
    expect(jobBackoffMs(1, () => 0)).toBe(8_000);
    expect(jobBackoffMs(1, () => 1)).toBe(12_000);
  });
});
