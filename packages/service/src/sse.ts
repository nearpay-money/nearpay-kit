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
}

export function openSse<E extends string>(
  res: ServerResponse,
  def: SseDefinition,
  headers: Record<string, string>,
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
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": heartbeat\n\n");
  }, def.heartbeatSeconds * 1000);
  heartbeat.unref();

  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
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

  return {
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
  };
}
