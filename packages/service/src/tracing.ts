/**
 * Tracing (lld/00-foundations.md §12): one span per inbound request, plus spans the service opens
 * with `withSpan` (outbound calls, transactions, event publish/consume). W3C `traceparent` links
 * them across services and through the outbox (`envelope.trace.traceparent`).
 *
 * A tracer provider always runs so trace ids exist for logs and propagation; spans are exported
 * over OTLP/HTTP only when `NP_OTEL_ENDPOINT` is set (the observability profile).
 */
import { currentContext, runWithContext } from "@nearpay-internal/http";
import {
  type Attributes,
  ROOT_CONTEXT,
  type Span,
  type SpanContext,
  SpanKind,
  SpanStatusCode,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, type SpanExporter, TracerProvider } from "@opentelemetry/sdk-trace";

export { type Span, SpanKind, SpanStatusCode, type Tracer };

const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/;

/** Parses a W3C `traceparent` header; null when absent or invalid. */
export function parseTraceparent(header: string | undefined | null): SpanContext | null {
  if (!header) return null;
  const m = TRACEPARENT_RE.exec(header.trim().toLowerCase());
  if (!m) return null;
  const [, version, traceId, spanId, flags, rest] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
    string | undefined,
  ];
  if (version === "ff" || (version === "00" && rest !== undefined)) return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return { traceId, spanId, traceFlags: Number.parseInt(flags, 16) & 1, isRemote: true };
}

/** Formats a span context as a version-00 `traceparent`. */
export function formatTraceparent(sc: Pick<SpanContext, "traceId" | "spanId" | "traceFlags">): string {
  return `00-${sc.traceId}-${sc.spanId}-${sc.traceFlags & 1 ? "01" : "00"}`;
}

export interface Tracing {
  readonly tracer: Tracer;
  /** Whether spans leave the process. */
  readonly exporting: boolean;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface TracingOptions {
  service: string;
  env: string;
  /** OTLP/HTTP base URL (`http://otel-collector:4318`); `/v1/traces` is appended. */
  endpoint?: string;
  /** Explicit exporter (tests). */
  exporter?: SpanExporter;
}

export function startTracing(o: TracingOptions): Tracing {
  const exporter =
    o.exporter ??
    (o.endpoint
      ? new OTLPTraceExporter({ url: `${o.endpoint.replace(/\/$/, "")}/v1/traces`, timeoutMillis: 5_000 })
      : null);
  const provider = new TracerProvider({
    resource: resourceFromAttributes({ "service.name": `nearpay-${o.service}`, "deployment.environment.name": o.env }),
    spanProcessors: exporter
      ? [new BatchSpanProcessor({ exporter, scheduledDelayMillis: 2_000, maxQueueSize: 4_096 })]
      : [],
  });

  return {
    tracer: provider.getTracer("@nearpay-internal/service"),
    exporting: exporter !== null,
    flush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown(),
  };
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Attributes;
  /** Parent `traceparent`; defaults to the current request context's. */
  parent?: string | null;
}

/** Starts a span under `parent` (a traceparent string) or as a new root. The caller ends it. */
export function startSpan(tracer: Tracer, name: string, o: SpanOptions = {}): Span {
  const parent = parseTraceparent(o.parent === undefined ? currentContext().traceparent : o.parent);
  const ctx = parent ? trace.setSpanContext(ROOT_CONTEXT, parent) : ROOT_CONTEXT;
  return tracer.startSpan(
    name,
    { kind: o.kind ?? SpanKind.INTERNAL, ...(o.attributes ? { attributes: o.attributes } : {}) },
    ctx,
  );
}

/**
 * Runs `fn` inside a child span of the current context; calls made inside propagate the child's
 * traceparent. Errors mark the span and are rethrown.
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  o: SpanOptions = {},
): Promise<T> {
  const span = startSpan(tracer, name, o);
  try {
    return await runWithContext({ ...currentContext(), traceparent: formatTraceparent(span.spanContext()) }, () =>
      fn(span),
    );
  } catch (e) {
    span.recordException(e instanceof Error ? e : String(e));
    span.setStatus({ code: SpanStatusCode.ERROR, message: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    span.end();
  }
}
