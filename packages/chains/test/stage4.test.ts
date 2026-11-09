/** Stage 4 helpers checked against the spec 0.4.0 chain vectors (fixture copy until the kit bumps to spec 0.4.0). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BITCOIN_MAINNET, bitcoinAddressType, splAssetId } from "../src/index.js";

const v = JSON.parse(readFileSync(new URL("./fixtures/chains-solana-bitcoin.json", import.meta.url), "utf8"));

describe("splAssetId (spec chain vectors)", () => {
  it("reproduces every SPL omft asset id", () => {
    expect(v.spl_mints.length).toBeGreaterThan(0);
    for (const m of v.spl_mints) expect(splAssetId(m.mint), m.mint).toBe(m.asset_id);
    for (const a of v.assets) expect(splAssetId(a.token.address), a.asset_id).toBe(a.asset_id);
  });
  it("refuses non-mints", () => {
    expect(() => splAssetId("7DUeBUtEcb7nujVZRJmeBju3X1mo6PpnWNtJ9EBhdY")).toThrow(/not a Solana mint/); // 31 bytes
    expect(() => splAssetId("EyjEeiTxb4rvkoN3ZA2zTimuc6VyF8V1QuH9TT66Gkn0")).toThrow(/not base58/);
  });
});

describe("bitcoinAddressType (spec chain vectors)", () => {
  it("classifies every vector address", () => {
    for (const c of v.bitcoin) {
      const expected = !c.valid ? null : c.type === "p2wpkh" || c.type === "p2tr" ? c.type : "other";
      expect(bitcoinAddressType(c.address, c.chain), c.address).toBe(expected);
      if (c.valid) expect(expected === "p2wpkh" || expected === "p2tr").toBe(c.destination_allowed);
    }
  });
  it("defaults to Bitcoin mainnet and refuses other chain families", () => {
    expect(bitcoinAddressType("bc1qpct5sxzppv204tth290uen85nqkhzw9sq5m0ku")).toBe("p2wpkh");
    expect(BITCOIN_MAINNET).toBe("bip122:000000000019d6689c085ae165831e93");
    expect(() => bitcoinAddressType("x", "near:mainnet")).toThrow(/not a bitcoin-family chain/);
  });
});
