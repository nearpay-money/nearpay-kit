/**
 * Server-sent events for routes with a `stream` definition (payments status stream, webhooks
 * event stream): `retry:` on open, `event:`/`data:` frames validated against the route's event
 * schemas, comment heartbeats, and closing on client disconnect or service shutdown.
 */
import type { ServerResponse } from "node:http";
import type { SseStream as SseDefinition } from "@nearpay/spec";

export interface SseStream<E extends string = string> {
  /** Sends one event; the payload must match the route's schema for `event`. Returns false once closed. */
  send(event: E, data: unknown, id?: string): boolean;
  /** Ends the stream (idempotent). */
  close(): void;
  readonly closed: boolean;
  /** Resolves when the stream ends, for any reason. */
  readonly done: Promise<void>;
  onClose(fn: () => void): void;
  /** Bytes written but not yet flushed to the client (`res.writableLength`). */
  readonly buffered: number;
  /** Resolves once the socket buffer has drained (immediately when it is empty or the stream closed). */
  drain(): Promise<void>;
}

/**
 * Limits for long-lived streams (webhooks event stream, lld/webhooks.md §5.1). All optional and
 * parametric: the service passes them. For the webhooks event stream the spec (0.3.0) exports the
 * contract values — `EVENT_STREAM_MAX_SECONDS` (→ `maxDurationMs`), `EVENT_STREAM_MAX_CONCURRENT`
 * (enforced by the service, not here), and `EVENT_STREAM_HEARTBEAT_S` / `EVENT_STREAM_RETRY_MS`,
 * which already reach `openSse` through the route's `stream` definition.
 */
export interface SseLimits {
  /** Close the stream after this long (clients reconnect with `Last-Event-ID`). */
  readonly maxDurationMs?: number;
  /** A client is slow while more than this many bytes are unsent… */
  readonly maxBufferedBytes?: number;
  /** …and is closed once it stays slow this long (checked with the heartbeat). Default 30 s. */
  readonly slowClientMs?: number;
}

/**
 * Resume cursor of an SSE request: the `Last-Event-ID` header wins over a query cursor
 * (`starting_after`). Blank values count as absent.
 */
export function resumeCursor(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  queryCursor?: string,
): string | undefined {
  const raw = headers["last-event-id"];
  const header = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (header) return header;
  const q = queryCursor?.trim();
  return q ? q : undefined;
}

export function openSse<E extends string>(
  res: ServerResponse,
  def: SseDefinition,
  headers: Record<string, string>,
  limits: SseLimits = {},
): SseStream<E> {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    ...headers,
  });
  res.write(`retry: ${def.retryMs}\n\n`);
  let closed = false;
  const listeners: (() => void)[] = [];
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });
  let slowSince: number | undefined;
  const heartbeat = setInterval(() => {
    if (closed) return;
    if (limits.maxBufferedBytes !== undefined && res.writableLength > limits.maxBufferedBytes) {
      slowSince ??= Date.now();
      if (Date.now() - slowSince >= (limits.slowClientMs ?? 30_000)) {
        stream.close();
        return;
      }
    } else slowSince = undefined;
    res.write(": heartbeat\n\n");
  }, def.heartbeatSeconds * 1000);
  heartbeat.unref();
  const lifetime =
    limits.maxDurationMs !== undefined ? setTimeout(() => stream.close(), limits.maxDurationMs) : undefined;
  lifetime?.unref();

  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    if (lifetime) clearTimeout(lifetime);
    for (const fn of listeners.splice(0)) {
      try {
        fn();
      } catch {
        // listeners must not break teardown
      }
    }
    resolveDone();
  };
  res.on("close", finish);

  const stream: SseStream<E> = {
    send(event, data, id) {
      if (closed) return false;
      const schema = def.events[event];
      if (!schema) throw new Error(`stream has no event "${event}"`);
      const parsed = schema.safeParse(data);
      if (!parsed.success)
        throw new Error(`event "${event}" does not match its schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      const lines = JSON.stringify(data)
        .split("\n")
        .map((l) => `data: ${l}`)
        .join("\n");
      res.write(`${id ? `id: ${id.replace(/[\r\n]/g, "")}\n` : ""}event: ${event}\n${lines}\n\n`);
      return true;
    },
    close() {
      if (closed) return;
      res.end();
      finish();
    },
    get closed() {
      return closed;
    },
    done,
    onClose(fn) {
      if (closed) fn();
      else listeners.push(fn);
    },
    get buffered() {
      return res.writableLength;
    },
    drain() {
      if (closed || res.writableLength === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => {
          res.off("drain", done);
          res.off("close", done);
          resolve();
        };
        res.on("drain", done);
        res.on("close", done);
      });
    },
  };
  return stream;
}
