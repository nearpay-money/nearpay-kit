/**
 * Ops (console) principals — spec 0.2.0 `visibility: "ops"`, `opsRoles`, `ops_role` (foundations §9).
 */
import {
  type AnyRoute,
  KEY_SCOPES,
  OPS_ROLE_SCOPES,
  OPS_ROLES,
  OPS_SCOPES,
  type OpsRole,
  PRINCIPAL_TYPES,
  type PrincipalType,
  PUBLIC_ROUTES,
  type RouteAuth,
  SERVICE_SCOPES,
} from "@nearpay/spec";
import {
  approveOpsKillSwitchRelease,
  decideKyb,
  decideOpsKybCase,
  INTERNAL_ROUTES,
  listEvidence,
  listOpsCases,
  OPS_ROUTES,
  opsPasskeyAuthenticationOptions,
  removeOpsBlocklistEntry,
} from "@nearpay-internal/spec";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AuthError, type AuthorizableRoute, authorizeRoute, type InternalClaims } from "../src/index.js";

const NOW = 1_793_873_400;
const claims = (c: Partial<InternalClaims> & Pick<InternalClaims, "ptype">): InternalClaims => ({
  sub: "usr_01jbz9k3m4n5p6q7r8s9t0v1w2",
  scp: [],
  iss: "nearpay-identity",
  aud: "nearpay",
  iat: NOW,
  exp: NOW + 60,
  ...c,
});
const op = (role: OpsRole, over: Partial<InternalClaims> = {}) =>
  claims({ ptype: "ops", ops_role: role, scp: [...OPS_ROLE_SCOPES[role]], step_up_until: NOW + 300, ...over });
const code = (f: () => void): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    if (e instanceof AuthError) return e.code;
    throw e;
  }
};

