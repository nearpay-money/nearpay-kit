/** Waiting for domain events in integration tests (core NATS subscription receives JetStream publishes). */
import { connect } from "@nats-io/transport-node";
import { EventEnvelope } from "@nearpay-internal/spec";

type Envelope = ReturnType<typeof EventEnvelope.parse>;

export interface EventProbe {
  /** Resolves with the first event (already received or future) on `subject` matching `match`. */
  next(subject: string, match?: (e: Envelope) => boolean, timeoutMs?: number): Promise<Envelope>;
  readonly received: readonly Envelope[];
  close(): Promise<void>;
}

/** Subscribes to `evt.>` (or `filter`) from now on. Create the probe before triggering the action. */
export async function eventProbe(natsUrl: string, filter = "evt.>"): Promise<EventProbe> {
  const nc = await connect({ servers: natsUrl, name: "nearpay-test-probe" });
  const received: Envelope[] = [];
  const waiters: { subject: string; match: (e: Envelope) => boolean; resolve: (e: Envelope) => void }[] = [];
  const sub = nc.subscribe(filter);
  (async () => {
    for await (const m of sub) {
      let body: unknown;
      try {
        body = m.json();
      } catch {
        continue;
      }
      const parsed = EventEnvelope.safeParse(body);
      if (!parsed.success) continue;
      received.push(parsed.data);
      for (const w of [...waiters]) {
        if (w.subject === parsed.data.subject && w.match(parsed.data)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(parsed.data);
        }
      }
    }
  })();
  await nc.flush();
  return {
    received,
    next(subject, match = () => true, timeoutMs = 10_000) {
      const hit = received.find((e) => e.subject === subject && match(e));
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) {
            waiters.splice(i, 1);
            reject(
              new Error(
                `no ${subject} event within ${timeoutMs} ms (received: ${received.map((e) => e.subject).join(", ") || "none"})`,
              ),
            );
          }
        }, timeoutMs);
        const w = {
          subject,
          match,
          resolve: (e: Envelope) => {
            clearTimeout(timer);
            resolve(e);
          },
        };
        waiters.push(w);
      });
    },
    async close() {
      sub.unsubscribe();
      await nc.drain();
    },
  };
}

/** Deep partial match: every key in `expected` must match `actual` (arrays element-wise, same length). */
export function matchesPartial(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return Object.is(actual, expected);
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((e, i) => matchesPartial(actual[i], e))
    );
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected as Record<string, unknown>).every(([k, v]) =>
    matchesPartial((actual as Record<string, unknown>)[k], v),
  );
}

/**
 * Waits for an event on `subject` matching `matcher` — a predicate or a deep-partial envelope
 * (foundations §4 `expectEvent(subject, matcher)`).
 */
export function expectEvent(
  probe: EventProbe,
  subject: string,
  matcher: ((e: Envelope) => boolean) | Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<Envelope> {
  const match = typeof matcher === "function" ? matcher : (e: Envelope) => matchesPartial(e, matcher);
  return probe.next(subject, match, timeoutMs);
}
