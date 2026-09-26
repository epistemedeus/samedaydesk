import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CLOCK_DOMAIN_FIXTURE,
  DISCLOSURE_SCHEMA,
  FIXTURE_NOW,
  FORBIDDEN_FIELDS,
  JOURNEY_SCHEMA,
  MATCH_REFUSAL,
  applyCorrection,
  correspondenceBodiesFromJourney,
  createSeedCatalog,
  discloseCapability,
  discloseCatalog,
  httpsCompletionHref,
  persistCapabilityJourney,
  runCorrectionJourney,
  runDisclosureJourney,
  runMatchJourney,
} from "../src/index.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const composeRoot = join(root, "../../../..");
const hostile = (name) => JSON.parse(readFileSync(join(root, "../fixtures/hostile", name), "utf8"));
const NOW = Date.parse(FIXTURE_NOW);

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    server.on("error", reject);
  });
}

test("directory disclosure labels fixture sellers and omits forbidden ranking fields", () => {
  const catalog = discloseCatalog(createSeedCatalog(), { nowMs: NOW });
  assert.equal(catalog.schema, DISCLOSURE_SCHEMA);
  assert.equal(catalog.clockDomain, CLOCK_DOMAIN_FIXTURE);
  assert.equal(catalog.hostedApi, false);
  assert.equal(catalog.custody, false);
  assert.equal(catalog.fetchedCompletion, false);
  assert.ok(catalog.count >= 5);

  const fixture = catalog.capabilities.find((item) => item.advertised.id === "fixture-demo-echo");
  assert.equal(fixture.advertised.demo, true);
  assert.match(fixture.advertised.sellerLabel, /FIXTURE DEMO/i);
  assert.equal(fixture.advertised.price.source, "fixture.demo.not-a-live-offer");
  assert.equal(fixture.runnable.present, true);

  const batch = catalog.capabilities.find((item) => item.advertised.id === "sdd-batch-extract-v0");
  assert.equal(batch.advertised.sellerClass, "operator");
  assert.equal(batch.advertised.price.source, "samedaydesk.extract-batch.quote");
  assert.equal(batch.advertised.price.stale, false);

  const serialized = JSON.stringify(catalog);
  for (const field of FORBIDDEN_FIELDS) {
    // Input offers cannot claim custody. Output envelopes explicitly disclose
    // custody=false, so verify that denial rather than forbidding its key.
    if (field === "custody") {
      assert.equal(catalog.custody, false);
      for (const item of catalog.capabilities) {
        assert.equal(item.custody, false);
        assert.equal(Object.hasOwn(item.advertised, "custody"), false);
      }
    } else {
      assert.doesNotMatch(serialized, new RegExp(`"${field}"\\s*:`));
    }
  }
});

test("match journey selects SameDayDesk batch extract and discloses HTTPS completion without fetching", async () => {
  const result = await runMatchJourney({
    request: { outcomes: ["public_page_extract"], inputs: { urls: ["https://neomorphic.io/"] } },
    nowMs: NOW,
    runSelected: false,
  });
  assert.equal(result.schema, JOURNEY_SCHEMA);
  assert.equal(result.fetchedCompletion, false);
  assert.equal(result.match.empty, false);
  assert.equal(result.selection.ok, true);
  assert.equal(result.selection.capabilityId, "sdd-batch-extract-v0");
  assert.equal(result.disclosures[0].advertised.price.source, "samedaydesk.extract-batch.quote");
  assert.equal(httpsCompletionHref(result.selection.completionLink.href), "https://samedaydesk.com/");

  const kinds = result.correspondenceBodies.map((body) => body.kind);
  assert.deepEqual(kinds, ["request", "artifact"]);
  assert.equal(result.correspondenceBodies[1].artifact.url, "https://samedaydesk.com/");
  assert.match(result.correspondenceBodies[1].text, /not fetched/i);
});

