import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  CHAINS,
  chainByBlockchain,
  destinationFingerprint,
  destinationKey,
  evmChainId,
  explorerAddressUrl,
  explorerTxUrl,
  finalityRule,
  getChain,
  normalizeAddress,
  toChecksumAddress,
  validateAddress,
} from "../src/index.js";

const require = createRequire(import.meta.url);
const fpVectors = JSON.parse(
  readFileSync(require.resolve("@nearpay/spec/test-vectors/destination-fingerprint.json"), "utf8"),
);
const BASE = "eip155:8453";
const BTC = "bip122:000000000019d6689c085ae165831e93";
const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

describe("registry", () => {
  it("maps CAIP-2 ↔ 1Click codes uniquely", () => {
    expect(new Set(CHAINS.map((c) => c.caip2)).size).toBe(CHAINS.length);
    expect(new Set(CHAINS.map((c) => c.blockchain)).size).toBe(CHAINS.length);
    for (const c of CHAINS) {
      expect(c.caip2).toMatch(/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/);
      expect(chainByBlockchain(c.blockchain)).toBe(c);
      expect(getChain(c.caip2)).toBe(c);
    }
    expect(getChain("near:mainnet")?.blockchain).toBe("near");
    expect(evmChainId(BASE)).toBe(8453);
    expect(() => evmChainId("near:mainnet")).toThrow();
    expect(getChain("eip155:999999")).toBeUndefined();
  });
  it("covers the Stage 1 Tier-A chains", () => {
    for (const c of ["near:mainnet", "eip155:8453", "eip155:42161", "eip155:1"]) expect(getChain(c), c).toBeDefined();
  });
});

describe("EVM addresses", () => {
  it("validates EIP-55 checksums (EIP-55 test vectors)", () => {
    for (const a of [
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
      "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
      "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
    ]) {
      expect(toChecksumAddress(a.toLowerCase())).toBe(a);
      expect(validateAddress(BASE, a)).toEqual({ ok: true, normalized: a.toLowerCase() });
    }
    expect(validateAddress(BASE, "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD").ok).toBe(false);
  });
  it("accepts all-lower and all-upper, rejects junk and the zero address", () => {
    expect(validateAddress(BASE, "0x52908400098527886e0f7030069857d2e4169ee7").ok).toBe(true);
    expect(validateAddress(BASE, "0x52908400098527886E0F7030069857D2E4169EE7").ok).toBe(true);
    for (const bad of [
      "0x1234",
      "52908400098527886e0f7030069857d2e4169ee7",
      "0xZZ908400098527886e0f7030069857d2e4169ee7",
      "0x0000000000000000000000000000000000000000",
      " 0x52908400098527886e0f7030069857d2e4169ee7",
    ]) {
      expect(validateAddress(BASE, bad).ok, bad).toBe(false);
    }
  });
});

describe("NEAR accounts", () => {
  it("accepts named, implicit and eth-implicit accounts", () => {
    for (const a of [
      "merchant.near",
      "intents.near",
      "a1",
      "f".repeat(64),
      "0x42e06263bb5346ae6421ab1ec1019824e7b284e1",
    ]) {
      expect(validateAddress("near:mainnet", a), a).toEqual({ ok: true, normalized: a });
    }
  });
  it("rejects invalid accounts", () => {
    for (const a of ["A.near", "a", "a..near", "a_.near", "0x42E06263bb5346ae6421ab1ec1019824e7b284e1", "0x123"]) {
      expect(validateAddress("near:mainnet", a).ok, a).toBe(false);
    }
  });
});

describe("Solana and Bitcoin-family addresses", () => {
  it("validates Solana public keys", () => {
    expect(validateAddress(SOL, "So11111111111111111111111111111111111111112").ok).toBe(true);
    expect(validateAddress(SOL, "So1111111111111111111111111111111111").ok).toBe(false);
    expect(validateAddress(SOL, "0OIl").ok).toBe(false);
  });
  it("validates bech32 / bech32m (BIP-173, BIP-350 vectors)", () => {
    for (const a of [
      "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4",
      "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3",
      "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    ]) {
      expect(validateAddress(BTC, a).ok, a).toBe(true);
    }
    for (const a of [
      "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh", // v0 with bech32m checksum
      "bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4", // invalid character
      "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", // testnet prefix
      "bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", // mixed case
    ]) {
      expect(validateAddress(BTC, a).ok, a).toBe(false);
    }
    expect(normalizeAddress(BTC, "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4")).toBe(
      "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    );
  });
  it("validates base58check legacy addresses", () => {
    expect(validateAddress(BTC, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").ok).toBe(true);
    expect(validateAddress(BTC, "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy").ok).toBe(true);
    expect(validateAddress(BTC, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb").ok).toBe(false);
    expect(validateAddress("bip122:12a765e31ffd4059bada1e25190f6e98", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").ok).toBe(
      false,
    );
  });
  it("refuses unknown chains", () => {
    expect(validateAddress("tron:0x2b6653dc", "T...")).toEqual({
      ok: false,
      reason: "unsupported chain tron:0x2b6653dc",
    });
    expect(() => normalizeAddress(BASE, "nope")).toThrow(/not a valid address/);
  });
});

describe("finality and explorers", () => {
  it("follows ADR-0012 Tier-A finality", () => {
    expect(finalityRule(BASE)).toEqual({ kind: "block_tag", tag: "finalized" });
    expect(finalityRule("near:mainnet")).toEqual({ kind: "near_final" });
    expect(finalityRule(BTC, 999_999_999n)).toEqual({ kind: "confirmations", confirmations: 1 });
    expect(finalityRule(BTC, 1_000_000_000n)).toEqual({ kind: "confirmations", confirmations: 2 });
  });
  it("builds explorer links", () => {
    expect(explorerTxUrl(BASE, "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerAddressUrl("near:mainnet", "merchant.near")).toBe("https://nearblocks.io/address/merchant.near");
    expect(() => explorerTxUrl("eip155:999999", "x")).toThrow();
  });
});

describe("destination keys and fingerprints (spec vectors)", () => {
  it("matches every fingerprint vector", () => {
    for (const c of fpVectors.cases) {
      expect(destinationKey(c.chain, c.address_norm, c.asset_id)).toBe(c.input);
      expect(destinationFingerprint(c.chain, c.address_norm, c.asset_id)).toBe(c.fingerprint);
    }
  });
  it("refuses separators inside key parts", () => {
    expect(() => destinationKey("near:mainnet", "a|b", "x")).toThrow();
  });
});
