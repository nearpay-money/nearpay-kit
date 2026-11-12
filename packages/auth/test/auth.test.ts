import { generateKeyPairSync } from "node:crypto";
import { createExecution, decideKyb } from "@nearpay-internal/spec";
import { advancePaymentAttempt, createApiKey, createCheckoutSession, listApiKeys } from "@nearpay-money/spec";
import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import {
  AuthError,
  authorizeRoute,
  type ClaimsInput,
  type InternalClaims,
  jwksCache,
  loadSigningKey,
  publicJwk,
  requireScope,
  serviceTokenClient,
  signInternalJwt,
  staticKeys,
  verifyInternalJwt,
} from "../src/index.js";

const pem = () => generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const key = loadSigningKey("k1", pem());
const other = loadSigningKey("k2", pem());
const NOW = 1_793_873_400;

type Base = ClaimsInput;
const merchant: Base = {
  sub: "key_01jbz9k3m4n5p6q7r8s9t0v1w2",
  acct: "acct_01jbz9k3m4n5p6q7r8s9t0v1w2",
  lm: false,
  ptype: "secret_key",
  scp: [],
  rid: "req_01jbz9k3m4n5p6q7r8s9t0v1w2",
};
const full = (c: Base): InternalClaims => ({ ...c, iss: "nearpay-identity", aud: "nearpay", iat: NOW, exp: NOW + 60 });

describe("internal JWT", () => {
  it("round-trips and validates claims against the spec", async () => {
    const t = await signInternalJwt(merchant, key, 60, NOW);
    const c = await verifyInternalJwt(t, staticKeys([key]), { now: NOW + 10 });
    expect(c).toMatchObject({ ...merchant, iss: "nearpay-identity", aud: "nearpay", iat: NOW, exp: NOW + 60 });
  });
  it("rejects expired, foreign, unknown-kid and malformed tokens", async () => {
    const t = await signInternalJwt(merchant, key, 60, NOW);
    await expect(verifyInternalJwt(t, staticKeys([key]), { now: NOW + 120 })).rejects.toBeInstanceOf(AuthError);
    await expect(verifyInternalJwt(t, staticKeys([other]), { now: NOW })).rejects.toThrow(/unknown key id/);
    const forged = await signInternalJwt(merchant, { kid: "k1", privateKey: other.privateKey }, 60, NOW);
    await expect(verifyInternalJwt(forged, staticKeys([key]), { now: NOW })).rejects.toThrow(/invalid token/);
    await expect(verifyInternalJwt("not.a.jwt", staticKeys([key]))).rejects.toThrow(/malformed/);
    const wrongAud = await new SignJWT({ ...merchant })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer("nearpay-identity")
      .setAudience("other")
      .setIssuedAt(NOW)
      .setExpirationTime(NOW + 60)
      .sign(key.privateKey);
    await expect(verifyInternalJwt(wrongAud, staticKeys([key]), { now: NOW })).rejects.toThrow(/invalid token/);
    const badClaims = await new SignJWT({ sub: "x", ptype: "wizard", scp: [] })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuer("nearpay-identity")
      .setAudience("nearpay")
      .setIssuedAt(NOW)
      .setExpirationTime(NOW + 60)
      .sign(key.privateKey);
    await expect(verifyInternalJwt(badClaims, staticKeys([key]), { now: NOW })).rejects.toThrow(/contract/);
  });
  it("loads only Ed25519 keys and publishes JWKs", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(() => loadSigningKey("r", rsa)).toThrow(/Ed25519/);
    expect(await publicJwk(key)).toMatchObject({ kty: "OKP", crv: "Ed25519", kid: "k1", alg: "EdDSA", use: "sig" });
  });
});