test("disclosure journey keeps advertised, runnable, and delivered layers distinct", async () => {
  const result = await runDisclosureJourney({
    request: { outcomes: ["demo_echo"], inputs: { message: "n13-echo" } },
    nowMs: NOW,
  });
  assert.equal(result.selection.capabilityId, "fixture-demo-echo");
  assert.equal(result.delivery.ok, true);
  assert.equal(result.delivery.layers.advertised, "fixture-demo-echo");
  assert.equal(result.delivery.layers.runnable, "fixture-demo-echo");
  assert.equal(result.delivery.layers.delivered, "evidence");
  assert.equal(result.delivery.evidence.result.echo, "n13-echo");
  assert.equal(result.delivery.evidence.evidenceClass, "internal");
  assert.notEqual(result.disclosures[0].advertised.layer, "evidence");
  assert.equal(result.disclosures[0].delivered.distinctFromAdvertisement, true);
  assert.equal(result.disclosures[0].delivered.evidenceClass, "internal");

  const kinds = result.correspondenceBodies.map((body) => body.kind);
  assert.deepEqual(kinds, ["request", "reply", "reply"]);
  assert.equal(result.correspondenceBodies[1].artifact, undefined);
  assert.match(result.correspondenceBodies[1].text, /not an HTTPS artifact|not HTTPS/i);
});

test("advertised-only seller conformance discloses missing local adapter", async () => {
  const result = await runDisclosureJourney({
    request: { outcomes: ["seller_conformance"], inputs: { methodPath: "GET /pay" } },
    nowMs: NOW,
  });
  assert.equal(result.selection.capabilityId, "lab-seller-conformance");
  assert.equal(result.delivery.ok, false);
  assert.equal(result.delivery.reason, "no_runnable_adapter");
  assert.equal(result.delivery.advertised.id, "lab-seller-conformance");
  assert.ok(result.correspondenceBodies.some((body) => body.kind === "needs_human"));
  assert.equal(httpsCompletionHref(result.selection.completionLink.href), null);
});

test("stale prices remain visible, disclosed as stale, and demoted after fresh matches", async () => {
  const stale = hostile("stale-price.json");
  const catalog = [...createSeedCatalog(), stale];
  const result = await runMatchJourney({
    catalog,
    request: { outcomes: ["batch_extraction"], inputs: { urls: ["https://example.com"] } },
    nowMs: NOW,
  });
  assert.ok(result.match.matchIds.includes("sdd-batch-extract-v0"));
  assert.ok(result.match.matchIds.includes("hostile-stale-price"));
  assert.equal(result.match.matchIds[0], "sdd-batch-extract-v0");
  const staleDisclosure = result.disclosures.find((item) => item.advertised.id === "hostile-stale-price");
  assert.equal(staleDisclosure.advertised.price.stale, true);
  assert.ok(staleDisclosure.refusals.includes(MATCH_REFUSAL.STALE_PRICE) || staleDisclosure.advertised.price.stale);
});

test("deceptive, malformed, incompatible, and unmatched outcomes are first-class refusals", async () => {
  const catalog = [
    ...createSeedCatalog(),
    hostile("deceptive.json"),
    hostile("malformed.json"),
  ];

  const deceptive = await runMatchJourney({
    catalog,
    request: { outcomes: ["batch_extraction"], inputs: { urls: ["https://example.com"] } },
    nowMs: NOW,
  });
  assert.ok(deceptive.match.rejected.some((item) => item.refusals.includes(MATCH_REFUSAL.DECEPTIVE_CAPABILITY)));
  assert.ok(!deceptive.match.matchIds.includes("hostile-deceptive-reviews"));

  const malformed = discloseCapability(hostile("malformed.json"), { nowMs: NOW });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.refusals.includes(MATCH_REFUSAL.MALFORMED_CAPABILITY));

  const incompatible = await runMatchJourney({
    catalog: createSeedCatalog(),
    request: hostile("incompatible-input.json").request,
    nowMs: NOW,
  });
  assert.ok(incompatible.match.rejected.some((item) => item.refusals.includes(MATCH_REFUSAL.INCOMPATIBLE_INPUT)));

  const none = await runMatchJourney({
    request: hostile("no-result.json").request,
    nowMs: NOW,
  });
  assert.equal(none.match.empty, true);
  assert.equal(none.selection.ok, false);
  assert.equal(none.selection.kind, "needs_human");
  assert.deepEqual(
    none.correspondenceBodies.map((body) => body.kind),
    ["request", "needs_human"],
  );

  const badShape = await runMatchJourney({
    request: { outcomes: ["demo_echo"], inputs: ["not-an-object"] },
    nowMs: NOW,
  });
  assert.equal(badShape.request.malformedInputs, true);
  assert.equal(badShape.match.refusal, MATCH_REFUSAL.INCOMPATIBLE_INPUT);
});

