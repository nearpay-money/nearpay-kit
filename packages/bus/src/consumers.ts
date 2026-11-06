/**
 * Domain-event consumers of one service (foundations §8): one durable pull consumer per producing
 * stream, named `<consumer>--<STREAM>`, filtering exactly the subjects the service handles. Handlers
 * must belong to the catalogue (`@nearpay-internal/spec` SUBJECTS lists the service as a consumer):
 * consuming an event the contract does not route to you is a defect and fails at startup.
 */
import { durableName, type Consumer as ServiceName, SUBJECTS, type Subject, streamOf } from "@nearpay-internal/spec";
import { type Bus, type Envelope, ensureStreams, type Subscription, subscribe } from "./index.js";

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
}

/** Subjects the catalogue routes to `consumer` that have no handler (contract tests assert none). */
export function unhandledSubjects(consumer: ServiceName, handlers: Partial<Record<Subject, EventHandler>>): Subject[] {
  return (Object.keys(SUBJECTS) as Subject[]).filter((s) => SUBJECTS[s].consumers.includes(consumer) && !handlers[s]);
}

/** Starts the consumers; `stop()` drains every subscription. */
export async function startDomainConsumers(o: DomainConsumersOptions): Promise<Subscription> {
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
  const subs: Subscription[] = [];
  try {
    for (const [stream, subjects] of byStream) {
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
        }),
      );
    }
  } catch (e) {
    for (const s of subs) await s.stop().catch(() => {});
    throw e;
  }
  return {
    async stop() {
      for (const s of subs) await s.stop();
    },
  };
}

/** `{name, start}` background task for `@nearpay-internal/service`. */
export function domainConsumersTask(o: DomainConsumersOptions) {
  return { name: `consumers:${o.consumer}`, start: () => startDomainConsumers(o) };
}

/** Durable names a service uses (consumer-lag metrics). */
export function durablesOf(consumer: ServiceName, subjects: readonly Subject[]): { stream: string; durable: string }[] {
  const streams = new Set(subjects.map((s) => streamOf(s).name));
  return [...streams].map((stream) => ({ stream, durable: durableName(consumer, stream) }));
}
