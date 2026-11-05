/**
 * Envelope encryption (AES-256-GCM) for data at rest that may hold secrets or PII: idempotent
 * responses (L-F-03, they can carry `client_secret`), PII columns (`NP_PII_KEK_FILE`).
 * Each value gets a fresh data key wrapped by the key-encryption key (KEK).
 *
 * Layout v1: 0x01 ‖ wrapIv(12) ‖ wrappedDek(32) ‖ wrapTag(16) ‖ iv(12) ‖ tag(16) ‖ ciphertext
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

export interface EnvelopeCipher {
  encrypt(plaintext: Buffer | string, aad?: string): Buffer;
  decrypt(blob: Buffer, aad?: string): Buffer;
}

/** Reads a 32-byte KEK file containing base64 (44 chars) or hex (64 chars). */
export function loadKek(path: string): Buffer {
  return parseKek(readFileSync(path, "utf8").trim());
}

export function parseKek(text: string): Buffer {
  const k = /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, "hex") : Buffer.from(text, "base64");
  if (k.length !== 32) throw new Error("KEK must be 32 bytes (base64 or hex)");
  return k;
}

function seal(key: Buffer, data: Buffer, aad: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return { iv, tag: c.getAuthTag(), ct };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

export function createEnvelopeCipher(kek: Buffer): EnvelopeCipher {
  if (kek.length !== 32) throw new Error("KEK must be 32 bytes");
  return {
    encrypt(plaintext, aad = "") {
      const a = Buffer.from(aad, "utf8");
      const dek = randomBytes(32);
      const wrapped = seal(kek, dek, a);
      const body = seal(dek, Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf8"), a);
      return Buffer.concat([Buffer.from([1]), wrapped.iv, wrapped.ct, wrapped.tag, body.iv, body.tag, body.ct]);
    },
    decrypt(blob, aad = "") {
      if (blob.length < 1 + 12 + 32 + 16 + 12 + 16 || blob[0] !== 1) throw new Error("unsupported envelope");
      const a = Buffer.from(aad, "utf8");
      let o = 1;
      const take = (n: number) => {
        const part = blob.subarray(o, o + n);
        o += n;
        return part;
      };
      const wIv = take(12);
      const wCt = take(32);
      const wTag = take(16);
      const iv = take(12);
      const tag = take(16);
      const ct = blob.subarray(o);
      const dek = open(kek, wIv, wTag, wCt, a);
      return open(dek, iv, tag, ct, a);
    },
  };
}
