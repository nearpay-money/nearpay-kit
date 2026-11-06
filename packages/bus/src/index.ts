/**
 * NATS JetStream (ADR-0004, lld/00-foundations.md §8).
 *
 * - One file-backed stream per producing domain, 7-day retention, 120 s duplicate window;
 *   publishes carry `Nats-Msg-Id = event id` so outbox re-sends are de-duplicated.
 * - Durable pull consumers `<consumer>--<STREAM>` with explicit filter subjects, ack wait 30 s and
 *   max deliver 20. A failing handler is nak'ed with a delay from the backoff schedule
 *   [1s, 5s, 30s, 2m, 10m…]; after the last delivery the message goes to the dead-letter callback
 *   and is acked.
 *
 * The schedule is applied with `nak(delay)` rather than the consumer `backoff` setting on purpose:
 * NATS replaces `ack_wait` with `backoff[0]` when `backoff` is set, which would redeliver any
 * message whose handler runs longer than 1 s while it is still being processed.
 */
import {
  AckPolicy,
  DeliverPolicy,
  type JetStreamClient,
  type JetStreamManager,
  type JsMsg,
  jetstream,
  jetstreamManager,
  StorageType,
} from "@nats-io/jetstream";
import { connect, type NatsConnection } from "@nats-io/transport-node";
import { CONSUMER_DEFAULTS, EventEnvelope, type StreamDefinition } from "@nearpay-internal/spec";

export type Envelope = ReturnType<typeof EventEnvelope.parse>;

const ns = (ms: number) => ms * 1_000_000;

export interface Bus {
  readonly nc: NatsConnection;
  readonly js: JetStreamClient;
  readonly jsm: JetStreamManager;
  close(): Promise<void>;
}

export async function connectBus(opts: { url: string; name: string; timeoutMs?: number }): Promise<Bus> {
  const nc = await connect({
    servers: opts.url,
    name: opts.name,
    timeout: opts.timeoutMs ?? 5_000,
    maxReconnectAttempts: -1,
  });
  try {
    const jsm = await jetstreamManager(nc);
    return {
      nc,
      js: jetstream(nc),
      jsm,
      close: async () => {
        if (!nc.isClosed()) await nc.drain();
      },
    };
  } catch (e) {
    await nc.close();
    throw e;
  }
}

/** True when the connection is up (readiness). */
export function busReady(bus: Bus): boolean {
  return !bus.nc.isClosed() && !bus.nc.isDraining();
}

const sameSubjects = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Creates streams, or updates subjects/retention/duplicate window to match their definitions. */
export async function ensureStreams(bus: Bus, defs: readonly StreamDefinition[]): Promise<void> {
  for (const d of defs) {
    const cfg = {
      name: d.name,
      subjects: [...d.subjects],
      storage: StorageType.File,
      max_age: ns(d.maxAgeSeconds * 1000),
      duplicate_window: ns(d.duplicateWindowSeconds * 1000),
    };
    let current: Awaited<ReturnType<JetStreamManager["streams"]["info"]>> | null = null;
    try {
      current = await bus.jsm.streams.info(d.name);
    } catch (e) {
      if (!/stream not found/i.test((e as Error).message)) throw e;
    }
    if (!current) {
      await bus.jsm.streams.add(cfg);
      continue;
    }
    const c = current.config;
    if (c.storage !== StorageType.File)
      throw new Error(`stream ${d.name} uses ${c.storage} storage; it must be recreated as file storage`);
    if (
      !sameSubjects(c.subjects ?? [], cfg.subjects) ||
      c.max_age !== cfg.max_age ||
      c.duplicate_window !== cfg.duplicate_window
    ) {
      await bus.jsm.streams.update(d.name, {
        subjects: cfg.subjects,
        max_age: cfg.max_age,
        duplicate_window: cfg.duplicate_window,
      });
    }
  }
}

/** Publishes an envelope; a repeat with the same id inside the duplicate window is reported as duplicate. */
export async function publish(
  bus: Bus,
  subject: string,
  envelope: Envelope,
  msgId: string = envelope.id,
): Promise<{ seq: number; duplicate: boolean }> {
  if (envelope.subject !== subject) throw new Error(`subject mismatch: ${subject} vs ${envelope.subject}`);
  const ack = await bus.js.publish(subject, JSON.stringify(envelope), { msgID: msgId, timeout: 5_000 });
  return { seq: ack.seq, duplicate: ack.duplicate };
}

