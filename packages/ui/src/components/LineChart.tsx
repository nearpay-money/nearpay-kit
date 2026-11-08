import { type KeyboardEvent, type PointerEvent, useId, useMemo, useRef, useState } from "react";
import { cx } from "../cx.js";
import { formatMoney } from "../money.js";

export interface LineSeries {
  id: string;
  /** Legend / tooltip name. */
  label: string;
  /** One value per x label: base-unit integers (bigint or integer string, INV-5). `null` = gap. */
  values: readonly (bigint | string | null)[];
}

export interface LineChartProps {
  /** Accessible name and table caption ("Payment volume, 1–7 Nov 2026"). */
  label: string;
  /** X-axis category labels ("1 Nov" …), one per value. */
  labels: readonly string[];
  /** 1–4 series; colours follow series order (validated categorical palette, never cycled). */
  series: readonly LineSeries[];
  /** Exponent of the values (USD cents 2, USDC 6). */
  decimals: number;
  /** Currency/asset symbol for axis and tooltip text. */
  symbol?: string;
  /** Custom value formatter (receives the base-unit bigint). */
  formatValue?: (value: bigint) => string;
  /** Y range starts at zero (default) or at the data minimum. */
  baseline?: "zero" | "data";
  /** Plot height: `sm` 120 px, `md` 200 px (default). */
  size?: "sm" | "md";
  className?: string;
  "data-testid"?: string;
}

const W = 1000;
const MAX_SERIES = 4;
const SCALE = 1_000_000n;

const toBig = (v: bigint | string): bigint => {
  if (typeof v === "bigint") return v;
  if (!/^-?[0-9]+$/.test(v)) throw new TypeError(`LineChart: values must be integers, got "${v}"`);
  return BigInt(v);
};

const absBig = (v: bigint) => (v < 0n ? -v : v);

/** A "nice" tick step ≥ raw (1, 2 or 5 × 10^k), all in bigint. */
function niceStep(raw: bigint): bigint {
  if (raw <= 1n) return 1n;
  let mag = 1n;
  while (mag * 10n <= raw) mag *= 10n;
  for (const m of [1n, 2n, 5n, 10n]) if (m * mag >= raw) return m * mag;
  return 10n * mag;
}

/** Fraction of `v` within [lo, hi] as a JS number in 0…1 — display only; the data stay bigint. */
function frac(v: bigint, lo: bigint, hi: bigint): number {
  if (hi === lo) return 0.5;
  return Number(((v - lo) * SCALE) / (hi - lo)) / Number(SCALE);
}

/**
 * Small dependency-free SVG line chart for money over time. Values stay integers (bigint) for the
 * scale and the labels; they become pixel positions only for drawing. Hover/focus shows a
 * crosshair with every series' value at that point (←/→ step through points); a visually hidden
 * table carries every value for assistive technology.
 */
