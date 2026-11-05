/**
 * Prometheus metrics (lld/00-foundations.md §12): names `nearpay_<svc>_<thing>_<unit>`, served on
 * `:9464/metrics`. The mandatory set is created for every service; gauges that read state
 * (outbox lag, consumer lag, jobs due, dead letters) are filled by collectors the service sets.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";

export type { Registry };

type Collect<T> = () => Promise<T> | T;

export interface ExternalCallResult {
  target: string;
  outcome: "ok" | "error" | "timeout" | "breaker_open";
  status?: number;
  ms: number;
}

export interface ServiceMetrics {
  readonly registry: Registry;
  readonly prefix: string;
  /** `http_requests_total{route,code}` + `http_request_duration_seconds{route}`. */
  observeRequest(route: string, code: number, seconds: number): void;
  /** `external_calls_total{target,outcome}` + `external_call_duration_seconds{target}`; matches the http client's `onResult`. */
  observeExternalCall(r: ExternalCallResult): void;
  collectOutboxLag(fn: Collect<number>): void;
  collectConsumerLag(fn: Collect<Record<string, number>>): void;
  collectJobsDue(fn: Collect<Record<string, number>>): void;
  collectDeadLettersOpen(fn: Collect<number>): void;
  counter<L extends string>(name: string, help: string, labelNames?: readonly L[]): Counter<L>;
  gauge<L extends string>(
    name: string,
    help: string,
    labelNames?: readonly L[],
    collect?: (g: Gauge<L>) => Promise<void> | void,
  ): Gauge<L>;
  histogram<L extends string>(name: string, help: string, labelNames?: readonly L[], buckets?: number[]): Histogram<L>;
  render(): Promise<string>;
}

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const NAME_RE = /^[a-z][a-z0-9_]*$/;

export function createMetrics(service: string, opts: { defaultMetrics?: boolean } = {}): ServiceMetrics {
  if (!NAME_RE.test(service)) throw new Error(`invalid service name for metrics: ${service}`);
  const registry = new Registry();
  const prefix = `nearpay_${service}_`;
  const full = (name: string) => {
    if (!NAME_RE.test(name)) throw new Error(`invalid metric name ${name}`);
    return prefix + name;
  };
  if (opts.defaultMetrics !== false) collectDefaultMetrics({ register: registry, prefix });

  const counter = <L extends string>(name: string, help: string, labelNames: readonly L[] = []) =>
    new Counter<L>({ name: full(name), help, labelNames: [...labelNames], registers: [registry] });
  const histogram = <L extends string>(
    name: string,
    help: string,
    labelNames: readonly L[] = [],
    buckets = DURATION_BUCKETS,
  ) => new Histogram<L>({ name: full(name), help, labelNames: [...labelNames], buckets, registers: [registry] });
  const gauge = <L extends string>(
    name: string,
    help: string,
    labelNames: readonly L[] = [],
    collect?: (g: Gauge<L>) => Promise<void> | void,
  ) =>
    new Gauge<L>({
      name: full(name),
      help,
      labelNames: [...labelNames],
      registers: [registry],
      ...(collect
        ? {
            async collect(this: Gauge<L>) {
              await collect(this);
            },
          }
        : {}),
    });

  const requests = counter("http_requests_total", "Inbound HTTP requests.", ["route", "code"]);
  const requestSeconds = histogram("http_request_duration_seconds", "Inbound HTTP request duration.", ["route"]);
  const external = counter("external_calls_total", "Outbound calls by target and outcome.", ["target", "outcome"]);
  const externalSeconds = histogram("external_call_duration_seconds", "Outbound call duration.", ["target"]);

  let outboxLag: Collect<number> = () => 0;
  let consumerLag: Collect<Record<string, number>> = () => ({});
  let jobsDue: Collect<Record<string, number>> = () => ({});
  let deadLetters: Collect<number> = () => 0;
  const safe = async <T>(fn: Collect<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const setAll = <L extends string>(g: Gauge<L>, label: L, values: Record<string, number>) => {
    g.reset();
    for (const [k, v] of Object.entries(values)) g.set({ [label]: k } as Partial<Record<L, string>>, v);
  };
  gauge("outbox_lag_seconds", "Age of the oldest unpublished outbox row (-1 when unknown).", [], async (g) =>
    g.set(await safe(outboxLag, -1)),
  );
  gauge("consumer_lag_messages", "Pending + unacknowledged messages per durable consumer.", ["durable"], async (g) =>
    setAll(g, "durable", await safe(consumerLag, {})),
  );
  gauge("jobs_due", "Jobs due now, per kind.", ["kind"], async (g) => setAll(g, "kind", await safe(jobsDue, {})));
  gauge("dead_letters_open", "Unresolved dead letters (-1 when unknown).", [], async (g) =>
    g.set(await safe(deadLetters, -1)),
  );

  return {
    registry,
    prefix,
    observeRequest(route, code, seconds) {
      requests.inc({ route, code: String(code) });
      requestSeconds.observe({ route }, seconds);
    },
    observeExternalCall(r) {
      external.inc({ target: r.target, outcome: r.outcome });
      if (r.outcome !== "breaker_open") externalSeconds.observe({ target: r.target }, r.ms / 1000);
    },
    collectOutboxLag(fn) {
      outboxLag = fn;
    },
    collectConsumerLag(fn) {
      consumerLag = fn;
    },
    collectJobsDue(fn) {
      jobsDue = fn;
    },
    collectDeadLettersOpen(fn) {
      deadLetters = fn;
    },
    counter,
    gauge,
    histogram,
    render: () => registry.metrics(),
  };
}

/** Serves `GET /metrics` (and nothing else) on its own port. */
export async function serveMetrics(
  metrics: ServiceMetrics,
  port: number,
  host = "0.0.0.0",
): Promise<{ port: number; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    if (req.method !== "GET" || (req.url ?? "").split("?")[0] !== "/metrics") {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found\n");
      return;
    }
    metrics.render().then(
      (body) => res.writeHead(200, { "content-type": metrics.registry.contentType }).end(body),
      () => res.writeHead(500, { "content-type": "text/plain" }).end("metrics unavailable\n"),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
