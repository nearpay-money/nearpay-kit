/* Minimal typings for the brand build script's dev-only dependencies (they ship none). */

declare module "wawoff2" {
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
}

declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "Q" | "C" | "Z";
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Glyph {
    index: number;
    advanceWidth?: number;
    path: { commands: PathCommand[] };
  }
  export interface Font {
    unitsPerEm: number;
    charToGlyph(char: string): Glyph;
    variation?: { getTransform(glyph: Glyph, coords: Record<string, number>): Glyph };
  }
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
