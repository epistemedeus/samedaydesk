import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  BUYER_SETUP_QUICKSTART,
  CUSTOMER_EXAMPLE_DIR,
  CUSTOMER_EXAMPLE_VERSION,
  EXPLICIT_RECORD_SKILL,
  FOR_AGENTS_CRAWLER_HTML,
  GATEWAY_ORIGIN as CLIENT_GATEWAY_ORIGIN,
  MERCHANT_INPUT_PIN as CLIENT_MERCHANT_INPUT_PIN,
  MERCHANT_INPUT_SHORT as CLIENT_MERCHANT_INPUT_SHORT,
  MERCHANT_PIN,
  MERCHANT_REPO,
  RECURRING_MERCHANT_CONTRACTS,
} from "../../../client/src/data/machineEntry.mjs";
import {
  CONTRACTS,
  GATEWAY_ORIGIN,
  MERCHANT_INPUT_PIN,
  MERCHANT_INPUT_REPO,
  MERCHANT_INPUT_SHORT,
  discoveryLinks,
  publishedClientContracts,
} from "../vendor/merchant-contracts.mjs";
import {
  MERCHANT_PACKAGE_NAME,
  createMerchantRequire,
  resolveCustomerExamplePackage,
  resolveMerchantPackage,
  resolveMerchantRoot,
} from "../vendor/resolve-merchant-root.mjs";
import { createFixtureOrigin } from "../fixtures/mounted/fixture-origin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const merchantFixtures = join(here, "..", "fixtures", "merchant");

