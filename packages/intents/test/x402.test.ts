/**
 * x402 `near-intents` helpers. Expected values are copied from nearpay-spec
 * `test-vectors/x402-near-intents.json` (spec 0.3.0); switch to `require.resolve("@nearpay/spec/test-vectors/…")`
 * once kit builds against spec 0.3.0.
 */
import { describe, expect, it } from "vitest";
import {
  jcs,
  mintOperationToken,
  type NearIntentsBindingInput,
  nearIntentsBinding,
  type OperationTokenInput,
  verifyOperationToken,
} from "../src/index.js";

const BINDING_INPUT: NearIntentsBindingInput = {
  method: "near-intents",
  account_id: "acct_01jbz9k3m4n5p6q7r8s9t0v1w2",
  resource_url: "https://merchant.example/premium",
  origin_network: "eip155:8453",
  origin_asset_id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  pay_to: "merchant.near",
  asset_id: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  amount: "1000000",
  max_timeout_s: 1800,
  nonce16: "361441f00c324e2775626d50b2489734",
  expires_at: 1794132300,
};
const BINDING = "np1:FkMXJmBuTZEMpEvn6a6VRVGugj435HBY98sUfKJhinuj";
const KEY = Uint8Array.from(Buffer.from("db903712fdfd9030c4c5299fe1402a9d9b8541072b60f6bf56db8952381f6a4f", "hex"));
const TOKEN_INPUT: OperationTokenInput = {
  v: 1,
  binding: BINDING,
  network: "eip155:8453",
  deposit_address: "0x76b4c56085ED136a8744D52bE956396624a730E8",
  deposit_memo: null,
  resource_url: "https://merchant.example/premium",
  destination: {
    network: "near:mainnet",
    asset: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    amount: "1000000",
    recipient: "merchant.near",
  },
  expiry: 1794220320,
};
const TOKEN = "k1.1794220320.HlEcLQKWz-n8v36o4oNNsu7grADXll7PBNhbvxspJDI";
const { expiry: _expiry, ...RECOMPUTED } = TOKEN_INPUT;
const keys = new Map([["k1", KEY]]);

describe("jcs", () => {
  it("sorts keys recursively and keeps null", () => {
    expect(jcs({ b: 1, a: { d: null, c: "x" } })).toBe('{"a":{"c":"x","d":null},"b":1}');
  });
  it("refuses floats, arrays and booleans", () => {
    expect(() => jcs({ a: 1.5 })).toThrow(RangeError);
    expect(() => jcs([1])).toThrow(TypeError);
    expect(() => jcs(true)).toThrow(TypeError);
  });
});

describe("near-intents binding", () => {
  it("reproduces the spec vector", () => {
    expect(nearIntentsBinding(BINDING_INPUT)).toBe(BINDING);
  });
  it("changes with every field", () => {
    expect(nearIntentsBinding({ ...BINDING_INPUT, amount: "1000001" })).not.toBe(BINDING);
    expect(nearIntentsBinding({ ...BINDING_INPUT, origin_network: "eip155:42161" })).not.toBe(BINDING);
  });
});

describe("operation token", () => {
  it("mints the spec vector", () => {
    expect(mintOperationToken(KEY, "k1", TOKEN_INPUT)).toBe(TOKEN);
  });
  it("verifies against the recomputed input", () => {
    expect(verifyOperationToken(TOKEN, keys, RECOMPUTED, TOKEN_INPUT.expiry - 1)).toEqual({
      ok: true,
      kid: "k1",
      expiry: TOKEN_INPUT.expiry,
    });
  });
  it("checks expiry before the key", () => {
    expect(verifyOperationToken(TOKEN, new Map(), RECOMPUTED, TOKEN_INPUT.expiry)).toEqual({
      ok: false,
      reason: "expired",
    });
  });
  it("rejects unknown keys, malformed tokens and any changed term", () => {
    const now = TOKEN_INPUT.expiry - 10;
    expect(verifyOperationToken(TOKEN, new Map([["k2", KEY]]), RECOMPUTED, now)).toMatchObject({
      reason: "unknown_key",
    });
    expect(verifyOperationToken("k1.x.y", keys, RECOMPUTED, now)).toMatchObject({ reason: "malformed" });
    const changed = [
      { ...RECOMPUTED, deposit_address: "0x76b4c56085ed136a8744d52be956396624a730e8" },
      { ...RECOMPUTED, deposit_memo: "1" },
      { ...RECOMPUTED, resource_url: "https://merchant.example/other" },
      { ...RECOMPUTED, destination: { ...RECOMPUTED.destination, amount: "999999" } },
      { ...RECOMPUTED, binding: "np1:FkMXJmBuTZEMpEvn6a6VRVGugj435HBY98sUfKJhinuk" },
    ];
    for (const c of changed) expect(verifyOperationToken(TOKEN, keys, c, now)).toMatchObject({ reason: "invalid" });
    // a later expiry in the token is a different MAC input
    const forged = TOKEN.replace("1794220320", "1894220320");
    expect(verifyOperationToken(forged, keys, RECOMPUTED, now)).toMatchObject({ reason: "invalid" });
  });
  it("refuses short keys and bad kids", () => {
    expect(() => mintOperationToken(KEY.slice(0, 16), "k1", TOKEN_INPUT)).toThrow(RangeError);
    expect(() => mintOperationToken(KEY, "K1", TOKEN_INPUT)).toThrow(RangeError);
  });
});