export interface SubscribeOptions {
  stream: string;
  durable: string;
  filterSubjects: readonly string[];
  handler: (envelope: Envelope, msg: JsMsg) => Promise<void>;
  /** Called once a message exhausted its deliveries or is not a valid envelope; then it is acked. */
  onDeadLetter: (raw: unknown, error: string, subject: string) => Promise<void>;
  maxDeliver?: number;
  ackWaitSeconds?: number;
  backoffSeconds?: readonly number[];
  /** Messages buffered per pull (default 10). Handlers run one at a time per subscription. */
  maxMessages?: number;
  onError?: (e: unknown) => void;
}

export interface Subscription {
  stop(): Promise<void>;
}

/** Delay before redelivery after failed delivery number `delivery` (1-based), from the backoff schedule. */
export function redeliveryDelayMs(
  delivery: number,
  backoffSeconds: readonly number[] = CONSUMER_DEFAULTS.backoffSeconds,
): number {
  if (backoffSeconds.length === 0) return 0;
  const i = Math.min(Math.max(delivery, 1) - 1, backoffSeconds.length - 1);
  return Math.round((backoffSeconds[i] as number) * 1000);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Creates or updates the durable consumer and starts processing; `stop()` drains the in-flight message. */
export async function subscribe(bus: Bus, o: SubscribeOptions): Promise<Subscription> {
  const maxDeliver = o.maxDeliver ?? CONSUMER_DEFAULTS.maxDeliver;
  const backoff = o.backoffSeconds ?? CONSUMER_DEFAULTS.backoffSeconds;
  if (o.filterSubjects.length === 0) throw new Error(`${o.durable}: at least one filter subject is required`);
  if (maxDeliver < 1) throw new Error(`${o.durable}: maxDeliver must be at least 1`);
  const config = {
    durable_name: o.durable,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subjects: [...o.filterSubjects],
    ack_wait: ns((o.ackWaitSeconds ?? CONSUMER_DEFAULTS.ackWaitSeconds) * 1000),
    max_deliver: maxDeliver,
  };
  let exists = true;
  try {
    await bus.jsm.consumers.info(o.stream, o.durable);
  } catch (e) {
    if (!/consumer not found/i.test((e as Error).message)) throw e;
    exists = false;
  }
  if (exists) {
    // `backoff: []` clears a schedule left by an older configuration (it would override ack_wait).
    await bus.jsm.consumers.update(o.stream, o.durable, {
      filter_subjects: config.filter_subjects,
      ack_wait: config.ack_wait,
      max_deliver: config.max_deliver,
      backoff: [],
    });
  } else {
    await bus.jsm.consumers.add(o.stream, config);
  }
  const consumer = await bus.js.consumers.get(o.stream, o.durable);
  const messages = await consumer.consume({ max_messages: o.maxMessages ?? 10 });

  const deadLetter = async (m: JsMsg, raw: unknown, error: string) => {
    try {
      await o.onDeadLetter(raw, error, m.subject);
      m.ack();
    } catch (e) {
      o.onError?.(e);
      m.nak(redeliveryDelayMs(m.info.deliveryCount, backoff));
    }
  };

  const handle = async (m: JsMsg) => {
    let raw: unknown;
    try {
      raw = m.json();
    } catch {
      raw = m.string();
    }
    const parsed = EventEnvelope.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      await deadLetter(
        m,
        raw,
        `unparseable envelope: ${issue ? `${issue.path.join(".") || "(root)"} ${issue.message}` : "invalid"}`,
      );
      return;
    }
    if (parsed.data.subject !== m.subject) {
      await deadLetter(m, raw, `envelope subject ${parsed.data.subject} does not match ${m.subject}`);
      return;
    }
    try {
      await o.handler(parsed.data, m);
      m.ack();
    } catch (e) {
      o.onError?.(e);
      const delivery = m.info.deliveryCount;
      if (delivery >= maxDeliver) await deadLetter(m, parsed.data, message(e));
      else m.nak(redeliveryDelayMs(delivery, backoff));
    }
  };

  const done = (async () => {
    for await (const m of messages) await handle(m);
  })().catch((e) => o.onError?.(e));

  return {
    async stop() {
      await messages.close();
      await done;
    },
  };
}

/** Pending messages of a durable (metric `consumer_lag_messages{durable}`). */
export async function consumerLag(bus: Bus, stream: string, durable: string): Promise<number> {
  const info = await bus.jsm.consumers.info(stream, durable);
  return info.num_pending + info.num_ack_pending;
}

export {
  type DomainConsumersOptions,
  domainConsumersTask,
  durablesOf,
  type EventHandler,
  startDomainConsumers,
  unhandledSubjects,
} from "./consumers.js";
