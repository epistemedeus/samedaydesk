#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { parseMountedDatabaseUrl, parseMountedPgSchema, quoteIdent } from "@neomorphic/correspondence";

const files = [
  new URL("../../vendor/neomorphic-correspondence/migrations/visitor-work-cells/001_vf02_work_cells.sql", import.meta.url),
  new URL("../../vendor/neomorphic-correspondence/migrations/visitor-foundry/001_vf04_integration.sql", import.meta.url),
  new URL("../../vendor/neomorphic-correspondence/migrations/visitor-foundry/002_vf04_wire.sql", import.meta.url),
];

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://<redacted>");
}

if (process.argv[2] !== "--apply") {
  console.error("explicit --apply required; the listener and worker do not migrate");
  process.exit(1);
}

const databaseUrl = process.env.CORRESPONDENCE_DATABASE_URL;
if (!databaseUrl) {
  console.error("CORRESPONDENCE_DATABASE_URL is required for namespaced migration");
  process.exit(1);
}

let url;
let schema;
try {
  url = parseMountedDatabaseUrl(databaseUrl);
  schema = parseMountedPgSchema(process.env.CORRESPONDENCE_PG_SCHEMA);
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  application_name: "sds_foundry_migrate",
});

try {
  await client.connect();
  const base = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'correspondence_projects'",
    [schema],
  );
  if (base.rowCount !== 1) {
    throw new Error("base correspondence migration is required before additive foundry migrations");
  }
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`vf04:migration:${schema}`]);
    await client.query(`SET LOCAL search_path TO ${quoteIdent(schema)}`);
    for (const file of files) await client.query(await readFile(file, "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  console.log(`foundry additive migration applied schema=${schema}`);
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
