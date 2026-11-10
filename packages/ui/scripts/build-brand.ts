#!/usr/bin/env -S npx tsx
/**
 * Builds the NearPay brand assets (committed outputs; rerun after changing src/brand.ts):
 *
 *   pnpm --filter @nearpay-internal/ui brand
 *
 * 1. `src/brand-wordmark.ts` — "NearPay" outlined from Instrument Sans (OFL) at weight 650: the
 *    variable font from @fontsource-variable/instrument-sans is decompressed (wawoff2), instanced at
 *    wght 650 (opentype.js gvar/HVAR) and kerned with the font's own GPOS pair table.
 * 2. `brand/` — SVG files from the same functions the package exports (`markSvg`, `logoSvg`,
 *    `faviconSvg`), PNG renders (resvg; every text is converted to outlines first, so the render
 *    embeds the font instead of relying on system fonts), and favicon.ico (PNG-in-ICO, 16/32/48).
 *
 * Deterministic: the same inputs give byte-identical files.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import opentype, { type Font, type PathCommand } from "opentype.js";
import { decompress } from "wawoff2";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(pkg, "package.json"));
const WEIGHT = 650;

/* ------------------------------------------------------------------------------------------ */
/* Font: variable woff2 → TrueType → instance at wght 650                                       */
/* ------------------------------------------------------------------------------------------ */

const woff2 = readFileSync(
  require.resolve("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2"),
);
const ttf = Buffer.from(await decompress(woff2));
const font: Font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength) as ArrayBuffer);
if (font.unitsPerEm !== 1000) throw new Error(`unexpected unitsPerEm ${font.unitsPerEm}`);

/** GPOS pair kerning (lookup types 2 and 9 → 2, formats 1 and 2), read straight from the TrueType bytes. */
function readKerning(buf: Buffer): (left: number, right: number) => number {
  const u16 = (o: number) => buf.readUInt16BE(o);
  const i16 = (o: number) => buf.readInt16BE(o);
  const u32 = (o: number) => buf.readUInt32BE(o);
  let gpos = -1;
  for (let i = 0, n = u16(4); i < n; i++) {
    const rec = 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === "GPOS") gpos = u32(rec + 8);
  }
  if (gpos < 0) return () => 0;
  const featureList = gpos + u16(gpos + 6);
  const lookupList = gpos + u16(gpos + 8);
  const kernLookups = new Set<number>();
  for (let i = 0, n = u16(featureList); i < n; i++) {
    const rec = featureList + 2 + i * 6;
    if (buf.toString("latin1", rec, rec + 4) !== "kern") continue;
    const feature = featureList + u16(rec + 4);
    for (let j = 0, m = u16(feature + 2); j < m; j++) kernLookups.add(u16(feature + 4 + j * 2));
  }
  const coverageIndex = (cov: number, gid: number): number => {
    if (u16(cov) === 1) {
      for (let i = 0, n = u16(cov + 2); i < n; i++) if (u16(cov + 4 + i * 2) === gid) return i;
      return -1;
    }
    for (let i = 0, n = u16(cov + 2); i < n; i++) {
      const r = cov + 4 + i * 6;
      if (gid >= u16(r) && gid <= u16(r + 2)) return u16(r + 4) + gid - u16(r);
    }
    return -1;
  };
  const classOf = (cd: number, gid: number): number => {
    if (u16(cd) === 1) {
      const start = u16(cd + 2);
      return gid >= start && gid < start + u16(cd + 4) ? u16(cd + 6 + (gid - start) * 2) : 0;
    }
    for (let i = 0, n = u16(cd + 2); i < n; i++) {
      const r = cd + 4 + i * 6;
      if (gid >= u16(r) && gid <= u16(r + 2)) return u16(r + 4);
    }
    return 0;
  };
  const valueSize = (fmt: number) => {
    let n = 0;
    for (let b = fmt; b; b >>= 1) n += b & 1;
    return n * 2;
  };
  /** XAdvance of a value record, or 0. */
  const xAdvance = (rec: number, fmt: number) => {
    if (!(fmt & 0x4)) return 0;
    let off = 0;
    if (fmt & 0x1) off += 2;
    if (fmt & 0x2) off += 2;
    return i16(rec + off);
  };
  const subtables: number[] = [];
  for (const li of [...kernLookups].sort((a, b) => a - b)) {
    const lookup = lookupList + u16(lookupList + 2 + li * 2);
    const type = u16(lookup);
    for (let s = 0, n = u16(lookup + 4); s < n; s++) {
      const st = lookup + u16(lookup + 6 + s * 2);
      if (type === 2) subtables.push(st);
      else if (type === 9 && u16(st + 2) === 2) subtables.push(st + u32(st + 4));
    }
  }
  return (left, right) => {
    for (const st of subtables) {
      const ci = coverageIndex(st + u16(st + 2), left);
      if (ci < 0) continue;
      const vf1 = u16(st + 4);
      const vf2 = u16(st + 6);
      if (u16(st) === 1) {
        const set = st + u16(st + 10 + ci * 2);
        const recSize = 2 + valueSize(vf1) + valueSize(vf2);
        for (let i = 0, n = u16(set); i < n; i++) {
          const r = set + 2 + i * recSize;
          if (u16(r) === right) return xAdvance(r + 2, vf1);
        }
        continue; // a format-1 miss falls through to later subtables
      }
      const c1 = classOf(st + u16(st + 8), left);
      const c2 = classOf(st + u16(st + 10), right);
      const class2Count = u16(st + 14);
      const recSize = valueSize(vf1) + valueSize(vf2);
      return xAdvance(st + 16 + (c1 * class2Count + c2) * recSize, vf1);
    }
    return 0;
  };
}

