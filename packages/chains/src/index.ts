/**
 * Chain registry and address handling (lld/00-foundations.md §4 `chains`, §6).
 * Chain identity is CAIP-2; 1Click's `blockchain` code is kept as an attribute. No domain rules
 * here: which chains are enabled, their tiers and deadlines are rails configuration.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import bs58 from "bs58";

export type ChainFamily = "evm" | "near" | "solana" | "bitcoin";

export interface ChainInfo {
  readonly caip2: string;
  /** 1Click `blockchain` code. */
  readonly blockchain: string;
  readonly name: string;
  readonly family: ChainFamily;
  readonly nativeSymbol: string;
  readonly evmChainId?: number;
  /** Explorer URL templates with `{tx}` / `{address}`. */
  readonly explorer: { readonly tx: string; readonly address: string };
  /** Bitcoin-family address parameters. */
  readonly btc?: { readonly hrp: string; readonly p2pkh: number; readonly p2sh: number };
}

const evm = (id: number, blockchain: string, name: string, native: string, explorer: string): ChainInfo => ({
  caip2: `eip155:${id}`,
  blockchain,
  name,
  family: "evm",
  nativeSymbol: native,
  evmChainId: id,
  explorer: { tx: `${explorer}/tx/{tx}`, address: `${explorer}/address/{address}` },
});

export const CHAINS: readonly ChainInfo[] = Object.freeze([
  {
    caip2: "near:mainnet",
    blockchain: "near",
    name: "NEAR",
    family: "near",
    nativeSymbol: "NEAR",
    explorer: { tx: "https://nearblocks.io/txns/{tx}", address: "https://nearblocks.io/address/{address}" },
  },
  evm(1, "eth", "Ethereum", "ETH", "https://etherscan.io"),
  evm(8453, "base", "Base", "ETH", "https://basescan.org"),
  evm(42161, "arb", "Arbitrum One", "ETH", "https://arbiscan.io"),
  evm(10, "op", "OP Mainnet", "ETH", "https://optimistic.etherscan.io"),
  evm(137, "pol", "Polygon", "POL", "https://polygonscan.com"),
  evm(56, "bsc", "BNB Smart Chain", "BNB", "https://bscscan.com"),
  evm(43114, "avax", "Avalanche C-Chain", "AVAX", "https://snowtrace.io"),
  evm(100, "gnosis", "Gnosis", "XDAI", "https://gnosisscan.io"),
  {
    caip2: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    blockchain: "sol",
    name: "Solana",
    family: "solana",
    nativeSymbol: "SOL",
    explorer: { tx: "https://solscan.io/tx/{tx}", address: "https://solscan.io/account/{address}" },
  },
  {
    caip2: "bip122:000000000019d6689c085ae165831e93",
    blockchain: "btc",
    name: "Bitcoin",
    family: "bitcoin",
    nativeSymbol: "BTC",
    btc: { hrp: "bc", p2pkh: 0x00, p2sh: 0x05 },
    explorer: { tx: "https://mempool.space/tx/{tx}", address: "https://mempool.space/address/{address}" },
  },
  {
    caip2: "bip122:12a765e31ffd4059bada1e25190f6e98",
    blockchain: "ltc",
    name: "Litecoin",
    family: "bitcoin",
    nativeSymbol: "LTC",
    btc: { hrp: "ltc", p2pkh: 0x30, p2sh: 0x32 },
    explorer: { tx: "https://litecoinspace.org/tx/{tx}", address: "https://litecoinspace.org/address/{address}" },
  },
  {
    caip2: "bip122:1a91e3dace36e2be3bf030a65679fe82",
    blockchain: "doge",
    name: "Dogecoin",
    family: "bitcoin",
    nativeSymbol: "DOGE",
    btc: { hrp: "", p2pkh: 0x1e, p2sh: 0x16 },
    explorer: { tx: "https://dogechain.info/tx/{tx}", address: "https://dogechain.info/address/{address}" },
  },
]);

const BY_CAIP2 = new Map(CHAINS.map((c) => [c.caip2, c]));
const BY_CODE = new Map(CHAINS.map((c) => [c.blockchain, c]));