describe("ops principals on spec routes", () => {
  it("admits an operator whose role is in opsRoles and who holds the scope", () => {
    expect(code(() => authorizeRoute(op("ops"), listOpsCases, NOW))).toBeNull();
    expect(code(() => authorizeRoute(op("ops_admin"), listOpsCases, NOW))).toBeNull();
    expect(code(() => authorizeRoute(op("ops_admin"), removeOpsBlocklistEntry, NOW))).toBeNull();
  });
  it("refuses roles outside opsRoles (ops_admin-only routes)", () => {
    expect(removeOpsBlocklistEntry.opsRoles).toEqual(["ops_admin"]);
    expect(code(() => authorizeRoute(op("ops"), removeOpsBlocklistEntry, NOW))).toBe("permission_denied");
    expect(code(() => authorizeRoute(op("ops"), approveOpsKillSwitchRelease, NOW))).toBe("permission_denied");
  });
  it("refuses an operator without the route's scope, or whose role is not granted it", () => {
    const scope = (listOpsCases.auth[0] as string).slice("ops:".length);
    const without = OPS_SCOPES.filter((s) => s !== scope);
    expect(code(() => authorizeRoute(op("ops", { scp: without }), listOpsCases, NOW))).toBe("permission_denied");
    expect(code(() => authorizeRoute(op("ops", { scp: [] }), listOpsCases, NOW))).toBe("permission_denied");
  });
  it("requires a fresh step-up on stepUp routes, like sessions", () => {
    expect(decideOpsKybCase.stepUp).toBe(true);
    expect(code(() => authorizeRoute(op("ops"), decideOpsKybCase, NOW))).toBeNull();
    expect(code(() => authorizeRoute(op("ops", { step_up_until: NOW }), decideOpsKybCase, NOW))).toBe(
      "step_up_required",
    );
    expect(code(() => authorizeRoute(op("ops", { step_up_until: undefined }), decideOpsKybCase, NOW))).toBe(
      "step_up_required",
    );
    // a route without stepUp does not need one
    expect(code(() => authorizeRoute(op("ops", { step_up_until: undefined }), listOpsCases, NOW))).toBeNull();
    // the role check comes before step-up: an `ops` operator never learns it could step up
    expect(code(() => authorizeRoute(op("ops", { step_up_until: undefined }), removeOpsBlocklistEntry, NOW))).toBe(
      "permission_denied",
    );
  });
  it("fails closed on a missing or unknown ops_role", () => {
    expect(code(() => authorizeRoute(op("ops", { ops_role: undefined }), listOpsCases, NOW))).toBe("permission_denied");
    expect(code(() => authorizeRoute(op("ops", { ops_role: "root" as unknown as OpsRole }), listOpsCases, NOW))).toBe(
      "permission_denied",
    );
    expect(
      code(() => authorizeRoute(op("ops", { ops_role: "__proto__" as unknown as OpsRole }), listOpsCases, NOW)),
    ).toBe("permission_denied");
  });
  it("refuses every non-ops principal on ops routes, even holding the same scope strings", () => {
    for (const ptype of PRINCIPAL_TYPES.filter((p) => p !== "ops")) {
      const c = claims({ ptype, scp: [...OPS_SCOPES, ...SERVICE_SCOPES], role: "owner", step_up_until: NOW + 300 });
      expect(code(() => authorizeRoute(c, listOpsCases, NOW))).toBe("permission_denied");
    }
  });
  it("refuses ops principals on routes without an ops entry; admits them where the route lists one", () => {
    const createApiKeyRoute = PUBLIC_ROUTES.find((r) => r.id === "createApiKey") as AnyRoute;
    expect(code(() => authorizeRoute(op("ops_admin"), createApiKeyRoute, NOW))).toBe("permission_denied");
    const serviceOnly = INTERNAL_ROUTES.find((r) => r.id === "createExecution") as AnyRoute;
    expect(code(() => authorizeRoute(op("ops_admin"), serviceOnly, NOW))).toBe("permission_denied");
    // listEvidence: `service:rails.read` | `ops:rails.read`, no opsRoles
    expect(listEvidence.visibility).toBe("internal");
    expect(code(() => authorizeRoute(op("ops"), listEvidence, NOW))).toBeNull();
    // decideKyb (internal) declares opsRoles: still checked
    expect(code(() => authorizeRoute(op("ops"), decideKyb, NOW))).toBeNull();
    expect(code(() => authorizeRoute(op("ops"), { ...decideKyb, opsRoles: ["ops_admin"] }, NOW))).toBe(
      "permission_denied",
    );
  });
  it("refuses ops_role on any other principal type", () => {
    const svc = claims({ ptype: "service", scp: ["rails.read"], ops_role: "ops_admin" });
    expect(code(() => authorizeRoute(svc, listEvidence, NOW))).toBe("permission_denied");
    expect(code(() => authorizeRoute({ ...svc, ops_role: undefined }, listEvidence, NOW))).toBeNull();
  });
  it("refuses an ops route that declares no opsRoles (fail closed)", () => {
    const { opsRoles: _r, ...bare } = listOpsCases;
    expect(code(() => authorizeRoute(op("ops_admin"), bare as AuthorizableRoute, NOW))).toBe("permission_denied");
  });
  it("lets anonymous sign-in routes stay anonymous", () => {
    expect(opsPasskeyAuthenticationOptions.auth).toEqual(["anonymous"]);
    expect(code(() => authorizeRoute(claims({ ptype: "anonymous" }), opsPasskeyAuthenticationOptions, NOW))).toBeNull();
    expect(code(() => authorizeRoute(op("ops"), opsPasskeyAuthenticationOptions, NOW))).toBe("permission_denied");
  });
  it("matches every real ops route: allowed exactly for its roles, scope and step-up", () => {
    for (const r of OPS_ROUTES) {
      const scopes = r.auth.filter((a) => a.startsWith("ops:")).map((a) => a.slice(4));
      if (scopes.length === 0) continue; // anonymous sign-in
      for (const role of OPS_ROLES) {
        const expected = r.opsRoles?.includes(role) ? null : "permission_denied";
        expect([r.id, role, code(() => authorizeRoute(op(role), r, NOW))]).toEqual([r.id, role, expected]);
        if (r.stepUp && expected === null) {
          expect(code(() => authorizeRoute(op(role, { step_up_until: NOW - 1 }), r, NOW))).toBe("step_up_required");
        }
        expect(
          code(() => authorizeRoute(op(role, { scp: OPS_SCOPES.filter((s) => !scopes.includes(s)) }), r, NOW)),
        ).toBe("permission_denied");
      }
    }
  });
});

// ---- properties ----------------------------------------------------------------------------------

const ALL_SCOPES = [...new Set<string>([...OPS_SCOPES, ...SERVICE_SCOPES, ...KEY_SCOPES, "checkout:public", "x.y"])];
const AUTH_ENTRIES: string[] = [
  "anonymous",
  "secret_key",
  "publishable_key",
  "client_secret",
  "session",
  "gateway",
  "internal",
  "service_client",
  ...KEY_SCOPES.slice(0, 4).map((s) => `restricted_key:${s}`),
  ...SERVICE_SCOPES.map((s) => `service:${s}`),
  ...OPS_SCOPES.map((s) => `ops:${s}`),
];

