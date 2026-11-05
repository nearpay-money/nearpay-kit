/**
 * Error envelopes (architecture/api-conventions.md §6, foundations §11). Handlers throw `ApiError`
 * with a catalogue code; validation, authentication and idempotency failures are mapped here;
 * anything else becomes `500 api_error` (details only in logs).
 */

import { ERRORS, type ErrorCode, type ErrorEnvelope, errorDocUrl, renderErrorMessage } from "@nearpay/spec";
import { AuthError } from "@nearpay-internal/auth";
import type { HttpError } from "@nearpay-internal/http";
import type { z } from "zod";

export interface ApiErrorOptions {
  /** Overrides the rendered catalogue message. */
  message?: string;
  /** Values for the message template's `{placeholders}`. */
  params?: Record<string, string | number>;
  /** The request parameter the error relates to. */
  param?: string;
  /** Extra response headers (e.g. `Retry-After`). */
  headers?: Record<string, string>;
  cause?: unknown;
}

/** A catalogue error: status and type come from the error catalogue. */
export class ApiError extends Error {
  readonly status: number;
  readonly param: string | undefined;
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    readonly code: ErrorCode,
    o: ApiErrorOptions = {},
  ) {
    super(o.message ?? renderErrorMessage(code, o.params), o.cause === undefined ? undefined : { cause: o.cause });
    this.name = "ApiError";
    this.status = ERRORS[code].status;
    this.param = o.param;
    this.headers = o.headers ?? {};
  }

  /** `invalid_request` with a detail and the offending parameter. */
  static invalid(detail: string, param?: string): ApiError {
    return new ApiError("invalid_request", { params: { detail }, ...(param ? { param } : {}) });
  }

  /** `resource_missing` for `object` `id`. */
  static missing(object: string, id: string, param?: string): ApiError {
    return new ApiError("resource_missing", { params: { object, id }, ...(param ? { param } : {}) });
  }

  /** Re-raises a NearPay error returned by an internal call (same code, message and param). */
  static fromUpstream(e: HttpError): ApiError {
    if (!e.error || !(e.error.code in ERRORS)) return new ApiError("api_error", { cause: e });
    const headers: Record<string, string> = e.retryAfter !== null ? { "Retry-After": String(e.retryAfter) } : {};
    return new ApiError(e.error.code as ErrorCode, {
      message: e.error.message,
      ...(e.error.param ? { param: e.error.param } : {}),
      headers,
      cause: e,
    });
  }
}

/** `amount` / `destination[address]` / `items[0][price]` — the API's parameter notation. */
export function paramName(path: readonly PropertyKey[]): string {
  return path.map((p, i) => (i === 0 ? String(p) : `[${String(p)}]`)).join("");
}

/** Maps the first zod issue to `invalid_request` (`where` prefixes header/query/path params). */
export function fromZodError(error: z.ZodError, where?: "query" | "path" | "header"): ApiError {
  const issue = error.issues[0];
  if (!issue) return ApiError.invalid("invalid input");
  if (issue.code === "unrecognized_keys") {
    const key = paramName([...issue.path, issue.keys[0] ?? ""]);
    return ApiError.invalid(`unknown ${where === "header" ? "header" : "parameter"} ${key}`, key);
  }
  const param = paramName(issue.path);
  if (!param) return ApiError.invalid(issue.message);
  return ApiError.invalid(`${param}: ${issue.message}`, param);
}

export interface MappedError {
  status: number;
  envelope: ErrorEnvelope;
  headers: Record<string, string>;
  /** Unexpected errors are logged at error level with their stack. */
  unexpected: boolean;
}

function idempotencyCode(e: unknown): "idempotency_in_progress" | "idempotency_key_reused" | null {
  if (e instanceof Error && e.name === "IdempotencyConflict") {
    const code = (e as Error & { code?: unknown }).code;
    if (code === "idempotency_in_progress" || code === "idempotency_key_reused") return code;
  }
  return null;
}

/** Maps any thrown value to a status, envelope and headers. */
export function toErrorResponse(e: unknown, requestId: string): MappedError {
  let err: ApiError;
  let unexpected = false;
  const idem = idempotencyCode(e);
  if (e instanceof ApiError) err = e;
  else if (e instanceof AuthError) err = new ApiError(e.code);
  else if (idem)
    err = new ApiError(idem, idem === "idempotency_in_progress" ? { headers: { "Retry-After": "1" } } : {});
  else {
    err = new ApiError("api_error");
    unexpected = true;
  }
  const def = ERRORS[err.code];
  return {
    status: err.status,
    headers: { ...err.headers },
    unexpected,
    envelope: {
      error: {
        type: def.type,
        code: err.code,
        message: err.message,
        ...(err.param ? { param: err.param } : {}),
        doc_url: errorDocUrl(err.code),
        request_id: requestId as `req_${string}`,
      },
    },
  };
}