export function getChain(caip2: string): ChainInfo | undefined {
  return BY_CAIP2.get(caip2);
}

export function chainByBlockchain(code: string): ChainInfo | undefined {
  return BY_CODE.get(code);
}

function requireChain(caip2: string): ChainInfo {
  const c = BY_CAIP2.get(caip2);
  if (!c) throw new RangeError(`unknown chain: ${caip2}`);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Address validation and normalisation
// ---------------------------------------------------------------------------------------------

export type AddressCheck = { ok: true; normalized: string } | { ok: false; reason: string };

const NEAR_ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** EIP-55 checksum encoding of a 20-byte hex address. */
export function toChecksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new RangeError(`invalid EVM address: ${address}`);
  const lower = address.slice(2).toLowerCase();
  const hash = keccak_256(new TextEncoder().encode(lower));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = ((hash[i >> 1] as number) >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    out += nibble >= 8 ? (lower[i] as string).toUpperCase() : lower[i];
  }
  return out;
}

function checkEvm(a: string): AddressCheck {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { ok: false, reason: "not a 0x-prefixed 20-byte hex address" };
  const body = a.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (mixed && toChecksumAddress(a) !== a) return { ok: false, reason: "EIP-55 checksum mismatch" };
  if (/^0x0{40}$/i.test(a)) return { ok: false, reason: "zero address" };
  return { ok: true, normalized: a.toLowerCase() };
}

function checkNear(a: string): AddressCheck {
  if (!NEAR_ACCOUNT_RE.test(a)) return { ok: false, reason: "not a valid NEAR account id" };
  if (a.startsWith("0x") && !/^0x[0-9a-f]{40}$/.test(a)) return { ok: false, reason: "invalid eth-implicit account" };
  return { ok: true, normalized: a };
}

function checkSolana(a: string): AddressCheck {
  try {
    if (bs58.decode(a).length !== 32) return { ok: false, reason: "not 32 bytes" };
  } catch {
    return { ok: false, reason: "not base58" };
  }
  return { ok: true, normalized: a };
}

// --- bech32 / bech32m (BIP-173, BIP-350) -------------------------------------------------------
const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= G[i] as number;
  }
  return chk >>> 0;
}
function hrpExpand(hrp: string): number[] {
  return [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
}
function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) return null;
  return out;
}
function checkSegwit(a: string, hrp: string): AddressCheck {
  if (a !== a.toLowerCase() && a !== a.toUpperCase()) return { ok: false, reason: "mixed-case bech32" };
  const s = a.toLowerCase();
  const pos = s.lastIndexOf("1");
  if (s.slice(0, pos) !== hrp || pos < 1 || s.length - pos - 1 < 6 || s.length > 90)
    return { ok: false, reason: "wrong bech32 prefix" };
  const data = [...s.slice(pos + 1)].map((c) => B32.indexOf(c));
  if (data.some((d) => d < 0)) return { ok: false, reason: "invalid bech32 character" };
  const witver = data[0] as number;
  const constant = polymod([...hrpExpand(hrp), ...data]);
  if (constant !== (witver === 0 ? 1 : 0x2bc830a3)) return { ok: false, reason: "bech32 checksum mismatch" };
  const prog = convertBits(data.slice(1, -6), 5, 8);
  if (!prog || prog.length < 2 || prog.length > 40 || witver > 16)
    return { ok: false, reason: "invalid witness program" };
  if (witver === 0 && prog.length !== 20 && prog.length !== 32)
    return { ok: false, reason: "invalid v0 program length" };
  return { ok: true, normalized: s };
}
function checkBase58Check(a: string, versions: number[]): AddressCheck {
  let raw: Uint8Array;
  try {
    raw = bs58.decode(a);
  } catch {
    return { ok: false, reason: "not base58" };
  }
  if (raw.length !== 25) return { ok: false, reason: "wrong length" };
  const payload = raw.slice(0, 21);
  const check = sha256(sha256(payload)).slice(0, 4);
  if (!check.every((b, i) => b === raw[21 + i])) return { ok: false, reason: "base58check checksum mismatch" };
  if (!versions.includes(raw[0] as number)) return { ok: false, reason: "wrong address version" };
  return { ok: true, normalized: a };
}
function checkBitcoin(a: string, p: NonNullable<ChainInfo["btc"]>): AddressCheck {
  if (p.hrp && a.toLowerCase().startsWith(`${p.hrp}1`)) return checkSegwit(a, p.hrp);
  return checkBase58Check(a, [p.p2pkh, p.p2sh]);
}