export function LineChart({
  label,
  labels,
  series,
  decimals,
  symbol,
  formatValue,
  baseline = "zero",
  size = "md",
  className,
  "data-testid": testId,
}: LineChartProps) {
  if (series.length > MAX_SERIES)
    throw new RangeError(`LineChart: at most ${MAX_SERIES} series (got ${series.length})`);
  const auto = useId();
  const tableId = `np-lc${auto}-table`;
  const H = size === "sm" ? 120 : 200;
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLElement>(null);
  const n = labels.length;

  const fmt = useMemo<(v: bigint, maxFraction?: number) => string>(
    () =>
      formatValue
        ? (v) => formatValue(v)
        : (v, maxFraction) =>
            formatMoney({
              amount: v,
              decimals,
              symbol,
              ...(maxFraction === undefined ? {} : { maxFraction, minFraction: 0 }),
            }),
    [formatValue, decimals, symbol],
  );

  const model = useMemo(() => {
    const data = series.map((s) => s.values.map((v) => (v === null || v === undefined ? null : toBig(v))));
    const all = data.flat().filter((v): v is bigint => v !== null);
    // bigint extremes (Math.min/max do not accept bigint)
    let lo = all[0] ?? 0n;
    let hi = all[0] ?? 0n;
    for (const v of all) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (baseline === "zero") {
      if (lo > 0n) lo = 0n;
      if (hi < 0n) hi = 0n;
    }
    const step = niceStep(absBig(hi - lo) / 4n + 1n);
    const yMin = lo >= 0n ? (lo / step) * step : -((-lo + step - 1n) / step) * step;
    const yMax = hi <= 0n ? -((-hi / step) * step) : ((hi + step - 1n) / step) * step;
    const top = yMax === yMin ? yMin + step : yMax;
    const ticks: bigint[] = [];
    for (let t = yMin; t <= top; t += step) ticks.push(t);
    const unit = 10n ** BigInt(decimals);
    const tickFraction = step % unit === 0n ? 0 : undefined;
    const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v: bigint) => H - frac(v, yMin, top) * H;
    const paths = data.map((vals) => {
      let d = "";
      let pen = false;
      vals.forEach((v, i) => {
        if (v === null) {
          pen = false;
          return;
        }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    });
    return { data, ticks, tickFraction, x, y, yMin, top, paths };
  }, [series, baseline, decimals, n, H]);

  const xLabelEvery = Math.max(1, Math.ceil(n / 7));
  const pct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const setPos = (el: HTMLElement | null, prop: string, value: number) => {
    el?.style.setProperty(prop, `${value}%`);
  };

  const indexAt = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || n === 0) return null;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return n <= 1 ? 0 : Math.round(f * (n - 1));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (n === 0) return;
    const cur = active ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur < 0 ? n - 1 : cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  };

  const multi = series.length > 1;
  const first = labels[0] ?? "";
  const last = labels[n - 1] ?? "";
  const summary = `${label}. ${series.length} series, ${n} points${n > 1 ? ` from ${first} to ${last}` : ""}. Values are listed in the table.`;

  return (
    <figure className={cx("np-chart", `np-chart--${size}`, className)} data-testid={testId}>
      {multi ? (
        <ul className="np-chart__legend" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.id} className="np-chart__legend-item">
              <span className={cx("np-chart__key", `np-chart__key--${i + 1}`)} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="np-chart__frame">
        <div className="np-chart__y" aria-hidden="true">
          {model.ticks.map((t) => (
            <span key={`s${String(t)}`} className="np-chart__y-sizer">
              {fmt(t, model.tickFraction)}
            </span>
          ))}
          {model.ticks.map((t) => (
            <span
              key={String(t)}
              className="np-chart__y-label"
              ref={(el) => setPos(el, "--np-chart-y", frac(t, model.yMin, model.top) * 100)}
            >
              {fmt(t, model.tickFraction)}
            </span>
          ))}
        </div>
        <section
          ref={plotRef}
          className="np-chart__plot"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the plot is keyboard-explorable (←/→)
          tabIndex={0}
          aria-label={`${label}: use left and right arrow keys to read values`}
          aria-describedby={tableId}
          onKeyDown={onKeyDown}
          onPointerMove={(e: PointerEvent<HTMLElement>) => setActive(indexAt(e.clientX))}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
        >
          <svg
            className="np-chart__svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={summary}
            focusable="false"
          >
            {model.ticks.map((t) => (
              <line
                key={String(t)}
                className={cx("np-chart__grid", t === 0n && "np-chart__grid--zero")}
                x1="0"
                x2={W}
                y1={model.y(t)}
                y2={model.y(t)}
              />
            ))}
            {active !== null ? (
              <line className="np-chart__crosshair" x1={model.x(active)} x2={model.x(active)} y1="0" y2={H} />
            ) : null}
            {model.paths.map((d, i) => (
              <path key={series[i]?.id ?? i} className={cx("np-chart__line", `np-chart__line--${i + 1}`)} d={d} />
            ))}
            {active !== null
              ? model.data.map((vals, i) => {
                  const v = vals[active];
                  if (v === null || v === undefined) return null;
                  const cx_ = model.x(active);
                  const cy = model.y(v);
                  return (
                    <line
                      key={series[i]?.id ?? i}
                      className={cx("np-chart__marker", `np-chart__marker--${i + 1}`)}
                      x1={cx_}
                      x2={cx_}
                      y1={cy}
                      y2={cy}
                    />
                  );
                })
              : null}
          </svg>
          {active !== null ? (
            <div
              className={cx("np-chart__tooltip", pct(active) > 60 && "np-chart__tooltip--left")}
              ref={(el) => setPos(el, "--np-chart-x", pct(active))}
              role="status"
              aria-live="polite"
            >
              <p className="np-chart__tooltip-title">{labels[active]}</p>
              {series.map((s, i) => {
                const v = model.data[i]?.[active];
                return (
                  <p key={s.id} className="np-chart__tooltip-row">
                    <span className={cx("np-chart__key", `np-chart__key--${i + 1}`)} aria-hidden="true" />
                    <strong className="np-chart__tooltip-value">{v === null || v === undefined ? "—" : fmt(v)}</strong>
                    {multi ? <span className="np-chart__tooltip-name">{s.label}</span> : null}
                  </p>
                );
              })}
            </div>
          ) : null}
        </section>
        <div className="np-chart__x" aria-hidden="true">
          {labels.map((l, i) =>
            i % xLabelEvery === 0 || i === n - 1 ? (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat; position is identity
                key={i}
                className={cx(
                  "np-chart__x-label",
                  i === 0 && "np-chart__x-label--first",
                  i === n - 1 && n > 1 && "np-chart__x-label--last",
                )}
                ref={(el) => setPos(el, "--np-chart-x", pct(i))}
              >
                {l}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <table id={tableId} className="np-sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Point</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows follow the label order
            <tr key={i}>
              <th scope="row">{l}</th>
              {model.data.map((vals, si) => {
                const v = vals[i];
                return <td key={series[si]?.id ?? si}>{v === null || v === undefined ? "No data" : fmt(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