const roleArb = fc.oneof(
  fc.constantFrom<OpsRole | undefined>(...OPS_ROLES, undefined),
  fc.constantFrom("root", "admin", "owner", "", "constructor", "__proto__").map((s) => s as unknown as OpsRole),
);
const claimsArb = fc.record({
  ptype: fc.constantFrom<PrincipalType>(...PRINCIPAL_TYPES),
  ops_role: roleArb,
  scp: fc.subarray(ALL_SCOPES),
  step_up_until: fc.option(fc.integer({ min: NOW - 1_000, max: NOW + 1_000 }), { nil: undefined }),
  role: fc.option(fc.constantFrom("owner" as const, "viewer" as const), { nil: undefined }),
  lm: fc.option(fc.boolean(), { nil: undefined }),
});
const syntheticRouteArb: fc.Arbitrary<AuthorizableRoute> = fc.record({
  id: fc.constant("synthetic"),
  visibility: fc.option(fc.constantFrom<"public" | "internal" | "ops">("public", "internal", "ops"), {
    nil: undefined,
  }),
  auth: fc.subarray(AUTH_ENTRIES, { minLength: 1, maxLength: 4 }).map((a) => a as RouteAuth[]),
  opsRoles: fc.option(fc.subarray([...OPS_ROLES]), { nil: undefined }),
  roles: fc.option(fc.constant(["owner" as const]), { nil: undefined }),
  stepUp: fc.option(fc.boolean(), { nil: undefined }),
  testModeOnly: fc.option(fc.boolean(), { nil: undefined }),
});
const realRoutes = [...new Map([...INTERNAL_ROUTES, ...PUBLIC_ROUTES].map((r) => [r.id, r])).values()];
const routeArb = fc.oneof(syntheticRouteArb, fc.constantFrom<AuthorizableRoute>(...realRoutes));

/** The rules, stated independently of the implementation. */
function opsRulesAllow(c: InternalClaims, r: AuthorizableRoute): boolean {
  const role = c.ops_role;
  if (role !== "ops" && role !== "ops_admin") return false;
  const scopeOk = r.auth.some(
    (a) => a.startsWith("ops:") && c.scp.includes(a.slice(4)) && OPS_ROLE_SCOPES[role].includes(a.slice(4) as never),
  );
  const rolesOk = r.opsRoles ? r.opsRoles.includes(role) : r.visibility !== "ops";
  const stepOk = !r.stepUp || (c.step_up_until !== undefined && c.step_up_until > NOW);
  const modeOk = !(r.testModeOnly && c.lm === true);
  return scopeOk && rolesOk && stepOk && modeOk;
}

describe("ops authorization properties", () => {
  it("never grants access outside the rules (random principals × random and real routes)", () => {
    fc.assert(
      fc.property(claimsArb, routeArb, (raw, r) => {
        const c = claims(raw);
        const granted = code(() => authorizeRoute(c, r, NOW)) === null;
        if (!granted) return;
        if (c.ptype === "ops") {
          expect(opsRulesAllow(c, r)).toBe(true);
        } else {
          expect(c.ops_role).toBeUndefined();
          // no non-ops principal ever gets in through an ops: entry or onto an ops route
          if (r.visibility === "ops") expect(c.ptype).toBe("anonymous");
          if (r.visibility === "ops") expect(r.auth).toContain("anonymous");
        }
      }),
      { numRuns: 3_000 },
    );
  });
  it("grants an ops principal exactly when the rules allow", () => {
    fc.assert(
      fc.property(claimsArb, routeArb, (raw, r) => {
        const c = claims({ ...raw, ptype: "ops" });
        expect(code(() => authorizeRoute(c, r, NOW)) === null).toBe(opsRulesAllow(c, r));
      }),
      { numRuns: 3_000 },
    );
  });
  it("an ops scope string grants a non-ops principal nothing it did not already have", () => {
    fc.assert(
      fc.property(claimsArb, syntheticRouteArb, (raw, r) => {
        const c = claims({ ...raw, ops_role: undefined });
        if (c.ptype === "ops") return;
        const opsOnly = { ...r, auth: r.auth.filter((a) => a.startsWith("ops:")) };
        if (opsOnly.auth.length === 0) return;
        expect(code(() => authorizeRoute(c, opsOnly, NOW))).not.toBeNull();
      }),
      { numRuns: 2_000 },
    );
  });
});
