#!/usr/bin/env node
// Explicit private installer. Importing this module does not migrate or install.
import { PostgresStore } from "@neomorphic/correspondence";
import { parseMountedDatabaseUrl, parseMountedPgSchema } from "../../vendor/visitor-foundry-receiver/services/correspondence/dist/config.js";
import { openEntryFacade, closeEntryThenBase } from "./compose.js";
import { readPrivateJson } from "./private-files.js";
import { REUSE_CLASS, reusesProductDataService } from "./product-isolation.js";

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://<redacted>");
}

function fail(code, error) {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exit(code);
}

const migrate = process.argv.includes("--migrate");
const install = process.argv.includes("--install");
if (!migrate) fail(1, "explicit --migrate required; the listener and worker do not migrate");

const databaseUrl = process.env.CORRESPONDENCE_DATABASE_URL;
if (!databaseUrl) fail(1, "CORRESPONDENCE_DATABASE_URL is required for namespaced migration");
if (reusesProductDataService(databaseUrl, { supabaseUrl: process.env.SUPABASE_URL })) fail(2, REUSE_CLASS);

let url;
let schema;
try {
  url = parseMountedDatabaseUrl(databaseUrl);
  schema = parseMountedPgSchema(process.env.CORRESPONDENCE_PG_SCHEMA);
} catch (error) {
  fail(1, error);
}

if (install) {
  const profileFile = String(process.env.FOUNDRY_PRIVATE_PROFILE_FILE || "").trim();
  if (!profileFile) fail(2, "FOUNDRY_PRIVATE_PROFILE_FILE is required to install");
}

const store = new PostgresStore(url, { schema, poolMax: 1 });
let mounted = null;
try {
  await store.migrate();
  const config = {
    databaseUrl: url,
    pgSchema: schema,
    adminToken: "installer-does-not-serve",
    store: "postgres",
    bodyLimitBytes: 524288,
    rateLimitWindowMs: 60000,
    rateLimitMax: 120,
    corsOrigins: [],
    trustProxyHops: 0,
    poolMax: 1,
    port: 0,
  };
  const opened = await openEntryFacade({ store, config, env: process.env });
  mounted = opened.mounted;
  await mounted.extension.cells.migrate();
  await mounted.extension.integration.migrate();
  await mounted.entry.migrate();
  await mounted.receiver.migrate();
  if (install) {
    const originalOptions = readPrivateJson(process.env.FOUNDRY_PRIVATE_PROFILE_FILE);
    mounted.entry.receiver = null;
    const original = await mounted.entry.install(originalOptions);
    mounted.entry.receiver = mounted.receiver;
    const contribution = await mounted.entry.enableContribution({
      expectedTerms: original.termsHash,
      id: "vf10:contribution-v2",
      binding: mounted.receiver.binding(),
    });
    const status = await mounted.receiver.status();
    const row = await mounted.entry.tx((c) => c.query(
      "SELECT charged, max_enrollments, receiver_id, active_receiver_id FROM correspondence_vf10_installation WHERE singleton",
    ));
    console.log(JSON.stringify({
      ok: true,
      migrated: true,
      installed: true,
      schema,
      charged: row.rows[0].charged,
      maxEnrollments: row.rows[0].max_enrollments,
      receiverId: row.rows[0].active_receiver_id,
      termsHash: original.termsHash,
      contributionProfileId: contribution.profileId,
      configId: status.config.configId,
      maxAdmissions: status.config.maxAdmissions,
      maxPhysical: status.config.maxPhysical,
    }));
  } else {
    console.log(JSON.stringify({ ok: true, migrated: true, installed: false, schema }));
  }
} catch (error) {
  fail(1, error);
} finally {
  await closeEntryThenBase(mounted, store).catch(() => {});
}
