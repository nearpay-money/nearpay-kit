/**
 * x402 `near-intents` helpers against nearpay-spec `test-vectors/x402-near-intents.json` and the spec's
 * own `parseOperationToken` / `quotedRequirements`. Negative cases stay inline.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { NearIntentsQuote, parseOperationToken, quotedRequirements } from "@nearpay/spec";
import { describe, expect, it } from "vitest";
import {
  jcs,
  mintOperationToken,
  type NearIntentsBindingInput,
  nearIntentsBinding,
  type OperationTokenInput,
  verifyOperationToken,
} from "../src/index.js";

const require = createRequire(import.meta.url);
const V = JSON.parse(readFileSync(require.resolve("@nearpay/spec/test-vectors/x402-near-intents.json"), "utf8"));

const BINDING_INPUT: NearIntentsBindingInput = V.binding.input;
const BINDING: string = V.binding.binding;
const KID: string = V.operation_token.kid;
const KEY = Uint8Array.from(Buffer.from(V.operation_token.key_hex, "hex"));
const TOKEN_INPUT: OperationTokenInput = V.operation_token.input;
const TOKEN: string = V.operation_token.token;
const { expiry: _expiry, ...RECOMPUTED } = TOKEN_INPUT;
const keys = new Map([[KID, KEY]]);

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
    expect(jcs(BINDING_INPUT)).toBe(V.binding.jcs);
    expect(nearIntentsBinding(BINDING_INPUT)).toBe(BINDING);
  });
  it("changes with every field", () => {
    expect(nearIntentsBinding({ ...BINDING_INPUT, amount: "1000001" })).not.toBe(BINDING);
    expect(nearIntentsBinding({ ...BINDING_INPUT, origin_network: "eip155:42161" })).not.toBe(BINDING);
  });
});

describe("operation token", () => {
  it("mints the spec vector", () => {
    expect(jcs(TOKEN_INPUT)).toBe(V.operation_token.jcs);
    expect(mintOperationToken(KEY, KID, TOKEN_INPUT)).toBe(TOKEN);
  });
  it("verifies against the recomputed input", () => {
    expect(verifyOperationToken(TOKEN, keys, RECOMPUTED, TOKEN_INPUT.expiry - 1)).toEqual({
      ok: true,
      kid: KID,
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
      { ...RECOMPUTED, binding: `${BINDING.slice(0, -1)}${BINDING.endsWith("k") ? "j" : "k"}` },
    ];
    for (const c of changed) expect(verifyOperationToken(TOKEN, keys, c, now)).toMatchObject({ reason: "invalid" });
    // a later expiry in the token is a different MAC input
    const forged = TOKEN.replace(`.${TOKEN_INPUT.expiry}.`, `.${TOKEN_INPUT.expiry + 100_000_000}.`);
    expect(verifyOperationToken(forged, keys, RECOMPUTED, now)).toMatchObject({ reason: "invalid" });
  });
  it("refuses short keys and bad kids", () => {
    expect(() => mintOperationToken(KEY.slice(0, 16), KID, TOKEN_INPUT)).toThrow(RangeError);
    expect(() => mintOperationToken(KEY, "K1", TOKEN_INPUT)).toThrow(RangeError);
  });
});

describe("agrees with the spec helpers", () => {
  const H = V.headers;
  it("spec parseOperationToken splits a kit-minted token into the kit's kid, expiry and MAC", () => {
    expect(parseOperationToken(mintOperationToken(KEY, KID, TOKEN_INPUT))).toEqual({
      kid: KID,
      expiry: TOKEN_INPUT.expiry,
      mac: V.operation_token.mac,
    });
  });
  it("kit treats a token as malformed exactly when the spec parser does", () => {
    const now = TOKEN_INPUT.expiry - 10;
    const candidates = [
      TOKEN,
      "k1.x.y",
      `K1${TOKEN.slice(2)}`,
      `${"a".repeat(33)}${TOKEN.slice(2)}`,
      `${TOKEN}A`,
      TOKEN.slice(0, -1),
      TOKEN.replace(`.${TOKEN_INPUT.expiry}.`, ".1234567890123."),
      TOKEN.replace(`.${TOKEN_INPUT.expiry}.`, ".-1."),
      "",
    ];
    for (const t of candidates) {
      const kitMalformed =
        (verifyOperationToken(t, keys, RECOMPUTED, now) as { reason?: string }).reason === "malformed";
      expect(kitMalformed, t).toBe(parseOperationToken(t) === null);
    }
  });
  it("the unquoted entry carries the kit binding; spec quotedRequirements with the kit token gives the quoted vector", () => {
    const unquoted = H.payment_required_unquoted.accepts[0];
    expect(unquoted.extra.binding).toBe(nearIntentsBinding(BINDING_INPUT));
    const quote = NearIntentsQuote.parse({
      ...H.verify_response_quote.extra,
      operationToken: mintOperationToken(KEY, KID, TOKEN_INPUT),
    });
    expect(quotedRequirements(unquoted, quote)).toEqual(H.payment_required_quoted.accepts[0]);
    // the facilitator recomputes the token input from the quoted entry and verifies the kit token
    const quoted = H.payment_required_quoted.accepts[0];
    const recomputed = {
      v: 1 as const,
      binding: quoted.extra.binding,
      network: quoted.network,
      deposit_address: quoted.payTo,
      deposit_memo: quoted.extra.depositMemo ?? null,
      resource_url: H.payment_required_quoted.resource.url,
      destination: quoted.extra.destination,
    };
    const parsed = parseOperationToken(quoted.extra.operationToken);
    expect(verifyOperationToken(quoted.extra.operationToken, keys, recomputed, (parsed?.expiry ?? 0) - 1)).toEqual({
      ok: true,
      kid: KID,
      expiry: TOKEN_INPUT.expiry,
    });
  });
});
