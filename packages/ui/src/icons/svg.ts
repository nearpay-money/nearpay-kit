/**
 * Icons as plain SVG strings — React-free, for Astro/static pages and server templates:
 *
 *   import { iconSvg } from "@nearpay-internal/ui/icons-svg";
 *   <Fragment set:html={iconSvg("check", { size: 16 })} />
 *
 * Same geometry and attributes as the React icons; decorative (`aria-hidden`) unless a `title`
 * is given. No inline styles (CSP-safe).
 */
import { ICON_SHAPES, type IconShape, type IconShapeName } from "./shapes.js";

export { ICON_SHAPES, type IconShape, type IconShapeName } from "./shapes.js";

export interface IconSvgOptions {
  /** Pixel size (width = height). Default 20 (12 for `caret-down`). */
  size?: number;
  /** Accessible name; when omitted the icon is hidden from assistive technology. */
  title?: string;
  /** Extra classes after `np-icon`. */
  className?: string;
  /** Id for the `<title>` element (default: a generated `np-icon-<n>`). */
  titleId?: string;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] as string);
let seq = 0;

function attrs(map: Record<string, string | number>): string {
  return Object.entries(map)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join("");
}

/** Renders one icon shape to an SVG string. */
export function shapeToSvg(shape: IconShape, o: IconSvgOptions = {}): string {
  const size = o.size ?? shape.size ?? 20;
  const paint: Record<string, string | number> = shape.filled
    ? { fill: "currentColor" }
    : {
        fill: "none",
        stroke: "currentColor",
        "stroke-width": shape.strokeWidth ?? 1.75,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      };
  const titleId = o.title ? (o.titleId ?? `np-icon-${++seq}`) : undefined;
  const a11y: Record<string, string> = titleId
    ? { role: "img", "aria-labelledby": titleId }
    : { "aria-hidden": "true" };
  const body = shape.nodes.map(([tag, a]) => `<${tag}${attrs(a)}/>`).join("");
  return `<svg${attrs({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    ...paint,
    focusable: "false",
    class: o.className ? `np-icon ${o.className}` : "np-icon",
    ...a11y,
  })}>${titleId ? `<title id="${esc(titleId)}">${esc(o.title as string)}</title>` : ""}${body}</svg>`;
}

/** Renders a named icon to an SVG string. */
export function iconSvg(name: IconShapeName, o: IconSvgOptions = {}): string {
  const shape = ICON_SHAPES[name];
  if (!shape) throw new RangeError(`unknown icon: ${String(name)}`);
  return shapeToSvg(shape, o);
}

/** Names of every icon available as a string. */
export const ICON_NAMES = Object.keys(ICON_SHAPES) as IconShapeName[];