const kern = readKerning(ttf);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Glyph outline at wght 650 as SVG path data in font units, y pointing down, baseline at 0. */
function glyphAt(char: string): { gid: number; d: string; advance: number } {
  const base = font.charToGlyph(char);
  const g = font.variation ? font.variation.getTransform(base, { wght: WEIGHT }) : base;
  const pt = (x?: number, y?: number) => `${r1(x ?? 0)} ${r1(-(y ?? 0))}`;
  const d = g.path.commands
    .map((c: PathCommand) => {
      switch (c.type) {
        case "M":
          return `M${pt(c.x, c.y)}`;
        case "L":
          return `L${pt(c.x, c.y)}`;
        case "Q":
          return `Q${pt(c.x1, c.y1)} ${pt(c.x, c.y)}`;
        case "C":
          return `C${pt(c.x1, c.y1)} ${pt(c.x2, c.y2)} ${pt(c.x, c.y)}`;
        default:
          return "Z";
      }
    })
    .join("");
  return { gid: base.index, d, advance: g.advanceWidth ?? 0 };
}

/** Lays out a line: per-glyph path data (1000 units/em) and advances in em including kerning. */
function layout(text: string) {
  const glyphs = [...text].map(glyphAt);
  return glyphs.map((g, i) => {
    const next = glyphs[i + 1];
    const k = next ? kern(g.gid, next.gid) : 0;
    return { char: text[i] ?? "", d: g.d, advance: (g.advance + k) / 1000 };
  });
}

/** A whole line as one `<g>` (font size `size` px, tracking em, baseline at y). */
function textSvg(text: string, x: number, y: number, size: number, tracking: number, fill: string) {
  let pen = 0;
  const parts = layout(text).map((g) => {
    const p = g.d ? `<path transform="translate(${r1(pen * 1000)} 0)" d="${g.d}"/>` : "";
    pen += g.advance + tracking;
    return p;
  });
  return `<g fill="${fill}" transform="translate(${x} ${y}) scale(${size / 1000})">${parts.join("")}</g>`;
}

/* ------------------------------------------------------------------------------------------ */
/* 1. Wordmark module                                                                           */
/* ------------------------------------------------------------------------------------------ */

const wordmark = layout("NearPay");
const wordmarkTs = `/**
 * GENERATED by scripts/build-brand.ts — do not edit by hand.
 *
 * "NearPay" in Instrument Sans (OFL-1.1, The Instrument Sans Project Authors) at weight ${WEIGHT},
 * outlined. Path data is in font units (1000 per em, y down, baseline at 0); \`advance\` is in em and
 * includes the font's kerning to the next letter (tracking is added by the caller).
 */
export interface WordmarkGlyph {
  readonly char: string;
  readonly d: string;
  readonly advance: number;
}

export const WORDMARK = {
  font: "Instrument Sans",
  weight: ${WEIGHT},
  /** Cap height in em (OS/2 sCapHeight). */
  capHeight: 0.72,
  glyphs: [
${wordmark
  .map(
    (g) =>
      `    {\n      char: ${JSON.stringify(g.char)},\n      advance: ${g.advance},\n      d: ${JSON.stringify(g.d)},\n    },`,
  )
  .join("\n")}
  ] as readonly WordmarkGlyph[],
} as const;
`;
writeFileSync(join(pkg, "src", "brand-wordmark.ts"), wordmarkTs);

