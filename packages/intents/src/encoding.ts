/** Byte encodings used by the Verifier: NEP-413 borsh payload hash and ERC-191 personal_sign hash. */
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const enc = new TextEncoder();

/** NEP-413 tag: 2^31 + 413 (u32 little-endian prefix). */
export const NEP413_TAG = 2 ** 31 + 413;

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** sha256(borsh(u32 tag) ‖ borsh({message: string, nonce: [u8;32], recipient: string, callback_url: Option<string>})). */
export function nep413Hash(
  message: string,
  nonce: Uint8Array,
  recipient: string,
  callbackUrl: string | null = null,
): Uint8Array {
  if (nonce.length !== 32) throw new RangeError("NEP-413 nonce must be 32 bytes");
  const m = enc.encode(message);
  const r = enc.encode(recipient);
  const cb =
    callbackUrl === null
      ? [new Uint8Array([0])]
      : [new Uint8Array([1]), u32(enc.encode(callbackUrl).length), enc.encode(callbackUrl)];
  return sha256(concat([u32(NEP413_TAG), u32(m.length), m, nonce, u32(r.length), r, ...cb]));
}

/** keccak256("\x19Ethereum Signed Message:\n" + byteLength + payload). */
export function erc191Hash(payload: string): Uint8Array {
  const bytes = enc.encode(payload);
  return keccak_256(concat([enc.encode(`\x19Ethereum Signed Message:\n${bytes.length}`), bytes]));
}

export const utf8 = (s: string): Uint8Array => enc.encode(s);
export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export function fromHex(s: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(s)) throw new RangeError("invalid hex");
  return Uint8Array.from(s.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
}
export const toBase64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
export function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
