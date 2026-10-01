import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import { buildDelta } from "../foundry/activation/delta.mjs";
import { assessPreconditions } from "../foundry/activation/preconditions.mjs";

const deltaCli = fileURLToPath(new URL("../foundry/activation/delta.mjs", import.meta.url));
const compatCli = fileURLToPath(new URL("../foundry/activation/client-compat.mjs", import.meta.url));
const secret = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-secret-metadata.json", import.meta.url));
const reuse = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-product-reuse.json", import.meta.url));
const clientGreen = fileURLToPath(new URL("../foundry/activation/fixtures/seeded-client-false-green.json", import.meta.url));
const enrolled = fileURLToPath(new URL("../foundry/activation/enrolled-public.json", import.meta.url));

function cli(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("activation delta stays HOLD and keeps correspondence off the product data service", () => {
  const metadata = JSON.parse(readFileSync(enrolled, "utf8"));
  const delta = buildDelta(metadata);
  assert.equal(delta.exitCode, 0, JSON.stringify(delta));
  assert.equal(delta.productionActivate, "HOLD");
  assert.equal(delta.productionReady, false);
  assert.equal(delta.hostingerChanged, false);
  assert.equal(delta.currentPublicState, "disabled_optional_mount");
  assert.equal(delta.correspondenceDataService.enrolled, false);
  assert.equal(delta.productDataService.reusedForCorrespondence, false);
  assert.equal(delta.productDataService.secretCopied, false);
  assert.equal(delta.clientContract.mcp.serverName, "samedaydesk-agent-tools");
  assert.equal(delta.clientContract.mcp.toolsCalled, false);
  assert.ok(delta.inferredAbsentBecauseHealthzUnconfigured.includes("CORRESPONDENCE_DATABASE_URL"));
  assert.ok(delta.inferredAbsentBecauseHealthzUnconfigured.includes("FOUNDRY_HOST_OPT_IN"));
  assert.ok(delta.envNamesRootLeaves.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.equal(JSON.stringify(delta).includes("not-a-real-secret"), false);
});

test("seeded secret metadata and product-data reuse are rejected", () => {
  const secretRun = cli(deltaCli, ["--fixture", secret]);
  assert.equal(secretRun.status, 2, secretRun.stdout + secretRun.stderr);
  assert.equal(secretRun.stdout.includes("not-a-real-secret"), false);
  const secretBody = JSON.parse(secretRun.stdout);
  assert.equal(secretBody.code, "false_green_rejected");
  assert.equal(secretBody.reason, "secret_material");
  assert.equal(secretBody.productionActivate, "HOLD");
  assert.equal(secretBody.productionReady, false);
  assert.equal(secretBody.secretsCopied, false);

  const reuseRun = cli(deltaCli, ["--fixture", reuse]);
  assert.equal(reuseRun.status, 2, reuseRun.stdout + reuseRun.stderr);
  const reuseBody = JSON.parse(reuseRun.stdout);
  assert.equal(reuseBody.code, "correspondence_reuses_product_data_service");
  assert.equal(reuseBody.class, "correspondence_reuses_product_data_service");
  assert.equal(reuseBody.reason, "correspondence_reuses_product_data_service");
  assert.equal(reuseBody.productionReady, false);
  assert.equal(reuseBody.launchedService, false);
  assert.ok(reuseBody.signals.includes("product_project_ref"));

  const blocked = assessPreconditions({
    FOUNDRY_PRODUCTION_ACTIVATE: "HOLD",
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: "postgres://db.arvmcttdegqwiwdaembr.supabase.co:5432/postgres",
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_ADMIN_TOKEN: "x".repeat(24),
    CORRESPONDENCE_STORE: "postgres",
    CORRESPONDENCE_POOL_MAX: "2",
    FOUNDRY_HOST_PROFILE_FILE: "/secure/host-profile.json",
    FOUNDRY_PARTICIPATION_KEY_FILE: "/secure/participation.key",
    FOUNDRY_PRIVATE_PROFILE_FILE: "/secure/private-profile.json",
  }, {
    installer: { installed: true, schema: "pilot_correspondence", startupMigrates: false },
  });
  assert.equal(blocked.productionReady, false);
  assert.equal(blocked.shapeComplete, false);
  assert.ok(blocked.shapeBlockers.includes("correspondence_reuses_product_data_service"));
});

test("product reuse class covers pooler, flags, and the configured Supabase host", () => {
  for (const name of ["seeded-product-reuse-pooler.json", "seeded-product-reuse-flag.json", "seeded-product-reuse-supabase-url.json"]) {
    const ran = cli(deltaCli, ["--fixture", fileURLToPath(new URL(`../foundry/activation/fixtures/${name}`, import.meta.url))]);
    assert.equal(ran.status, 2, ran.stdout + ran.stderr);
    assert.equal(ran.stdout.includes("not-a-real-secret"), false);
    const body = JSON.parse(ran.stdout);
    assert.equal(body.code, "correspondence_reuses_product_data_service");
    assert.equal(body.class, "correspondence_reuses_product_data_service");
    assert.equal(body.productionActivate, "HOLD");
    assert.equal(body.productionReady, false);
  }
  const nested = cli(deltaCli, ["--fixture", fileURLToPath(new URL("../foundry/activation/fixtures/seeded-secret-nested.json", import.meta.url))]);
  assert.equal(nested.status, 2, nested.stdout);
  assert.equal(nested.stdout.includes("not-a-real-secret"), false);
  assert.equal(JSON.parse(nested.stdout).reason, "secret_material");
  const otherProject = assessPreconditions({
    FOUNDRY_PRODUCTION_ACTIVATE: "HOLD",
    FOUNDRY_HOST_OPT_IN: "1",
    SUPABASE_URL: "https://exampleprojectref01.supabase.co",
    CORRESPONDENCE_DATABASE_URL: "postgres://db.exampleprojectref01.supabase.co:5432/postgres",
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    CORRESPONDENCE_ADMIN_TOKEN: "x".repeat(24),
    CORRESPONDENCE_STORE: "postgres",
    FOUNDRY_HOST_PROFILE_FILE: "/secure/host-profile.json",
    FOUNDRY_PARTICIPATION_KEY_FILE: "/secure/participation.key",
    FOUNDRY_PRIVATE_PROFILE_FILE: "/secure/private-profile.json",
  }, { installer: { installed: true, schema: "pilot_correspondence", startupMigrates: false } });
  assert.equal(otherProject.productionReady, false);
  assert.ok(otherProject.shapeBlockers.includes("correspondence_reuses_product_data_service"));
});

test("missing host configuration and an unenrolled store cannot launch", () => {
  const withhold = cli(fileURLToPath(new URL("../foundry/activation/postdeploy-accept.mjs", import.meta.url)), [
    "--fixture",
    fileURLToPath(new URL("../foundry/activation/fixtures/seeded-host-withhold.json", import.meta.url)),
  ]);
  assert.equal(withhold.status, 2, withhold.stdout + withhold.stderr);
  const withholdBody = JSON.parse(withhold.stdout);
  assert.equal(withholdBody.code, "host_configuration_withheld");
  assert.equal(withholdBody.class, "host_configuration_withheld");
  assert.deepEqual(withholdBody.missing, ["FOUNDRY_HOST_OPT_IN", "CORRESPONDENCE_DATABASE_URL", "CORRESPONDENCE_ADMIN_TOKEN"]);
  assert.equal(withholdBody.launchedService, false);
  assert.equal(withholdBody.productionReady, false);

  const unenrolled = cli(fileURLToPath(new URL("../foundry/activation/postdeploy-accept.mjs", import.meta.url)), [
    "--fixture",
    fileURLToPath(new URL("../foundry/activation/fixtures/seeded-unenrolled-hosted-success.json", import.meta.url)),
  ]);
  assert.equal(unenrolled.status, 2, unenrolled.stdout);
  const unenrolledBody = JSON.parse(unenrolled.stdout);
  assert.equal(unenrolledBody.code, "hosted_success_without_enrolled_store");
  assert.equal(unenrolledBody.productionActivate, "HOLD");
  assert.equal(unenrolledBody.productionReady, false);
  assert.equal(unenrolledBody.launchedService, false);
});

test("installer and worker refuse the product data service before connect", async () => {
  const { inspectCorrespondenceEnv, mountCorrespondence } = await import("../lib/correspondence-mount.js");
  const productUrl = "postgres://pilot:not-a-real-secret@db.arvmcttdegqwiwdaembr.supabase.co:5432/postgres";
  const inspected = inspectCorrespondenceEnv({
    NODE_ENV: "production",
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: productUrl,
    CORRESPONDENCE_ADMIN_TOKEN: "x".repeat(24),
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    SUPABASE_URL: "https://arvmcttdegqwiwdaembr.supabase.co",
  });
  assert.equal(inspected.kind, "invalid_config");
  assert.equal(inspected.detail, "correspondence_reuses_product_data_service");
  let connected = false;
  const handle = mountCorrespondence(express(), {
    env: {
      NODE_ENV: "production",
      FOUNDRY_HOST_OPT_IN: "1",
      CORRESPONDENCE_DATABASE_URL: productUrl,
      CORRESPONDENCE_ADMIN_TOKEN: "x".repeat(24),
      CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
    },
    loadService: async () => {
      connected = true;
      throw new Error("must not connect");
    },
  });
  await handle.ready();
  assert.equal(connected, false);
  assert.equal(handle.state.reason, "invalid_config");
  await handle.close();

  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    FOUNDRY_HOST_OPT_IN: "1",
    CORRESPONDENCE_DATABASE_URL: productUrl,
    CORRESPONDENCE_PG_SCHEMA: "pilot_correspondence",
  };
  const installRun = spawnSync(process.execPath, [fileURLToPath(new URL("../foundry/install.mjs", import.meta.url)), "--migrate"], { env, encoding: "utf8" });
  const workerRun = spawnSync(process.execPath, [fileURLToPath(new URL("../foundry/worker.mjs", import.meta.url)), "dispatch", "prj_negative"], { env, encoding: "utf8" });
  assert.equal(installRun.status, 2, installRun.stderr);
  assert.equal(workerRun.status, 2, workerRun.stderr);
  const output = `${installRun.stdout}${installRun.stderr}${workerRun.stdout}${workerRun.stderr}`;
  assert.equal(output.includes("not-a-real-secret"), false);
  assert.equal(/postgres(?:ql)?:\/\//i.test(output), false);
  assert.match(installRun.stderr, /correspondence_reuses_product_data_service/);
  assert.match(workerRun.stderr, /correspondence_reuses_product_data_service/);
});

test("seeded health and MCP success is not portable-kit interoperability", () => {
  const ran = cli(compatCli, ["--fixture", clientGreen]);
  assert.equal(ran.status, 2, ran.stdout + ran.stderr);
  const body = JSON.parse(ran.stdout);
  assert.equal(body.code, "false_green_rejected");
  assert.equal(body.reason, "client_surfaces_are_not_portable_interop");
  assert.equal(body.productionActivate, "HOLD");
  assert.equal(body.productionReady, false);
  assert.equal(body.launchedService, false);

  const catalog = cli(compatCli, ["--fixture", fileURLToPath(new URL("../foundry/activation/fixtures/seeded-client-catalog-false-green.json", import.meta.url))]);
  assert.equal(catalog.status, 2, catalog.stdout + catalog.stderr);
  const catalogBody = JSON.parse(catalog.stdout);
  assert.equal(catalogBody.code, "false_green_rejected");
  assert.equal(catalogBody.reason, "client_surfaces_are_not_portable_interop");
  assert.equal(catalogBody.productionReady, false);
  assert.equal(catalogBody.launchedService, false);
});