test("published /for-agents contracts match recipes/vendor C31/C34", () => {
  assert.equal(CLIENT_GATEWAY_ORIGIN, GATEWAY_ORIGIN);
  assert.equal(MERCHANT_REPO, MERCHANT_INPUT_REPO);
  assert.equal(CLIENT_MERCHANT_INPUT_PIN, MERCHANT_INPUT_PIN);
  assert.equal(CLIENT_MERCHANT_INPUT_SHORT, MERCHANT_INPUT_SHORT);
  assert.equal(MERCHANT_INPUT_SHORT, MERCHANT_INPUT_PIN.slice(0, 8));
  assert.match(MERCHANT_INPUT_PIN, /^[a-f0-9]{40}$/);
  assert.match(MERCHANT_PIN, /^[a-f0-9]{40}$/);
  assert.notEqual(MERCHANT_PIN, MERCHANT_INPUT_PIN);

  assert.deepEqual(RECURRING_MERCHANT_CONTRACTS, publishedClientContracts());
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C31.reportSchema, CONTRACTS.C31.reportSchema);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C31.httpProduct, CONTRACTS.C31.httpProduct);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C31.httpSchema, CONTRACTS.C31.httpSchema);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C31.route, CONTRACTS.C31.liveRoutes.compare);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C31.health, CONTRACTS.C31.liveRoutes.health);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C31.openapi, CONTRACTS.C31.liveRoutes.openapi);
  assert.deepEqual([...RECURRING_MERCHANT_CONTRACTS.C31.requiredFields], [...CONTRACTS.C31.requiredFields]);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C34.product, CONTRACTS.C34.product);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C34.schemaVersion, CONTRACTS.C34.schemaVersion);
  assert.equal(RECURRING_MERCHANT_CONTRACTS.C34.skillsIndex, CONTRACTS.C34.liveRoutes.skillsIndex);
  assert.deepEqual(
    [...RECURRING_MERCHANT_CONTRACTS.C34.requiredTopFields],
    [...CONTRACTS.C34.requiredTopFields],
  );

  const links = discoveryLinks();
  assert.ok(links.some((link) => link.href === CONTRACTS.C31.liveRoutes.health));
  assert.ok(links.some((link) => link.href === CONTRACTS.C34.liveRoutes.explicitRecordSkill));

  assert.match(FOR_AGENTS_CRAWLER_HTML, new RegExp(CONTRACTS.C31.liveRoutes.compare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(FOR_AGENTS_CRAWLER_HTML, new RegExp(CONTRACTS.C34.schemaVersion));
  assert.match(FOR_AGENTS_CRAWLER_HTML, new RegExp(CONTRACTS.C34.liveRoutes.skillsIndex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(FOR_AGENTS_CRAWLER_HTML.includes(BUYER_SETUP_QUICKSTART), true);
  assert.match(BUYER_SETUP_QUICKSTART, /sibling x402-url-extractor/);
  assert.match(BUYER_SETUP_QUICKSTART, /No network clone/);
  assert.equal(BUYER_SETUP_QUICKSTART.includes("export MERCHANT_INPUT_ROOT="), false);
  assert.match(EXPLICIT_RECORD_SKILL, /plugins\/samedaydesk-extract\/skills\/explicit-record\/SKILL.md/);
});

test("local merchant root and packages resolve without MERCHANT_INPUT_ROOT or network", () => {
  const env = { ...process.env };
  delete env.MERCHANT_INPUT_ROOT;
  const root = resolveMerchantRoot(env);
  assert.ok(root, "expected sibling x402-url-extractor with name x402-merchant");
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name, MERCHANT_PACKAGE_NAME);

  const expressPath = resolveMerchantPackage("express", root);
  assert.match(expressPath, /node_modules[/\\]express[/\\]/);
  const express = createMerchantRequire(root)("express");
  assert.equal(typeof express, "function");

  const ajvPath = resolveCustomerExamplePackage("ajv/dist/2020.js", root);
  assert.match(ajvPath, /node_modules[/\\]ajv[/\\]/);
  assert.equal(existsSync(ajvPath), true);

  const customerPkg = JSON.parse(
    readFileSync(join(root, CUSTOMER_EXAMPLE_DIR, "package.json"), "utf8"),
  );
  assert.equal(customerPkg.name, "samedaydesk-customer-x402-example");
  assert.equal(customerPkg.version, CUSTOMER_EXAMPLE_VERSION);

  assert.equal(
    existsSync(join(root, "plugins/samedaydesk-extract/skills/explicit-record/SKILL.md")),
    true,
  );
  assert.equal(
    existsSync(join(root, "plugins/samedaydesk-x402/skills/page-change/SKILL.md")),
    true,
  );
});

test("local merchant modules export the published C31/C34 field lists", async () => {
  const env = { ...process.env };
  delete env.MERCHANT_INPUT_ROOT;
  const root = resolveMerchantRoot(env);
  assert.ok(root);

  const pageChange = await import(pathToFileURL(join(root, "page-change-http.mjs")).href);
  assert.equal(pageChange.PAGE_CHANGE_HTTP_PATH, CONTRACTS.C31.routes.compare);
  assert.equal(pageChange.PAGE_CHANGE_HTTP_HEALTH_PATH, CONTRACTS.C31.routes.health);
  assert.equal(pageChange.PAGE_CHANGE_HTTP_OPENAPI_PATH, CONTRACTS.C31.routes.openapi);
  assert.equal(pageChange.XAGENT_VERIFICATION_PATH, CONTRACTS.C31.routes.verification);
  assert.equal(pageChange.PAGE_CHANGE_HTTP_PRODUCT, CONTRACTS.C31.httpProduct);
  assert.equal(pageChange.PAGE_CHANGE_HTTP_SCHEMA, CONTRACTS.C31.httpSchema);

  const skills = await import(pathToFileURL(join(root, "well-known-skills.mjs")).href);
  assert.equal(skills.WELL_KNOWN_SKILLS_INDEX_PATH, CONTRACTS.C34.routes.skillsIndex);
  assert.ok(skills.WELL_KNOWN_SKILL_NAMES.includes("page-change"));
  assert.ok(skills.WELL_KNOWN_SKILL_NAMES.includes("explicit-record"));

  const batch = await import(
    pathToFileURL(join(root, "examples/customer-x402/src/batch-output.mjs")).href
  );
  assert.deepEqual([...batch.EXTRACT_BATCH_TOP_FIELDS], [...CONTRACTS.C34.requiredTopFields]);

  const extractConfig = await import(pathToFileURL(join(root, "extract-batch-config.mjs")).href);
  assert.equal(extractConfig.EXTRACT_BATCH_PRODUCT, CONTRACTS.C34.product);
  assert.equal(extractConfig.EXTRACT_BATCH_SCHEMA_VERSION, CONTRACTS.C34.schemaVersion);
});

test("local mocked HTTP serves published C31/C34 routes", { timeout: 30_000 }, async (t) => {
  const origin = await createFixtureOrigin();
  t.after(() => origin.close());
  assert.match(origin.base, /^http:\/\/127\.0\.0\.1:\d+$/);

  const healthz = await fetch(`${origin.base}/healthz`).then((res) => res.json());
  assert.equal(healthz.ok, true);
  assert.equal(healthz.merchantInputPin, MERCHANT_INPUT_SHORT);

  const health = await fetch(origin.routes.pageChangeHealth).then((res) => res.json());
  assert.equal(health.status, "ok");
  assert.equal(health.schemaVersion, CONTRACTS.C31.httpSchema);

  const openapi = await fetch(origin.routes.pageChangeOpenapi).then((res) => res.json());
  assert.equal(openapi.paths?.[CONTRACTS.C31.routes.compare] != null, true);

  const skills = await fetch(origin.routes.skillsIndex).then((res) => res.json());
  assert.ok(Array.isArray(skills.skills));
  assert.ok(skills.skills.some((skill) => skill.name === "page-change"));
  assert.ok(skills.skills.some((skill) => skill.name === "explicit-record"));

  const skillMd = await fetch(origin.routes.explicitRecordSkill);
  assert.equal(skillMd.status, 200);
  assert.match(await skillMd.text(), /explicit-record/);

  const before = JSON.parse(
    readFileSync(join(merchantFixtures, "page-change/merchant/unchanged-before.json"), "utf8"),
  );
  const after = JSON.parse(
    readFileSync(join(merchantFixtures, "page-change/merchant/unchanged-after.json"), "utf8"),
  );
  const compare = await fetch(origin.routes.pageChange, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      before: { mediaType: "application/json", body: before },
      after: { mediaType: "application/json", body: after },
      fields: ["title", "description"],
    }),
  });
  assert.equal(compare.status, 200);
  const body = await compare.json();
  assert.equal(body.charged, false);
  assert.equal(body.product, CONTRACTS.C31.httpProduct);
  assert.equal(body.schemaVersion, CONTRACTS.C31.httpSchema);
  assert.equal(body.report.schema, CONTRACTS.C31.reportSchema);
  assert.equal(body.report.verdict, "unchanged");
});