/* ------------------------------------------------------------------------------------------ */
/* 2. Brand files                                                                               */
/* ------------------------------------------------------------------------------------------ */

const brand = await import("../src/brand.js");
const out = join(pkg, "brand");
mkdirSync(out, { recursive: true });
const write = (name: string, data: string | Buffer) => {
  writeFileSync(join(out, name), data);
  console.log(`  brand/${name}`);
};

const png = (svg: string, width: number) =>
  Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng(),
  );

write("mark-light.svg", `${brand.markSvg({ variant: "light", size: 48, title: "NearPay" })}\n`);
write("mark-dark.svg", `${brand.markSvg({ variant: "dark", size: 48, title: "NearPay" })}\n`);
write("mark-mono.svg", `${brand.markSvg({ variant: "mono", size: 48, title: "NearPay" })}\n`);
write("app-icon.svg", `${brand.markSvg({ variant: "app-icon", size: 64, title: "NearPay" })}\n`);
write("logo-light.svg", `${brand.logoSvg({ variant: "light", height: 48, title: "NearPay" })}\n`);
write("logo-dark.svg", `${brand.logoSvg({ variant: "dark", height: 48, title: "NearPay" })}\n`);
write("favicon.svg", `${brand.faviconSvg()}\n`);

const tile = (body: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}">${body}</svg>`;

// Raster icons. Tab icons (ICO) use the tile with the ≤ 32 px weights so they read on light and
// dark browser chrome alike; touch / PWA icons use the app-icon tile.
const favTile = tile(brand.appIconBody({ shape: "rounded", favicon: true }), 48);
const icoSizes = [16, 32, 48];
const icoImages = icoSizes.map((s) => png(favTile, s));
write("favicon.ico", ico(icoImages, icoSizes));
write("apple-touch-icon.png", png(tile(brand.appIconBody({ shape: "square" }), 180), 180));
write("icon-192.png", png(tile(brand.appIconBody({ shape: "rounded" }), 192), 192));
write("icon-512.png", png(tile(brand.appIconBody({ shape: "rounded" }), 512), 512));
write("icon-maskable-512.png", png(tile(brand.appIconBody({ shape: "maskable" }), 512), 512));
write("og-image.png", png(ogImage(), 1200));

/** PNG-in-ICO container (Vista+ format; every browser reads it). */
function ico(images: Buffer[], sizes: number[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    const s = sizes[i] ?? 0;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.length;
  });
  return Buffer.concat([header, ...images]);
}

/** 1200 × 630 social card: navy, logo, the positioning line, converging routes. */
function ogImage(): string {
  const W = 1200;
  const H = 630;
  const left = 88;
  const c = brand.BRAND_COLORS;
  // Routes from the landing hero (viewBox 600 × 560), scaled into the top-right corner.
  const routes = [
    "M70 92 C 250 92, 300 300, 452 300",
    "M70 196 C 260 196, 290 300, 452 300",
    "M70 300 L 452 300",
    "M70 404 C 260 404, 290 300, 452 300",
    "M70 508 C 250 508, 300 300, 452 300",
  ];
  const logo = brand
    .logoSvg({ variant: "dark", height: 56, xmlns: false })
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  const logoScale = 56 / 48;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><linearGradient id="rt" x1="0" x2="1"><stop offset="0" stop-color="#5B5BD6" stop-opacity="0.15"/><stop offset="1" stop-color="#8EF0D3"/></linearGradient>`,
    `<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`,
    `<rect width="${W}" height="${H}" fill="${c.navy}"/>`,
    `<g transform="translate(812 8) scale(0.7)">`,
    ...routes.map((d) => `<path d="${d}" fill="none" stroke="url(#rt)" stroke-width="3"/>`),
    `<circle cx="452" cy="300" r="22" fill="none" stroke="#8EF0D3" stroke-opacity="0.35" stroke-width="2"/>`,
    `<circle cx="452" cy="300" r="10" fill="#8EF0D3" filter="url(#glow)"/>`,
    `</g>`,
    `<g transform="translate(${left} 80) scale(${logoScale})">${logo}</g>`,
    textSvg("Get paid from any chain.", left, 404, 72, -0.04, "#FFFFFF"),
    textSvg("Settle where you choose.", left, 486, 72, -0.04, "#FFFFFF"),
    textSvg("nearpay.money", left, 556, 26, -0.01, "#A9BBCF"),
    `</svg>`,
  ].join("");
}
