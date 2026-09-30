import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
  assert.equal(reuseBody.reason, "correspondence_reuses_product_data_service");
  assert.equal(reuseBody.productionReady, false);

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

test("seeded health and MCP success is not portable-kit interoperability", () => {
  const ran = cli(compatCli, ["--fixture", clientGreen]);
  assert.equal(ran.status, 2, ran.stdout + ran.stderr);
  const body = JSON.parse(ran.stdout);
  assert.equal(body.code, "false_green_rejected");
  assert.equal(body.reason, "client_surfaces_are_not_portable_interop");
  assert.equal(body.productionActivate, "HOLD");
  assert.equal(body.productionReady, false);
  assert.equal(body.launchedService, false);
});
