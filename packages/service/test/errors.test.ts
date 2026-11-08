import { ErrorEnvelope } from "@nearpay/spec";
import { AuthError } from "@nearpay-internal/auth";
import { IdempotencyConflict } from "@nearpay-internal/db";
import { HttpError } from "@nearpay-internal/http";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, fromZodError, paramName, parseQuery, toErrorResponse } from "../src/index.js";

const RID = "req_01jbz9k3m4n5p6q7r8s9t0v1w2";

describe("parseQuery", () => {
  it("collects `k[]` lists, keeps bracketed filters flat and repeats as arrays", () => {
    expect(parseQuery("?expand[]=payment_intent&expand[]=x&limit=2&created[gte]=10&a=1&a=2&e%5B%5D=enc")).toEqual({
      expand: ["payment_intent", "x"],
      limit: "2",
      "created[gte]": "10",
      a: ["1", "2"],
      e: ["enc"],
    });
    expect(parseQuery("")).toEqual({});
    expect(parseQuery("?")).toEqual({});
  });

  it("ignores prototype keys", () => {
    const q = parseQuery("__proto__=x&constructor=y&[]=z&ok=1");
    expect(q).toEqual({ ok: "1" });
    expect(Object.getPrototypeOf(q)).toBe(Object.prototype);
  });
});

describe("paramName / fromZodError", () => {
  it("uses the API's bracket notation", () => {
    expect(paramName(["amount"])).toBe("amount");
    expect(paramName(["destination", "address"])).toBe("destination[address]");
    expect(paramName(["items", 0, "price"])).toBe("items[0][price]");
  });

  it("maps the first issue to invalid_request with its parameter", () => {
    const s = z.strictObject({ amount: z.int(), meta: z.strictObject({ k: z.string() }).optional() });
    const bad = fromZodError(s.safeParse({ amount: "1" }).error as z.ZodError);
    expect(bad.code).toBe("invalid_request");
    expect(bad.param).toBe("amount");
    expect(bad.message).toMatch(/^The request is invalid: amount: /);
    const unknown = fromZodError(s.safeParse({ amount: 1, meta: { k: "a", x: 1 } }).error as z.ZodError);
    expect(unknown.param).toBe("meta[x]");
    expect(unknown.message).toBe("The request is invalid: unknown parameter meta[x]");
    const header = fromZodError(z.strictObject({}).safeParse({ x: 1 }).error as z.ZodError, "header");
    expect(header.message).toBe("The request is invalid: unknown header x");
  });
});

describe("toErrorResponse", () => {
  const valid = (m: ReturnType<typeof toErrorResponse>) => {
    expect(ErrorEnvelope.parse(m.envelope)).toBeTruthy();
    return m;
  };

  it("renders catalogue errors with status, type, doc url and request id", () => {
    const m = valid(
      toErrorResponse(
        new ApiError("amount_below_destination_minimum", { message: "Too small.", param: "amount" }),
        RID,
      ),
    );
    expect(m.status).toBe(422);
    expect(m.envelope.error).toEqual({
      type: "invalid_request_error",
      code: "amount_below_destination_minimum",
      message: "Too small.",
      param: "amount",
      doc_url: "https://docs.nearpay.money/errors/amount_below_destination_minimum",
      request_id: RID,
    });
    expect(m.unexpected).toBe(false);
    expect(valid(toErrorResponse(ApiError.missing("checkout_session", "cs_1"), RID)).envelope.error.message).toBe(
      "No such checkout_session: cs_1",
    );
  });

  it("maps authentication and idempotency failures", () => {
    expect(valid(toErrorResponse(new AuthError("step_up_required", "x"), RID)).status).toBe(401);
    const denied = valid(toErrorResponse(new AuthError("permission_denied", "ops role ops may not call x"), RID));
    expect(denied.status).toBe(403);
    // no unrendered `{placeholder}` and no internal detail in the public message
    expect(denied.envelope.error.message).toBe("This credential is not allowed to perform this action.");
    expect(valid(toErrorResponse(new AuthError("authentication_required", "x"), RID)).status).toBe(401);
    const busy = valid(toErrorResponse(new IdempotencyConflict("idempotency_in_progress"), RID));
    expect([busy.status, busy.headers["Retry-After"], busy.envelope.error.type]).toEqual([
      409,
      "1",
      "idempotency_error",
    ]);
    expect(valid(toErrorResponse(new IdempotencyConflict("idempotency_key_reused"), RID)).envelope.error.code).toBe(
      "idempotency_key_reused",
    );
  });

  it("hides unexpected errors behind api_error", () => {
    const m = valid(toErrorResponse(new Error("db password is hunter2"), RID));
    expect(m.status).toBe(500);
    expect(m.unexpected).toBe(true);
    expect(JSON.stringify(m.envelope)).not.toContain("hunter2");
  });

  it("re-raises upstream NearPay errors deliberately", () => {
    const up = new HttpError(
      422,
      {
        type: "invalid_request_error",
        code: "route_too_slow",
        message: "Too slow.",
        param: "asset_id",
        doc_url: "https://docs.nearpay.money/errors/route_too_slow",
        request_id: RID,
      },
      {},
      "rails",
      3,
    );
    const e = ApiError.fromUpstream(up);
    expect([e.code, e.status, e.message, e.param, e.headers["Retry-After"]]).toEqual([
      "route_too_slow",
      422,
      "Too slow.",
      "asset_id",
      "3",
    ]);
    expect(ApiError.fromUpstream(new HttpError(502, null, "bad gateway", "rails")).code).toBe("api_error");
  });
});
