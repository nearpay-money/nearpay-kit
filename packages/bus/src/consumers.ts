/**
 * Domain-event consumers of one service (foundations §8): one durable pull consumer per producing
 * stream, named `<consumer>--<STREAM>`, filtering exactly the subjects the service handles. Handlers
 * must belong to the catalogue (`@nearpay-internal/spec` SUBJECTS lists the service as a consumer):
 * consuming an event the contract does not route to you is a defect and fails at startup.
 */
import { durableName, type Consumer as ServiceName, SUBJECTS, type Subject, streamOf } from "@nearpay-internal/spec";
import {
  type Bus,
  type Envelope,
  ensureStreams,
  type Heartbeat,
  type RestartBackoff,
  type Subscription,
  type SupervisedSubscription,
  subscribe,
} from "./index.js";

export type EventHandler = (envelope: Envelope) => Promise<void>;

export interface DomainConsumersOptions {
  bus: Bus;
  consumer: ServiceName;
  handlers: Partial<Record<Subject, EventHandler>>;
  onDeadLetter: (raw: unknown, error: string, subject: string) => Promise<void>;
  onError?: (e: unknown) => void;
  maxDeliver?: number;
  ackWaitSeconds?: number;
  backoffSeconds?: readonly number[];
  /** Restart delays of each supervised consume loop (KIT-1; default 1 s → 60 s). */
  restartBackoff?: RestartBackoff;
  /** Liveness of all durables together: beats only while every durable's loop is alive (see `subscribe`). */
  heartbeat?: Heartbeat;
  /**
   * `/healthz` budget for `domainConsumersTask` (KIT-4): the task fails liveness when a durable's loop has been silent
   * (hung handler, connection closed for good) for longer. Default 120 000 (4 × ack wait); `false` disables.
   */
  maxSilenceMs?: number | false;
}

export interface DomainConsumersSubscription extends Subscription {
  /** True while every durable is consuming. */
  running(): boolean;
  readonly subscriptions: readonly SupervisedSubscription[];
}

/** Heartbeats of several loops folded into one: the parent beats when the least recent loop beats. */
function combine(parent: Heartbeat, n: number): Heartbeat[] {
  const last = new Array<number>(n).fill(0);
  let forwarded = 0;
  return last.map((_, i) => ({
    beat() {
      last[i] = Date.now();
      const oldest = Math.min(...last);
      if (oldest > forwarded) {
        forwarded = oldest;
        parent.beat();
      }
    },
    idle() {},
  }));
}

/** Subjects the catalogue routes to `consumer` that have no handler (contract tests assert none). */
export function unhandledSubjects(consumer: ServiceName, handlers: Partial<Record<Subject, EventHandler>>): Subject[] {
  return (Object.keys(SUBJECTS) as Subject[]).filter((s) => SUBJECTS[s].consumers.includes(consumer) && !handlers[s]);
}

/** Starts the consumers (each one supervised, KIT-1); `stop()` drains every subscription. */
export async function startDomainConsumers(o: DomainConsumersOptions): Promise<DomainConsumersSubscription> {
  const byStream = new Map<string, Subject[]>();
  for (const subject of Object.keys(o.handlers) as Subject[]) {
    const def = SUBJECTS[subject];
    if (!def) throw new Error(`${o.consumer}: ${subject} is not a catalogue subject`);
    if (!def.consumers.includes(o.consumer))
      throw new Error(`${o.consumer} is not a consumer of ${subject} in the event catalogue`);
    const st = streamOf(subject);
    byStream.set(st.name, [...(byStream.get(st.name) ?? []), subject]);
  }
  await ensureStreams(
    o.bus,
    [...byStream.keys()].map((name) => {
      const subject = (byStream.get(name) as Subject[])[0] as Subject;
      return streamOf(subject);
    }),
  );
  const subs: SupervisedSubscription[] = [];
  const beats = o.heartbeat ? combine(o.heartbeat, byStream.size) : [];
  try {
    for (const [stream, subjects] of byStream) {
      const heartbeat = beats[subs.length];
      subs.push(
        await subscribe(o.bus, {
          stream,
          durable: durableName(o.consumer, stream),
          filterSubjects: subjects,
          handler: async (envelope) => {
            const h = o.handlers[envelope.subject as Subject];
            if (!h) throw new Error(`no handler for ${envelope.subject}`);
            await h(envelope);
          },
          onDeadLetter: o.onDeadLetter,
          ...(o.onError ? { onError: o.onError } : {}),
          ...(o.maxDeliver !== undefined ? { maxDeliver: o.maxDeliver } : {}),
          ...(o.ackWaitSeconds !== undefined ? { ackWaitSeconds: o.ackWaitSeconds } : {}),
          ...(o.backoffSeconds !== undefined ? { backoffSeconds: o.backoffSeconds } : {}),
          ...(o.restartBackoff ? { restartBackoff: o.restartBackoff } : {}),
          ...(heartbeat ? { heartbeat } : {}),
        }),
      );
    }
  } catch (e) {
    for (const s of subs) await s.stop().catch(() => {});
    throw e;
  }
  return {
    subscriptions: subs,
    running: () => subs.every((s) => s.running()),
    async stop() {
      for (const s of subs) await s.stop();
    },
  };
}

/**
 * `{name, maxSilenceMs, start}` background task for `@nearpay-internal/service`: the service hands `start` a
 * heartbeat, so a dead or hung consumer fails `/healthz` (KIT-4) while a NATS outage does not.
 */
export function domainConsumersTask(o: DomainConsumersOptions): {
  readonly name: string;
  readonly maxSilenceMs?: number;
  start(heartbeat?: Heartbeat): Promise<DomainConsumersSubscription>;
} {
  const maxSilenceMs = o.maxSilenceMs === undefined ? 120_000 : o.maxSilenceMs;
  return {
    name: `consumers:${o.consumer}`,
    ...(maxSilenceMs === false ? {} : { maxSilenceMs }),
    start: (heartbeat?: Heartbeat) =>
      startDomainConsumers({ ...o, ...(heartbeat && maxSilenceMs !== false ? { heartbeat } : {}) }),
  };
}

/** Durable names a service uses (consumer-lag metrics). */
export function durablesOf(consumer: ServiceName, subjects: readonly Subject[]): { stream: string; durable: string }[] {
  const streams = new Set(subjects.map((s) => streamOf(s).name));
  return [...streams].map((stream) => ({ stream, durable: durableName(consumer, stream) }));
}