describe("JWKS cache", () => {
  it("caches, refetches on an unknown kid (rate-limited) and survives outages", async () => {
    let t = 0;
    let served = [await publicJwk(key)];
    const f = vi.fn(async () => Response.json({ keys: served })) as unknown as typeof fetch;
    const src = jwksCache({ url: "http://identity/internal/jwks", fetch: f, now: () => t, minRefetchMs: 10_000 });
    await src.getKey("k1");
    await src.getKey("k1");
    expect(f).toHaveBeenCalledTimes(1);
    served = [await publicJwk(key), await publicJwk(other)];
    await expect(src.getKey("k2")).rejects.toThrow(); // within minRefetch window
    t = 11_000;
    await expect(src.getKey("k2")).resolves.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(2);
    const down = vi.fn(async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    t = 1_000_000;
    const src2 = jwksCache({ url: "u", fetch: down, now: () => t });
    await expect(src2.getKey("k1")).rejects.toThrow(/JWKS unavailable/);
  });
  it("verifies tokens end to end through a fetched JWKS", async () => {
    const f = vi.fn(async () => Response.json({ keys: [await publicJwk(key)] })) as unknown as typeof fetch;
    const t = await signInternalJwt(merchant, key);
    await expect(verifyInternalJwt(t, jwksCache({ url: "u", fetch: f }))).resolves.toMatchObject({ sub: merchant.sub });
  });
});

describe("authorizeRoute (spec route definitions)", () => {
  it("lets secret keys and scoped restricted keys create sessions, nothing else", () => {
    expect(() => authorizeRoute(full(merchant), createCheckoutSession)).not.toThrow();
    expect(() =>
      authorizeRoute(
        full({ ...merchant, ptype: "restricted_key", scp: ["checkout_sessions.write"] }),
        createCheckoutSession,
      ),
    ).not.toThrow();
    expect(() =>
      authorizeRoute(
        full({ ...merchant, ptype: "restricted_key", scp: ["checkout_sessions.read"] }),
        createCheckoutSession,
      ),
    ).toThrow(/may not call/);
    expect(() => authorizeRoute(full({ ...merchant, ptype: "session", role: "owner" }), createCheckoutSession)).toThrow(
      /may not call/,
    );
    expect(() => authorizeRoute(full({ ...merchant, ptype: "publishable_key" }), createCheckoutSession)).toThrow(
      /may not call/,
    );
  });
  it("enforces roles and step-up for session routes", () => {
    const dev = full({ ...merchant, ptype: "session", role: "developer", step_up_until: NOW + 300 });
    expect(() => authorizeRoute(dev, createApiKey, NOW)).not.toThrow();
    expect(() => authorizeRoute({ ...dev, role: "viewer" }, createApiKey, NOW)).toThrow(/role viewer/);
    expect(() => authorizeRoute({ ...dev, step_up_until: NOW - 1 }, createApiKey, NOW)).toThrow(
      expect.objectContaining({ code: "step_up_required" }),
    );
    expect(() => authorizeRoute({ ...dev, step_up_until: undefined }, listApiKeys, NOW)).not.toThrow();
  });
  it("blocks live mode on test-mode-only routes", () => {
    expect(() => authorizeRoute(full({ ...merchant, lm: true }), advancePaymentAttempt)).toThrow(
      expect.objectContaining({ code: "livemode_forbidden" }),
    );
    expect(() => authorizeRoute(full(merchant), advancePaymentAttempt)).not.toThrow();
  });
  it("checks service and ops scopes on internal routes", () => {
    const svc = full({ sub: "payments", ptype: "service", scp: ["rails.executions.write"] });
    expect(() => authorizeRoute(svc, createExecution)).not.toThrow();
    expect(() => authorizeRoute({ ...svc, scp: ["rails.read"] }, createExecution)).toThrow(/may not call/);
    expect(() =>
      authorizeRoute(full({ sub: "usr_x", ptype: "ops", ops_role: "ops", scp: ["compliance.kyb.decide"] }), decideKyb),
    ).not.toThrow();
    expect(() =>
      authorizeRoute(full({ sub: "usr_x", ptype: "ops", scp: ["compliance.kyb.decide"] }), decideKyb),
    ).toThrow(/ops_role/);
    expect(() =>
      authorizeRoute(full({ sub: "payments", ptype: "service", scp: ["compliance.kyb.decide"] }), decideKyb),
    ).toThrow();
  });
  it("requireScope treats secret keys as holding every key scope", () => {
    expect(() => requireScope(full(merchant), "refunds.write")).not.toThrow();
    expect(() =>
      requireScope(full({ ...merchant, ptype: "restricted_key", scp: ["refunds.read"] }), "refunds.write"),
    ).toThrow(AuthError);
  });
});

describe("serviceTokenClient", () => {
  it("caches, shares one in-flight request, and refreshes in the background from exp − 60 s", async () => {
    let t = 1000;
    let n = 0;
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).authorization).toBe(
        `Basic ${Buffer.from("payments:s3cret").toString("base64")}`,
      );
      n += 1;
      return Response.json({ access_token: `tok${n}`, token_type: "Bearer", expires_in: 300 });
    }) as unknown as typeof fetch;
    const c = serviceTokenClient({
      identityUrl: "http://identity-api:8080/",
      clientId: "payments",
      secret: "s3cret",
      fetch: f,
      now: () => t,
    });
    const [a, b] = await Promise.all([c.getToken(), c.getToken()]);
    expect([a, b]).toEqual(["tok1", "tok1"]);
    t += 239;
    expect(await c.getToken()).toBe("tok1");
    expect(f).toHaveBeenCalledTimes(1);
    t += 1; // exp − 60 s: the caller is not kept waiting, the refresh runs behind it
    expect(await c.getToken()).toBe("tok1");
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => expect(await c.getToken()).toBe("tok2"));
    expect(f).toHaveBeenCalledTimes(2);
  });

  describe("identity outage (audit KIT-3)", () => {
    const setup = () => {
      let t = 10_000;
      let n = 0;
      let down = false;
      const failing = vi.fn();
      const recovered = vi.fn();
      const f = vi.fn(async () => {
        if (down) throw new TypeError("fetch failed");
        n += 1;
        return Response.json({ access_token: `tok${n}`, token_type: "Bearer", expires_in: 300 });
      }) as unknown as typeof fetch;
      const c = serviceTokenClient({
        identityUrl: "http://identity-api:8080",
        clientId: "rails",
        secret: "s",
        fetch: f,
        now: () => t,
        random: () => 0.5,
        onRefreshFailing: failing,
        onRefreshRecovered: recovered,
      });
      return {
        c,
        f: f as unknown as ReturnType<typeof vi.fn>,
        failing,
        recovered,
        at: (s: number) => {
          t = 10_000 + s;
        },
        setDown: (d: boolean) => {
          down = d;
        },
        settle: () => new Promise((r) => setTimeout(r, 0)),
      };
    };

    it("serves the cached token past its refresh point while identity is down, until exp − 5 s", async () => {
      const x = setup();
      expect(await x.c.getToken()).toBe("tok1");
      x.setDown(true);
      x.at(240); // refresh point: background refresh fails, the caller still gets the valid token
      expect(await x.c.getToken()).toBe("tok1");
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(2);
      expect(x.failing).toHaveBeenCalledTimes(1);
      expect(x.failing.mock.calls[0]?.[1]).toEqual({ clientId: "rails", consecutive: 1, usableForSeconds: 55 });
      x.at(294); // exp − 6 s: still usable
      expect(await x.c.getToken()).toBe("tok1");
      await x.settle();
      x.at(295); // exp − 5 s: no usable token any more, the caller sees identity's error
      await expect(x.c.getToken()).rejects.toThrow(/fetch failed/);
      expect(x.failing).toHaveBeenCalledTimes(1); // logged once per streak
    });

    it("retries the background refresh with back-off, not on every call", async () => {
      const x = setup();
      await x.c.getToken();
      x.setDown(true);
      x.at(240);
      await x.c.getToken();
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(2); // 1st failure → next attempt ≥ 1 s later
      await x.c.getToken();
      await x.c.getToken();
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(2);
      x.at(241);
      await x.c.getToken();
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(3); // 2nd failure → 2 s
      x.at(242);
      await x.c.getToken();
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(3);
      x.at(243);
      await x.c.getToken();
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(4); // 3rd failure → 4 s
      x.at(246);
      await x.c.getToken();
      await x.settle();
      expect(x.f).toHaveBeenCalledTimes(4);
    });

    it("a later success replaces the cached token and reports recovery", async () => {
      const x = setup();
      await x.c.getToken();
      x.setDown(true);
      x.at(250);
      expect(await x.c.getToken()).toBe("tok1");
      await x.settle();
      x.setDown(false);
      x.at(260);
      expect(await x.c.getToken()).toBe("tok1"); // served at once; the refresh succeeds behind it
      await x.settle();
      await vi.waitFor(async () => expect(await x.c.getToken()).toBe("tok2"));
      expect(x.recovered).toHaveBeenCalledWith({ clientId: "rails", failures: 1 });
      x.at(260 + 239);
      expect(await x.c.getToken()).toBe("tok2"); // the new token's own refresh point is 240 s after issue
    });

    it("without a usable token, a failure is thrown at once (no stale token is ever returned)", async () => {
      const x = setup();
      x.setDown(true);
      await expect(x.c.getToken()).rejects.toThrow(/fetch failed/);
      expect(x.failing.mock.calls[0]?.[1]).toMatchObject({ usableForSeconds: 0 });
      x.setDown(false);
      expect(await x.c.getToken()).toBe("tok1");
    });
  });

  it("reports rejected credentials as invalid_client", async () => {
    const f = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(
      serviceTokenClient({ identityUrl: "u", clientId: "x", secret: "y", fetch: f }).getToken(),
    ).rejects.toMatchObject({ code: "invalid_client" });
    expect(() => serviceTokenClient({ identityUrl: "u", clientId: "x" })).toThrow(/secret/);
  });
});
