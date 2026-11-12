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

/**
 * Liveness handle (structural twin of `@nearpay-internal/service` `Heartbeat`): `beat()` while the loop is alive and
 * making progress; `idle()` while it is not responsible for anything (excluded from liveness until the next beat).
 */
export interface Heartbeat {
  beat(): void;
  idle(): void;
}

export interface RestartBackoff {
  /** First delay after the loop ends, ms (default 1 000). */
  initialMs?: number;
  /** Cap, ms (default 60 000). Delays double per consecutive failure, ±20 % jitter. */
  maxMs?: number;
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
  /** Pull request expiry, ms (default 10 000; idle heartbeats every half of it detect a vanished durable). */
  pullExpiresMs?: number;
  onError?: (e: unknown) => void;
  /** Delays between restarts of the consume loop (KIT-1; default 1 s → 60 s). */
  restartBackoff?: RestartBackoff;
  /**
   * Liveness (KIT-1/KIT-4): beaten every second while the loop is consuming or waiting to restart, and not while a
   * handler has been running (a hung handler goes silent) or once the NATS connection is closed for good.
   */
  heartbeat?: Heartbeat;
  /** Called when the loop starts (true) or stops (false) consuming; also exported as `consumer_running{durable}`. */
  onRunningChange?: (running: boolean) => void;
  /** Called before each restart attempt, with the reason the previous loop ended. */
  onRestart?: (r: { durable: string; attempt: number; delayMs: number; reason: string }) => void;
  random?: () => number;
}

export interface Subscription {
  stop(): Promise<void>;
}

/** A subscription under its supervisor (KIT-1): the consume loop is restarted until `stop()`. */
export interface SupervisedSubscription extends Subscription {
  /** True while the consume loop runs (false while backing off before a restart, and after `stop()`). */
  running(): boolean;
  /** Restarts so far (the first start excluded). */
  restarts(): number;
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

/** Delay before restart number `attempt` (0-based) of a consume loop: initial × 2^attempt, capped, ±20 % jitter. */
export function restartDelayMs(attempt: number, b: RestartBackoff = {}, random: () => number = Math.random): number {
  const initial = b.initialMs ?? 1_000;
  const max = b.maxMs ?? 60_000;
  const base = Math.min(initial * 2 ** Math.max(0, attempt), max);
  return Math.round(base * (0.8 + 0.4 * random()));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Process-wide registry of supervised consumers: `@nearpay-internal/service` reads it (through this global symbol, so
// the service package needs no NATS dependency) to export `consumer_running{durable}`.
const REGISTRY = Symbol.for("nearpay.kit.bus.consumers");
type Registry = Map<string, Set<SupervisedSubscription>>;
function registry(): Registry {
  const g = globalThis as { [REGISTRY]?: Registry };
  g[REGISTRY] ??= new Map();
  return g[REGISTRY];
}

/** Whether each supervised durable of this process is consuming right now (metric `consumer_running{durable}`). */
export function consumerRunning(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [durable, subs] of registry()) {
    if (subs.size) out[durable] = [...subs].some((s) => s.running());
  }
  return out;
}

/**
 * Creates or updates the durable consumer and starts processing; `stop()` drains the in-flight message.
 *
 * The consume loop is supervised (audit KIT-1): when it ends or throws without `stop()` — durable deleted, stream
 * recreated after a NATS data loss, a terminal consume error — the error is reported and the durable is re-created
 * (`info`/`add` + `consume`) after an exponential back-off with jitter (1 s → 60 s), until it consumes again. Only the
 * first setup throws (a broken configuration fails the boot); later setup failures are retried.
 */
export async function subscribe(bus: Bus, o: SubscribeOptions): Promise<SupervisedSubscription> {
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
  const report = (e: unknown) => {
    try {
      o.onError?.(e);
    } catch {
      // an error reporter must not break the consumer
    }
  };

  async function setup() {
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
    // A deleted durable or stream ends the iterator instead of spinning on "consumer not found" forever; the
    // supervisor below re-creates it.
    // Pulls expire after 10 s (idle heartbeat 5 s), so a durable or stream deleted while no pull is pending is noticed
    // within ~2 missed heartbeats instead of ~30 s.
    return consumer.consume({
      max_messages: o.maxMessages ?? 10,
      expires: o.pullExpiresMs ?? 10_000,
      abort_on_missing_resource: true,
    });
  }

  const deadLetter = async (m: JsMsg, raw: unknown, error: string) => {
    try {
      await o.onDeadLetter(raw, error, m.subject);
      m.ack();
    } catch (e) {
      report(e);
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
      report(e);
      const delivery = m.info.deliveryCount;
      if (delivery >= maxDeliver) await deadLetter(m, parsed.data, message(e));
      else m.nak(redeliveryDelayMs(delivery, backoff));
    }
  };

  let messages: Awaited<ReturnType<typeof setup>> | null = await setup();
  let stopped = false;
  let isRunning = false;
  let restarts = 0;
  let inflight = false;
  let wake: (() => void) | null = null;
  const random = o.random ?? Math.random;

  const setRunning = (v: boolean) => {
    if (isRunning === v) return;
    isRunning = v;
    try {
      o.onRunningChange?.(v);
    } catch {
      // observers must not break the consumer
    }
  };

  // Liveness: alive while consuming or backing off, silent while a handler hangs or once the connection is closed.
  const beat = () => {
    if (stopped || inflight || bus.nc.isClosed()) return;
    o.heartbeat?.beat();
  };
  const ticker = o.heartbeat ? setInterval(beat, 1_000) : null;
  ticker?.unref?.();

  const sleep = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(r, ms);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });

