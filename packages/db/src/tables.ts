/** Shared tables created in every service database (lld/00-foundations.md §7). */
import type { ColumnType, Generated } from "kysely";

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Json = ColumnType<unknown, string, string>;

export interface OutboxTable {
  id: string;
  subject: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  account_id: string | null;
  livemode: boolean | null;
  payload: Json;
  trace: ColumnType<unknown | null, string | null | undefined, string | null>;
  created_at: Timestamp;
  published_at: NullableTimestamp;
  /** Failed publish attempts of this row (kit 0.6.0, KIT-6). */
  attempts: Generated<number>;
  last_error: string | null;
  first_failed_at: NullableTimestamp;
}

export interface InboxTable {
  event_id: string;
  subject: string;
  received_at: Timestamp;
}

export interface IdempotencyKeysTable {
  account_id: string;
  livemode: boolean;
  key: string;
  request_hash: Buffer;
  state: "in_progress" | "completed";
  locked_until: Timestamp;
  response_status: number | null;
  response_body_enc: Buffer | null;
  created_at: Timestamp;
}

export interface JobsTable {
  id: string;
  kind: string;
  run_at: Timestamp;
  payload: Json;
  dedupe_key: string | null;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  locked_by: string | null;
  locked_until: NullableTimestamp;
  last_error: string | null;
  done_at: NullableTimestamp;
  created_at: Timestamp;
}

export interface DeadLettersTable {
  id: string;
  source: string;
  subject: string | null;
  payload: Json;
  error: string;
  created_at: Timestamp;
  resolved_at: NullableTimestamp;
  /** `replayed` or `dropped` (kit 0.6.0, KIT-7). */
  resolution: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface SchemaMigrationsTable {
  version: string;
  checksum: string;
  applied_at: Timestamp;
}

/** Extend your service's database interface with these tables. */
export interface KitTables {
  outbox: OutboxTable;
  inbox: InboxTable;
  idempotency_keys: IdempotencyKeysTable;
  jobs: JobsTable;
  dead_letters: DeadLettersTable;
  schema_migrations: SchemaMigrationsTable;
}

/** Kit migrations, applied before the service's own (versions sort before `0001_…`). */
export const KIT_MIGRATIONS: readonly { version: string; sql: string }[] = [
  {
    version: "0000_kit_shared_tables",
    sql: `
create extension if not exists pgcrypto;
create extension if not exists citext;

create table outbox (
  id uuid primary key,
  subject text not null,
  aggregate_type text not null, aggregate_id uuid not null, aggregate_version integer not null,
  account_id uuid, livemode boolean,
  payload jsonb not null, trace jsonb,
  created_at timestamptz not null default now(), published_at timestamptz);
create index outbox_pending on outbox (created_at) where published_at is null;

create table inbox (event_id uuid primary key, subject text not null, received_at timestamptz not null default now());

create table idempotency_keys (
  account_id uuid not null, livemode boolean not null, key text not null,
  request_hash bytea not null, state text not null check (state in ('in_progress','completed')),
  locked_until timestamptz not null, response_status integer, response_body_enc bytea,
  created_at timestamptz not null default now(),
  primary key (account_id, livemode, key));
create index idempotency_expiry on idempotency_keys (created_at);

create table jobs (
  id uuid primary key, kind text not null, run_at timestamptz not null, payload jsonb not null,
  dedupe_key text unique, attempts integer not null default 0, max_attempts integer not null default 20,
  locked_by text, locked_until timestamptz, last_error text, done_at timestamptz,
  created_at timestamptz not null default now(),
  constraint jobs_dedupe_key_kind check (dedupe_key is null or left(dedupe_key, length(kind) + 1) = kind || ':'));
create index jobs_due on jobs (run_at) where done_at is null;

create table dead_letters (id uuid primary key, source text not null, subject text, payload jsonb not null,
  error text not null, created_at timestamptz not null default now(), resolved_at timestamptz);
create index dead_letters_open on dead_letters (created_at) where resolved_at is null;
`,
  },
  {
    // kit 0.6.0: per-row publish failures, so a poison row is moved aside instead of blocking the outbox (KIT-6), and
    // how a dead letter was resolved (KIT-7). Additive; old code ignores the new columns.
    version: "0000_kit_outbox_attempts",
    sql: `
alter table outbox add column attempts integer not null default 0, add column last_error text,
  add column first_failed_at timestamptz;
alter table dead_letters add column resolution text check (resolution in ('replayed','dropped')),
  add column resolved_by text, add column resolution_note text;
`,
  },
];
