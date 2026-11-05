/**
 * Configuration (lld/00-foundations.md §13): environment variables `NP_<NAME>`, secrets only as
 * files referenced by `NP_<NAME>_FILE` (Docker secrets under `/run/secrets`, ADR-0015). Config is
 * validated with zod at boot; an invalid config throws `ConfigError` (the process runner exits 1).
 *
 * Keys are camelCase and map to `NP_` + SNAKE_CASE: `dbUrl` ↔ `NP_DB_URL` / `NP_DB_URL_FILE`.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const SECRET = Symbol.for("nearpay.config.secret");

/** A secret: accepted only from `NP_<NAME>_FILE`, never from a plain environment variable. */
export function secret<T extends z.ZodType = z.ZodString>(schema?: T): T {
  const s = (schema ?? z.string().min(1)) as T;
  (s as unknown as Record<symbol, boolean>)[SECRET] = true;
  return s;
}

/** Integer from the environment. */
export function int(defaultValue?: number) {
  const s = z.coerce.number().int();
  return defaultValue === undefined ? s : s.default(defaultValue);
}

/** Port number (1–65535). */
export function port(defaultValue: number) {
  return z.coerce.number().int().min(1).max(65_535).default(defaultValue);
}

/** Boolean from `true`/`false`/`1`/`0` (z.coerce.boolean would read "false" as true). */
export function flag(defaultValue = false) {
  return z
    .enum(["true", "false", "1", "0"])
    .transform((v) => v === "true" || v === "1")
    .default(defaultValue);
}

/** Comma-separated list. */
export function list(item: z.ZodType<string, string> = z.string().min(1)) {
  return z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item));
}

/** An http(s)/nats/redis/postgres URL. */
export function url(protocols: readonly string[] = ["http:", "https:"]) {
  return z.string().refine(
    (v) => {
      try {
        return protocols.includes(new URL(v).protocol);
      } catch {
        return false;
      }
    },
    { message: `must be a URL (${protocols.join(" ")})` },
  );
}

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/** Keys every service process understands. */
export const baseConfigShape = {
  /** `local` (Compose on a laptop), `server` (single host, ADR-0015) or `test`. */
  env: z.enum(["local", "server", "test"]).default("local"),
  logLevel: z.enum(LOG_LEVELS).default("info"),
  host: z.string().default("0.0.0.0"),
  port: port(8080),
  metricsPort: port(9464),
  /** OTLP/HTTP collector base URL; traces are exported only when set. */
  otelEndpoint: url().optional(),
  /** Identity JWKS (`/internal/jwks`); required when a service exposes authenticated routes. */
  jwksUrl: url().optional(),
};

export const BaseConfig = z.object(baseConfigShape);
export type BaseConfig = z.output<typeof BaseConfig>;

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`invalid configuration:\n  ${issues.join("\n  ")}`);
    this.name = "ConfigError";
  }
}

/** `dbUrl` → `NP_DB_URL`. */
export function envName(key: string): string {
  return `NP_${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

function isSecret(schema: z.ZodType): boolean {
  let s: unknown = schema;
  for (let i = 0; i < 10 && s; i++) {
    if ((s as Record<symbol, unknown>)[SECRET]) return true;
    const def = (s as { _zod?: { def?: { innerType?: unknown; in?: unknown } } })._zod?.def;
    s = def?.innerType ?? def?.in;
  }
  return false;
}

export interface LoadConfigOptions {
  /** Environment (default `process.env`). */
  env?: Record<string, string | undefined>;
  /** Already-resolved values (tests); they bypass the environment, secrets included. */
  overrides?: Record<string, unknown>;
  readFile?: (path: string) => string;
}

/**
 * Reads and validates configuration. Values come from `NP_<NAME>_FILE` (file content, trailing
 * whitespace trimmed) or `NP_<NAME>`; secrets must use the file form. Error messages name the
 * variables, never their values.
 */
export function loadConfig<S extends z.ZodRawShape>(
  shape: S | z.ZodObject<S>,
  opts: LoadConfigOptions = {},
): z.output<z.ZodObject<S>> {
  const schema = shape instanceof z.ZodObject ? shape : z.object(shape);
  const env = opts.env ?? process.env;
  const read = opts.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const raw: Record<string, unknown> = {};
  const issues: string[] = [];
  const reported = new Set<string>();
  for (const [key, field] of Object.entries(schema.shape) as [string, z.ZodType][]) {
    if (opts.overrides && key in opts.overrides) {
      raw[key] = opts.overrides[key];
      continue;
    }
    const name = envName(key);
    const file = env[`${name}_FILE`];
    const plain = env[name];
    const problem = (msg: string) => {
      issues.push(msg);
      reported.add(key);
    };
    if (isSecret(field) && plain !== undefined) {
      problem(`${name}: secrets are read from files; set ${name}_FILE instead`);
      continue;
    }
    if (file !== undefined && plain !== undefined) {
      problem(`${name}: set either ${name} or ${name}_FILE, not both`);
      continue;
    }
    if (file !== undefined) {
      try {
        raw[key] = read(file).replace(/\s+$/, "");
      } catch (e) {
        problem(`${name}_FILE: cannot read ${file} (${(e as NodeJS.ErrnoException).code ?? "error"})`);
      }
      continue;
    }
    if (plain !== undefined && plain !== "") raw[key] = plain;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const key = String(i.path[0] ?? "");
      if (reported.has(key)) continue;
      reported.add(key);
      const name = envName(key);
      const missing = raw[key] === undefined;
      issues.push(
        `${name}${isSecret(schema.shape[key] as z.ZodType) ? "_FILE" : ""}: ${missing ? "is required" : i.message}`,
      );
    }
  }
  if (issues.length) throw new ConfigError(issues);
  return (parsed as { data: z.output<z.ZodObject<S>> }).data;
}
