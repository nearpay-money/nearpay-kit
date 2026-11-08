/**
 * Modal layer stack. Every open `Modal` registers here, so nested dialogs stack in open order and
 * a step-up (re-authentication) dialog always sits above every other open modal. Only the top
 * layer handles Escape and traps Tab; the page scroll stays locked until the last layer closes.
 *
 * The z-index is applied through the CSSOM custom property `--np-layer` (CSP-safe — no inline
 * style attribute in the markup); the CSS turns it into `z-index`.
 */

export type LayerPriority = "default" | "step-up";

interface Layer {
  readonly id: number;
  readonly priority: LayerPriority;
}

const layers: Layer[] = [];
let nextId = 1;
/** Step-up layers sit this many levels above default layers. */
const STEP_UP_OFFSET = 50;

function rank(l: Layer): number {
  return (l.priority === "step-up" ? STEP_UP_OFFSET : 0) + layers.indexOf(l);
}

function syncScrollLock(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("np-scroll-locked", layers.length > 0);
}

export interface LayerHandle {
  readonly id: number;
  /** Stack level (0 = lowest); step-up layers are offset above every default layer. */
  level(): number;
  /** True when this is the topmost open layer (the one that handles keys). */
  isTop(): boolean;
  release(): void;
}

/** Registers an open layer. Call `release()` when it closes. */
export function pushLayer(priority: LayerPriority = "default"): LayerHandle {
  const layer: Layer = { id: nextId++, priority };
  layers.push(layer);
  syncScrollLock();
  return {
    id: layer.id,
    level: () => rank(layer),
    isTop: () => topLayerId() === layer.id,
    release: () => {
      const i = layers.indexOf(layer);
      if (i !== -1) layers.splice(i, 1);
      syncScrollLock();
    },
  };
}

/** Id of the topmost layer, or undefined when no modal is open. */
export function topLayerId(): number | undefined {
  let top: Layer | undefined;
  for (const l of layers) if (!top || rank(l) >= rank(top)) top = l;
  return top?.id;
}

/** Number of open modal layers. */
export function openLayerCount(): number {
  return layers.length;
}