  const supervisor = (async () => {
    let failures = 0;
    while (!stopped) {
      const current = messages;
      let reason = "the consume loop ended";
      if (current) {
        setRunning(true);
        beat();
        const startedAt = Date.now();
        try {
          for await (const m of current) {
            inflight = true;
            try {
              await handle(m);
            } finally {
              inflight = false;
            }
            failures = 0;
            beat();
          }
        } catch (e) {
          reason = message(e);
        }
        setRunning(false);
        messages = null;
        if (stopped) break;
        if (Date.now() - startedAt >= (o.restartBackoff?.maxMs ?? 60_000)) failures = 0;
        report(new Error(`consumer ${o.durable}: ${reason}; restarting`));
      }
      const delayMs = restartDelayMs(failures, o.restartBackoff, random);
      failures++;
      try {
        o.onRestart?.({ durable: o.durable, attempt: failures, delayMs, reason });
      } catch {
        // observers must not break the consumer
      }
      await sleep(delayMs);
      if (stopped) break;
      try {
        const next = await setup();
        restarts++;
        if (stopped) await next.close();
        else messages = next;
      } catch (e) {
        report(new Error(`consumer ${o.durable}: restart failed: ${message(e)}`));
      }
    }
  })();

  const sub: SupervisedSubscription = {
    running: () => isRunning,
    restarts: () => restarts,
    async stop() {
      stopped = true;
      if (ticker) clearInterval(ticker);
      (wake as (() => void) | null)?.();
      await messages?.close();
      await supervisor;
      setRunning(false);
      const set = registry().get(o.durable);
      set?.delete(sub);
      if (set && set.size === 0) registry().delete(o.durable);
    },
  };
  const set = registry().get(o.durable) ?? new Set();
  set.add(sub);
  registry().set(o.durable, set);
  return sub;
}

/** Pending messages of a durable (metric `consumer_lag_messages{durable}`). */
export async function consumerLag(bus: Bus, stream: string, durable: string): Promise<number> {
  const info = await bus.jsm.consumers.info(stream, durable);
  return info.num_pending + info.num_ack_pending;
}

export {
  type DomainConsumersOptions,
  type DomainConsumersSubscription,
  domainConsumersTask,
  durablesOf,
  type EventHandler,
  startDomainConsumers,
  unhandledSubjects,
} from "./consumers.js";