test("correction journey keeps the prior record and posts a correction body", () => {
  const catalog = createSeedCatalog();
  const correction = hostile("correction.json");
  const result = runCorrectionJourney({ catalog, correction, nowMs: NOW });
  assert.equal(result.priorActive, false);
  assert.equal(result.supersededBy, "fixture-demo-echo-v2");
  assert.equal(result.replacementId, "fixture-demo-echo-v2");
  assert.equal(result.correspondenceBodies[0].kind, "correction");
  assert.match(result.correspondenceBodies[0].text, /No silent rewrite/i);

  const stillPresent = result.catalog.find((item) => item.id === "fixture-demo-echo");
  assert.equal(stillPresent.active, false);
  const rewritten = applyCorrection(catalog, correction);
  assert.ok(rewritten.some((item) => item.id === "fixture-demo-echo"));
});

test("HTTPS-only artifact mapping refuses relative lab completion links", () => {
  const selection = {
    ok: true,
    capabilityId: "lab-record-projection",
    sellerClass: "operator",
    stale: false,
    runnable: true,
    routeKind: "local_lab",
    completionLink: { href: "/labs/record-lab/", label: "Record lab" },
  };
  const bodies = correspondenceBodiesFromJourney({
    request: { outcomes: ["record_projection"], inputs: { extractionJson: "{}" } },
    matched: { matches: [{ capability: { id: "lab-record-projection" } }], rejected: [], empty: false, refusal: null },
    selection,
  });
  assert.equal(bodies[1].kind, "reply");
  assert.equal(bodies[1].artifact, undefined);
  assert.equal(httpsCompletionHref("/labs/record-lab/"), null);
  assert.equal(httpsCompletionHref("javascript:alert(1)"), null);
  assert.equal(httpsCompletionHref("https://samedaydesk.com/"), "https://samedaydesk.com/");
});

test("persistCapabilityJourney posts bodies in order through the supplied transport", async () => {
  const posted = [];
  const bodies = [
    { kind: "request", text: "one" },
    { kind: "needs_human", text: "two" },
  ];
  const results = await persistCapabilityJourney({
    bodies,
    keys: ["n13-key-request-xxxxxxxx", "n13-key-human-xxxxxxxx"],
    postEvent: async (body) => {
      posted.push(body);
      return { event: { kind: body.kind, id: `evt-${posted.length}` }, replayed: false };
    },
  });
  assert.equal(results.length, 2);
  assert.equal(posted[0].kind, "request");
  assert.equal(posted[0].idempotencyKey, "n13-key-request-xxxxxxxx");
  assert.equal(posted[1].kind, "needs_human");
});

test("built catalog snapshot is disclosed over real loopback HTTP", async () => {
  const snapshotPath = join(composeRoot, "dist/api/lab/capabilities.json");
  assert.ok(existsSync(snapshotPath), "dist/api/lab/capabilities.json must exist from compose build");
  const payload = readFileSync(snapshotPath);

  const server = createServer((req, res) => {
    if (req.url === "/api/lab/capabilities.json") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(payload);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/lab/capabilities.json`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schema, "neomorphic.capability-market.v1");
    assert.equal(body.clockDomain, "fixture");
    assert.equal(body.mode, "local-directory");
    assert.ok(Array.isArray(body.limitations));
    assert.match(JSON.stringify(body.limitations), /No custody|not a hosted marketplace/i);
    const fixture = body.capabilities.find((item) => item.id === "fixture-demo-echo");
    assert.equal(fixture.demo, true);
    assert.match(fixture.seller.label, /FIXTURE DEMO/i);
    assert.doesNotMatch(JSON.stringify(body.capabilities), /"reviews"|"rankScore"|"escrow"|"payToBroadcast"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
