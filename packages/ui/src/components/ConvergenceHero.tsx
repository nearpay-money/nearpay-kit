import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cx } from "../cx.js";

/** Route geometry (viewBox 600 × 560): five curves converging on the settlement point. */
export const CONVERGENCE_ROUTES = [
  "M70 92 C 250 92, 300 300, 452 300",
  "M70 196 C 260 196, 290 300, 452 300",
  "M70 300 L 452 300",
  "M70 404 C 260 404, 290 300, 452 300",
  "M70 508 C 250 508, 300 300, 452 300",
] as const;

export const CONVERGENCE_DEFAULT_LABELS = ["USDC on Base", "SOL on Solana", "ETH on Arbitrum", "BTC", "NEAR"] as const;

/** Travel time of one payment along its route, and the arrival pulse offset (ms). */
const TRAVEL_MS = 1500;
const ARRIVE_MS = 1450;

export interface ConvergenceHeroProps {
  /** Labels at the start of each route, top to bottom (up to five). */
  labels?: readonly string[];
  /** Floating card near the settlement point (e.g. "Payment received · $49.00 · Paid"); rendered light. */
  card?: ReactNode;
  /** Time between payments, ms. Default 2400. */
  interval?: number;
  /** Start the animation (default true). Never animates under `prefers-reduced-motion: reduce`. */
  autoPlay?: boolean;
  /** Random source (0 ≤ n < 1), for tests. Default `Math.random`. */
  random?: () => number;
  /** Text alternative for the picture (visually hidden). */
  description?: string;
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  // Assume reduced motion until the media query has been read on the client (SSR-safe, no flash of motion).
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setReduced(false);
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

type Animation = SVGElement & { beginElement?: () => void };

function begin(el: Animation | null | undefined) {
  try {
    if (el && typeof el.beginElement === "function") el.beginElement();
  } catch {
    /* SMIL unsupported: the static picture stays */
  }
}

/**
 * Landing-page hero: payment routes from several chains converging into one settlement point on a
 * navy panel. Every ~2.4 s a glowing dot travels one randomly chosen route (never the same twice
 * in a row) and the settlement point pulses on arrival. SMIL (`animateMotion` + `beginElement`),
 * no dependencies, no inline styles (CSP-safe); static under `prefers-reduced-motion`.
 */
export function ConvergenceHero({
  labels = CONVERGENCE_DEFAULT_LABELS,
  card,
  interval = 2400,
  autoPlay = true,
  random = Math.random,
  description = "Payments from many chains travel along their own routes and settle in one place: your wallet.",
  className,
}: ConvergenceHeroProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduced = usePrefersReducedMotion();
  const motion = useRef<Array<Animation | null>>([]);
  const fade = useRef<Array<Animation | null>>([]);
  const pulse = useRef<Array<Animation | null>>([]);
  const randomRef = useRef(random);
  randomRef.current = random;
  const count = CONVERGENCE_ROUTES.length;

  useEffect(() => {
    if (!autoPlay || reduced) return;
    let last = -1;
    let arrive: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const rnd = randomRef.current;
      let i = Math.floor(rnd() * count) % count;
      if (i === last) i = (i + 1 + Math.floor(rnd() * (count - 1))) % count;
      last = i;
      begin(motion.current[i]);
      begin(fade.current[i]);
      clearTimeout(arrive);
      arrive = setTimeout(() => {
        for (const el of pulse.current) begin(el);
      }, ARRIVE_MS);
    };
    const start = setTimeout(fire, 600);
    const timer = setInterval(fire, interval);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      clearTimeout(arrive);
    };
  }, [autoPlay, reduced, interval]);

  const dur = `${TRAVEL_MS / 1000}s`;
  return (
    <figure className={cx("np-convergence", className)} data-motion={autoPlay && !reduced ? "on" : "off"}>
      <svg className="np-convergence__svg" viewBox="0 0 600 560" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${uid}-rt`} x1="0" x2="1">
            <stop offset="0" stopColor="#5B5BD6" stopOpacity="0.15" />
            <stop offset="1" stopColor="#8EF0D3" />
          </linearGradient>
          <filter id={`${uid}-glow`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {CONVERGENCE_ROUTES.map((d, i) => (
          <path
            key={d}
            id={`${uid}-r${i}`}
            className="np-convergence__route"
            d={d}
            fill="none"
            stroke={`url(#${uid}-rt)`}
            strokeWidth="2.5"
          />
        ))}
        {CONVERGENCE_ROUTES.map((d, i) => (
          <circle key={d} className="np-convergence__dot" r="5" fill="#E9FFF8" filter={`url(#${uid}-glow)`} opacity="0">
            <animateMotion
              ref={(el) => {
                motion.current[i] = el;
              }}
              begin="indefinite"
              dur={dur}
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.45 0 0.2 1"
              fill="remove"
            >
              <mpath href={`#${uid}-r${i}`} />
            </animateMotion>
            <animate
              ref={(el) => {
                fade.current[i] = el;
              }}
              attributeName="opacity"
              begin="indefinite"
              dur={dur}
              values="0;1;1;0"
              keyTimes="0;0.1;0.92;1"
              fill="remove"
            />
          </circle>
        ))}
        <circle cx="452" cy="300" r="22" fill="none" stroke="#8EF0D3" strokeOpacity="0.35" strokeWidth="2" />
        <circle
          className="np-convergence__pulse"
          cx="452"
          cy="300"
          r="22"
          fill="none"
          stroke="#8EF0D3"
          strokeWidth="2"
          opacity="0"
        >
          <animate
            ref={(el) => {
              pulse.current[0] = el;
            }}
            attributeName="r"
            begin="indefinite"
            dur="0.7s"
            values="12;40"
            fill="remove"
          />
          <animate
            ref={(el) => {
              pulse.current[1] = el;
            }}
            attributeName="opacity"
            begin="indefinite"
            dur="0.7s"
            values="0.9;0"
            fill="remove"
          />
        </circle>
        <circle cx="452" cy="300" r="10" fill="#8EF0D3" filter={`url(#${uid}-glow)`}>
          <animate
            ref={(el) => {
              pulse.current[2] = el;
            }}
            attributeName="r"
            begin="indefinite"
            dur="0.5s"
            values="10;14;10"
            fill="remove"
          />
        </circle>
      </svg>
      <ul className="np-convergence__labels">
        {labels.slice(0, count).map((label, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: labels are positional (route i)
          <li key={`${i}-${label}`} className={`np-convergence__label np-convergence__label--${i}`}>
            {label}
          </li>
        ))}
      </ul>
      {card ? (
        <div className="np-convergence__card np-root" data-theme="light">
          {card}
        </div>
      ) : null}
      <figcaption className="np-sr-only">{description}</figcaption>
    </figure>
  );
}
