#!/usr/bin/env node
// Explicit private installer. Importing this module does not migrate or install.
import { fileURLToPath } from "node:url";
import { PostgresStore } from "@neomorphic/correspondence";
import { parseMountedDatabaseUrl, parseMountedPgSchema } from "../../vendor/visitor-foundry-receiver/services/correspondence/dist/config.js";
import { openEntryFacade, closeEntryThenBase } from "./compose.js";
import { materializeReferenceRuntime } from "./materialize-runtime.mjs";
import { verifiedFoundryDatabaseUrl } from "./pg-tls.js";
import { materializePrivateProfiles, PROFILE_JSON_KEYS } from "./private-materialize.js";
import { readPrivateJson } from "./private-files.js";
import { REUSE_CLASS, reusesProductDataService } from "./product-isolation.js";
import { inspectInstallation, receiveUnconsumed } from "../../vendor/visitor-foundry-receiver/scripts/visitor-foundry/integration/entry/receive.mjs";

function fail(code, error) {
  const value = error?.code || (typeof error === "string" && /^[a-z_]+$/.test(error) ? error : "installer_failed");
  console.error(JSON.stringify({ ok: false, code: value }));
  process.exitCode = code;
}

const migrate = process.argv.includes("--migrate");
const install = process.argv.includes("--install");
const inspect = process.argv.includes("--inspect-installation");
const receive = process.argv.includes("--receive-unconsumed");
if ((!migrate && !inspect) || (inspect && (migrate || install || receive)) || (receive && !install)) {
  fail(2, "installer_arguments_invalid"); process.exit(process.exitCode);
}
if (receive && ![process.env.FOUNDRY_RECEIVE_EXPECTED_HOST_CONFIG_ID, process.env.FOUNDRY_RECEIVE_EXPECTED_ENTRY_TERMS_HASH]
  .every(value => /^sha256:[a-f0-9]{64}$/.test(value ?? ''))) {
  fail(2, "receiving_expected_identity_required"); process.exit(process.exitCode);
}

const databaseUrl = process.env.CORRESPONDENCE_DATABASE_URL;
if (!databaseUrl) { console.error('CORRESPONDENCE_DATABASE_URL is required'); process.exit(1); }
if (reusesProductDataService(databaseUrl, { supabaseUrl: process.env.SUPABASE_URL })) { fail(2, REUSE_CLASS); process.exit(process.exitCode); }

let url;
let schema;
try {
  url = parseMountedDatabaseUrl(databaseUrl);
  schema = parseMountedPgSchema(process.env.CORRESPONDENCE_PG_SCHEMA);
} catch (error) {
  fail(2, error); process.exit(process.exitCode);
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
try {
  const materialized = materializePrivateProfiles(process.env, { repoRoot });
  for (const key of PROFILE_JSON_KEYS) delete process.env[key];
  Object.assign(process.env, materialized.assigned);
} catch (error) {
  fail(2, error.code || error); process.exit(process.exitCode);
}
if (install) {
  const profileFile = String(process.env.FOUNDRY_PRIVATE_PROFILE_FILE || "").trim();
  if (!profileFile) { fail(2, "private_profile_required"); process.exit(process.exitCode); }
}
try {
  url = verifiedFoundryDatabaseUrl(url);
  if (process.env.FOUNDRY_EXECUTION_RUNTIME) throw Object.assign(new Error("runtime_selection_unsupported"), { code: "runtime_selection_unsupported" });
  if (install) await materializeReferenceRuntime();
} catch (error) { fail(2, error.code || "runtime_setup_failed"); process.exit(process.exitCode); }

const store = new PostgresStore(url, { schema, poolMax: 1 });
let mounted = null;
try {
  if (migrate) await store.migrate();
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
  if (migrate) {
    await mounted.extension.cells.migrate();
    await mounted.extension.integration.migrate();
    await mounted.entry.migrate();
    await mounted.receiver.migrate();
  }
  if (inspect) {
    console.log(JSON.stringify({ ok: true, migrated: false, installed: false, schema,
      installation: await inspectInstallation(mounted.entry, mounted.receiver) }));
  } else if (install) {
    const originalOptions = readPrivateJson(process.env.FOUNDRY_PRIVATE_PROFILE_FILE);
    mounted.entry.receiver = null;
    const original = await mounted.entry.install(originalOptions);
    mounted.entry.receiver = mounted.receiver;
    const receiving = receive ? await receiveUnconsumed(mounted.entry, mounted.receiver, {
      expectedHostConfigId: process.env.FOUNDRY_RECEIVE_EXPECTED_HOST_CONFIG_ID,
      expectedEntryTermsHash: process.env.FOUNDRY_RECEIVE_EXPECTED_ENTRY_TERMS_HASH,
    }) : null;
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
      ...(receiving ? { receiving } : {}),
    }));
  } else {
    console.log(JSON.stringify({ ok: true, migrated: true, installed: false, schema }));
  }
} catch (error) {
  fail(1, error);
} finally {
  await closeEntryThenBase(mounted, store).catch(() => {});
}
