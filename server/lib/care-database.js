import { lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import pg from "pg";

export function careSchema(env = process.env) {
  const schema = env.SDS_CARE_SCHEMA || (env.SDS_PRIVATE_PREVIEW === "1" ? "public" : "");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema) || schema.startsWith("pg_") ||
      ["information_schema", "auth", "storage", "extensions"].includes(schema) ||
      (schema === "public" && env.SDS_PRIVATE_PREVIEW !== "1")) {
    throw new Error("Set SDS_CARE_SCHEMA to a dedicated private schema");
  }
  return schema;
}

export const careTables = ["task_requests", "care_orders", "care_periods", "care_period_holds",
  "care_mail", "task_quotes", "journey_events", "mail_events", "hosted_orders"];

export function careTable(table, schema = careSchema()) {
  // Identifiers cannot be query parameters. Accept only validated schema and known table names.
  careSchema({ SDS_CARE_SCHEMA: schema, SDS_PRIVATE_PREVIEW: "1" });
  if (!careTables.includes(table)) throw new Error("Unknown Care table");
  return `"${schema}"."${table}"`;
}

export function careDatabaseOptions(env = process.env) {
  if (!env.SDS_CARE_DATABASE_URL) return null;
  careSchema(env);
  const url = new URL(env.SDS_CARE_DATABASE_URL);
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname ||
      ["sslmode", "ssl", "sslrootcert", "sslkey", "sslcert"].some((name) => url.searchParams.has(name))) {
    throw new Error("Use a PostgreSQL connection without URL TLS overrides for SameDayDesk care");
  }
  const preview = env.SDS_PRIVATE_PREVIEW === "1";
  if (preview && url.hostname !== "127.0.0.1") throw new Error("Use an isolated loopback database for care preview");
  for (const key of url.searchParams.keys()) {
    if (!preview || !["host", "port"].includes(key) || url.searchParams.getAll(key).length !== 1) throw new Error("Unexpected Care database URL option");
  }
  if (url.searchParams.has("host")) {
    const socket = url.searchParams.get("host");
    const stat = isAbsolute(socket) && lstatSync(socket);
    if (!stat?.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid()) {
      throw new Error("Care preview socket requires a private directory owned by this worker user");
    }
  }
  if (!preview && !env.SDS_CARE_DATABASE_CA_BASE64) throw new Error("Care database requires its verified TLS CA");
  const ssl = preview ? false : { rejectUnauthorized: true, ca: Buffer.from(env.SDS_CARE_DATABASE_CA_BASE64, "base64").toString("utf8") };
  return { connectionString: url.href, ssl, max: 3, connectionTimeoutMillis: 4000 };
}

let sharedPool;
export function sharedCarePool(env = process.env) {
  if (!env.SDS_CARE_DATABASE_URL) {
    if (env.SDS_CARE_SCHEMA) throw new Error("Care storage requires its configured database");
    return null;
  }
  careSchema(env);
  sharedPool ??= new pg.Pool({ ...careDatabaseOptions(env), max: 1,
    idleTimeoutMillis: 1000, allowExitOnIdle: true });
  return sharedPool;
}

export async function closeSharedCarePool() {
  const pool = sharedPool;
  sharedPool = undefined;
  if (pool) await pool.end();
}
