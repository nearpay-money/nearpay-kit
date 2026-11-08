/**
 * Icon geometry (24 × 24 grid) shared by the React components (`icons/index.tsx`) and the plain
 * SVG strings (`icons/svg.ts`, React-free). Stroke icons use a 1.75 px round stroke; `filled`
 * icons are painted with `fill="currentColor"`.
 */

export type IconElement = "path" | "circle" | "rect";
export type IconNode = readonly [IconElement, Readonly<Record<string, string>>];

export interface IconShape {
  readonly nodes: readonly IconNode[];
  /** Filled glyph (no stroke). */
  readonly filled?: boolean;
  /** Default pixel size when none is given (20 unless set). */
  readonly size?: number;
}

const p = (d: string): IconNode => ["path", { d }];

export const ARROW_LEFT: IconShape = { nodes: [p("M19 12H5M11 6l-6 6 6 6")] };
export const ARROW_RIGHT: IconShape = { nodes: [p("M5 12h14M13 6l6 6-6 6")] };
export const CHECK: IconShape = { nodes: [p("M4.5 12.5l5 5 10-11")] };
export const CLOCK: IconShape = { nodes: [["circle", { cx: "12", cy: "12", r: "8.5" }], p("M12 7.5V12l3 2")] };
export const SHIELD_CHECK: IconShape = {
  nodes: [p("M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6l7-3z"), p("M8.75 12.25l2.25 2.25 4.25-4.5")],
};
export const WALLET: IconShape = {
  nodes: [
    p("M4 7.5A2.5 2.5 0 016.5 5H18v3"),
    ["rect", { x: "4", y: "8", width: "16", height: "11", rx: "2" }],
    p("M16 13.5h1.5"),
  ],
};
export const SEARCH: IconShape = { nodes: [["circle", { cx: "11", cy: "11", r: "6.5" }], p("M20 20l-4.25-4.25")] };
export const CHEVRON_DOWN: IconShape = { nodes: [p("M7 10l5 5 5-5")] };
export const CHEVRON_RIGHT: IconShape = { nodes: [p("M10 7l5 5-5 5")] };
export const COPY: IconShape = {
  nodes: [
    ["rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }],
    p("M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3"),
  ],
};
export const EXTERNAL_LINK: IconShape = { nodes: [p("M8 16L16.5 7.5M9.5 7.5h7v7")] };
export const CARD: IconShape = {
  nodes: [["rect", { x: "3.5", y: "5.5", width: "17", height: "13", rx: "1.5" }], p("M3.5 10h17M7 14.5h4")],
};
export const BELL: IconShape = { nodes: [p("M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 1.5H5l1.5-1.5z"), p("M10 20.5h4")] };
export const MENU: IconShape = { nodes: [p("M4 7h16M4 12h16M4 17h16")] };
export const INFO: IconShape = { nodes: [["circle", { cx: "12", cy: "12", r: "8.5" }], p("M12 11v5M12 8h.01")] };
export const WARNING: IconShape = {
  nodes: [
    p("M10.3 4.6L3.1 17.2A2 2 0 004.8 20h14.4a2 2 0 001.7-2.8L13.7 4.6a2 2 0 00-3.4 0z"),
    p("M12 9.5v4M12 16.75h.01"),
  ],
};
export const CLOSE: IconShape = { nodes: [p("M6 6l12 12M18 6L6 18")] };
export const REFRESH: IconShape = { nodes: [p("M19.5 12a7.5 7.5 0 11-2.2-5.3"), p("M19.5 4.5v4h-4")] };
export const LOG_OUT: IconShape = {
  nodes: [p("M14 4.5H7a2 2 0 00-2 2v11a2 2 0 002 2h7"), p("M11 12h9M16.5 8.5L20 12l-3.5 3.5")],
};
export const MORE: IconShape = { nodes: [p("M6 12h.01M12 12h.01M18 12h.01")] };
export const CARET_DOWN: IconShape = { nodes: [p("M7 9.5h10l-5 6z")], filled: true, size: 12 };
export const NEARPAY_MARK: IconShape = {
  filled: true,
  nodes: [
    p(
      "M3 4.5A1.5 1.5 0 014.5 3h2.2c.5 0 1 .26 1.27.7L15 15.2V4.5A1.5 1.5 0 0116.5 3h3A1.5 1.5 0 0121 4.5v15a1.5 1.5 0 01-1.5 1.5h-2.2c-.5 0-1-.26-1.27-.7L9 8.8v10.7A1.5 1.5 0 017.5 21h-3A1.5 1.5 0 013 19.5v-15z",
    ),
  ],
};

/** Every icon by kebab-case name (`nearpay-mark` included). */
export const ICON_SHAPES = {
  "arrow-left": ARROW_LEFT,
  "arrow-right": ARROW_RIGHT,
  check: CHECK,
  clock: CLOCK,
  "shield-check": SHIELD_CHECK,
  wallet: WALLET,
  search: SEARCH,
  "chevron-down": CHEVRON_DOWN,
  "chevron-right": CHEVRON_RIGHT,
  copy: COPY,
  "external-link": EXTERNAL_LINK,
  card: CARD,
  bell: BELL,
  menu: MENU,
  info: INFO,
  warning: WARNING,
  close: CLOSE,
  refresh: REFRESH,
  "log-out": LOG_OUT,
  more: MORE,
  "caret-down": CARET_DOWN,
  "nearpay-mark": NEARPAY_MARK,
} as const satisfies Record<string, IconShape>;

export type IconShapeName = keyof typeof ICON_SHAPES;
