/**
 * Service databases provisioned like nearpay-deploy's `postgres-init` (compose/init/postgres/roles.sh):
 * `<svc>_migrator` owns the database (DDL), `<svc>_app` gets CONNECT + DML on what the migrator creates
 * (default privileges), CONNECT is revoked from PUBLIC. Integration tests migrate as the migrator and
 * run the service as the app role, so a migration that relies on owner rights fails in CI, not in
 * Compose.
 */
import pg from "pg";

export interface ServiceDatabase {
  readonly name: string;
  /** Migrator (owner) URL — run migrations with it. */
  readonly migratorUrl: string;
  /** App role URL — run the service with it. */
  readonly appUrl: string;
  /** Superuser URL of the same database (test assertions that bypass the app role). */
  readonly adminUrl: string;
  /** Login URL of an extra role created with `roles` (e.g. `sentinel_ro`). */
  roleUrl(role: string): string;
}

const IDENT = /^[a-z][a-z0-9_]{0,40}$/;

function withDb(url: string, db: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user !== undefined) u.username = user;
  if (password !== undefined) u.password = password;
  return u.toString();
}

/**
 * Creates database `name` (default `service`) with migrator/app roles. `roles` are extra login roles
 * created before any migration runs (identity's migration grants `sentinel_ro`).
 */
export async function provisionServiceDatabase(
  adminUrl: string,
  service: string,
  o: { name?: string; roles?: readonly string[] } = {},
): Promise<ServiceDatabase> {
  const name = o.name ?? service;
  for (const id of [service, name, ...(o.roles ?? [])]) {
    if (!IDENT.test(id)) throw new RangeError(`invalid identifier: ${id}`);
  }
  const migrator = `${service}_migrator`;
  const app = `${service}_app`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const role of [migrator, app, ...(o.roles ?? [])]) {
      const exists = await admin.query("select 1 from pg_roles where rolname = $1", [role]);
      if (exists.rowCount === 0) await admin.query(`create role ${role} login password '${role}'`);
    }
    await admin.query(`create database ${name} owner ${migrator}`);
    await admin.query(`revoke all on database ${name} from public`);
    await admin.query(`grant connect, temporary on database ${name} to ${app}`);
  } finally {
    await admin.end();
  }
  const db = new pg.Client({ connectionString: withDb(adminUrl, name) });
  await db.connect();
  try {
    await db.query("revoke create on schema public from public");
    await db.query(`grant usage on schema public to ${app}`);
    await db.query(
      `alter default privileges for role ${migrator} in schema public grant select, insert, update, delete on tables to ${app}`,
    );
    await db.query(
      `alter default privileges for role ${migrator} in schema public grant usage, select, update on sequences to ${app}`,
    );
  } finally {
    await db.end();
  }
  return {
    name,
    migratorUrl: withDb(adminUrl, name, migrator, migrator),
    appUrl: withDb(adminUrl, name, app, app),
    adminUrl: withDb(adminUrl, name),
    roleUrl: (role) => withDb(adminUrl, name, role, role),
  };
}
