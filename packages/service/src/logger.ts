/**
 * Logging (lld/00-foundations.md §12): pino JSON with `svc` and `env` on every line, request
 * lines carry `rid`, `trace_id`, `span_id`, `acct`, `lm`; PII and credentials are redacted by path.
 */
import { type DestinationStream, type Logger, pino, stdSerializers, stdTimeFunctions } from "pino";

export type { Logger };

/** Redacted paths (PII: email, names, IPs; credentials: secrets, authorization, tokens, cookies). */
export const REDACT_PATHS: readonly string[] = [
  "email",
  "*.email",
  "*.*.email",
  "name",
  "*.name",
  "*.*.name",
  "ip",
  "*.ip",
  "*.*.ip",
  "secret",
  "*.secret",
  "*.*.secret",
  "client_secret",
  "*.client_secret",
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  'headers["authorization"]',
  'headers["cookie"]',
  'headers["set-cookie"]',
  'headers["x-nearpay-token"]',
  'headers["x-nearpay-client-secret"]',
  'headers["x-csrf-token"]',
  'headers["x-turnstile-token"]',
  'headers["x-forwarded-for"]',
  'headers["cf-connecting-ip"]',
  '*.headers["authorization"]',
  '*.headers["cookie"]',
  '*.headers["x-nearpay-token"]',
  '*.headers["x-nearpay-client-secret"]',
];

export interface LoggerOptions {
  service: string;
  env: string;
  level?: string;
  /** Destination stream (tests capture lines); default stdout. */
  destination?: DestinationStream;
}

export function createLogger(o: LoggerOptions): Logger {
  return pino(
    {
      level: o.level ?? "info",
      base: { svc: o.service, env: o.env },
      messageKey: "msg",
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: [...REDACT_PATHS], censor: "[redacted]" },
      serializers: { err: stdSerializers.err },
    },
    o.destination,
  );
}