/** Validates an address for a chain; `normalized` is lower-case for EVM, as-is otherwise. */
export function validateAddress(caip2: string, address: string): AddressCheck {
  const c = getChain(caip2);
  if (!c) return { ok: false, reason: `unsupported chain ${caip2}` };
  if (typeof address !== "string" || address.length === 0 || address.length > 256 || address !== address.trim()) {
    return { ok: false, reason: "empty or padded address" };
  }
  switch (c.family) {
    case "evm":
      return checkEvm(address);
    case "near":
      return checkNear(address);
    case "solana":
      return checkSolana(address);
    case "bitcoin":
      return checkBitcoin(address, c.btc as NonNullable<ChainInfo["btc"]>);
  }
}

/** Normalised address; throws when invalid. */
export function normalizeAddress(caip2: string, address: string): string {
  const r = validateAddress(caip2, address);
  if (!r.ok) throw new RangeError(`${address} is not a valid address on ${caip2}: ${r.reason}`);
  return r.normalized;
}

/** EVM chain id of an `eip155:` chain. */
export function evmChainId(caip2: string): number {
  const c = requireChain(caip2);
  if (c.evmChainId === undefined) throw new RangeError(`${caip2} is not an EVM chain`);
  return c.evmChainId;
}

// ---------------------------------------------------------------------------------------------
// Finality and explorers
// ---------------------------------------------------------------------------------------------

export type FinalityRule =
  | { readonly kind: "block_tag"; readonly tag: "finalized" }
  | { readonly kind: "near_final" }
  | { readonly kind: "confirmations"; readonly confirmations: number };

/** Finality required before evidence counts (ADR-0012 Tier A). Bitcoin: 2 conf ≥ USD 1k, else 1. */
export function finalityRule(caip2: string, amountUsdMicros = 0n): FinalityRule {
  const c = requireChain(caip2);
  switch (c.family) {
    case "evm":
    case "solana":
      return { kind: "block_tag", tag: "finalized" };
    case "near":
      return { kind: "near_final" };
    case "bitcoin":
      return { kind: "confirmations", confirmations: amountUsdMicros >= 1_000_000_000n ? 2 : 1 };
  }
}

export function explorerTxUrl(caip2: string, tx: string): string {
  return requireChain(caip2).explorer.tx.replace("{tx}", encodeURIComponent(tx));
}

export function explorerAddressUrl(caip2: string, address: string): string {
  return requireChain(caip2).explorer.address.replace("{address}", encodeURIComponent(address));
}

// ---------------------------------------------------------------------------------------------
// Destination keys and fingerprints
// ---------------------------------------------------------------------------------------------

/** `chain|address_norm|asset_id` — the key rails uses for tags, watchers and minimums. */
export function destinationKey(caip2: string, addressNorm: string, assetId: string): string {
  for (const part of [caip2, addressNorm, assetId]) {
    if (part.includes("|")) throw new RangeError("destination key parts must not contain '|'");
  }
  return `${caip2}|${addressNorm}|${assetId}`;
}

const CROCKFORD_UPPER = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Fingerprint shown by checkout and the dashboard (sentinel LLD §5): first 10 symbols of
 * upper-case Crockford base32 (MSB-first) of sha256(UTF-8 `chain|address_norm|asset_id`), 4-4-2.
 */
export function destinationFingerprint(caip2: string, addressNorm: string, assetId: string): string {
  const h = sha256(new TextEncoder().encode(destinationKey(caip2, addressNorm, assetId)));
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const byte of h) {
    acc = ((acc << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5 && out.length < 10) {
      out += CROCKFORD_UPPER[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length === 10) break;
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}
