import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { catalogRequestUrls, createFixtureFetch, liveFetch, loadCatalog } from "./lib.mjs";
import {
  FINDING_CODES,
  HANDOFF_CHECK_IDS,
  HANDOFF_CLAIMS,
  mergeHandoffOverlay,
  runAgentHandoff,
  secretQueryHits,
  siteHandoff,
} from "./handoff.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = loadCatalog();
const healthy = JSON.parse(readFileSync(join(here, "fixtures/healthy.json"), "utf8"));
const overlayHealthy = JSON.parse(readFileSync(join(here, "fixtures/handoff-overlay-healthy.json"), "utf8"));
const cli = join(here, "cli.mjs");
const primary = catalog.sites[0];
const primaryOrigin = primary.origin;

function overlayPaths(origin, paths) {
  const fixture = structuredClone(healthy);
  fixture.responses[origin] = { ...fixture.responses[origin], ...paths };
  return fixture;
}

function handoffSurfaces(origin) {
  return {
    "/openapi.json": {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Fixture correspondence", version: "0" },
        paths: { "/v1/projects": { get: { summary: "Read a project" } } },
      }),
    },
    "/review/demo": {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><link rel="canonical" href="${origin}/review/demo" /><title>Human review</title></head><body>Review demo. GET does not approve.</body></html>`,
    },
  };
}

function healthyDeclaredFixture() {
  return overlayPaths(primaryOrigin, handoffSurfaces(primaryOrigin));
}

function withHandoff(spec, siteId = primary.id) {
  return mergeHandoffOverlay(catalog, { sites: [{ id: siteId, handoff: spec }] });
}

function byId(report, siteId) {
  return report.sites.find((site) => site.id === siteId);
}

function check(report, siteId, checkId) {
  const site = byId(report, siteId);
  assert.ok(site, `missing site ${siteId}`);
  const row = site.checks.find((item) => item.id === checkId);
  assert.ok(row, `missing check ${siteId}/${checkId}`);
  return row;
}

function findingCodes(report) {
  return report.findings.map((row) => row.code);
}

function assertClaimsUnobserved(report) {
  assert.deepEqual(report.handoffClaims, HANDOFF_CLAIMS);
  const blob = JSON.stringify(report);
  assert.equal(blob.includes('"payment":true'), false);
  assert.equal(blob.includes('"human_consent":true'), false);
  assert.equal(blob.includes("trustScore"), false);
  assert.equal(blob.includes("trust_score"), false);
  for (const value of Object.values(HANDOFF_CLAIMS)) {
    assert.equal(value, "not_observed");
  }
}

function trackingFetch(fixture) {
  const inner = createFixtureFetch(fixture);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return inner(url);
  };
  return { fetchImpl, calls };
}

test("agent-handoff source stays catalog-driven and does not invent a protocol", () => {
  const files = ["handoff.mjs", "cli.mjs", "lib.mjs"].map((name) => readFileSync(join(here, name), "utf8"));
  for (const origin of catalog.sites.map((site) => site.origin)) {
    for (const source of files) {
      assert.equal(source.includes(origin), false, origin);
    }
  }
  const handoff = files[0];
  for (const token of ["MCP", "A2A", "x402", "trustScore", "Authorization"]) {
    assert.equal(handoff.includes(token), false, token);
  }
  assert.equal(handoff.includes('method: "POST"'), false);
  assert.equal(handoff.includes('method: "GET"'), false);
});

test("default catalog does not declare undeployed handoff endpoints", () => {
  assert.equal(catalog.sites.every((site) => siteHandoff(site) === null), true);
  assert.deepEqual(
    catalog.sites.map((site) => site.id),
    ["samedaydesk", "ein-llc", "neomorphic-io"],
  );
});

test("undeclared healthy catalog is ok and keeps handoff checks not_applicable", async () => {
  const { fetchImpl, calls } = trackingFetch(healthy);
  const report = await runAgentHandoff(catalog, fetchImpl);
  assert.equal(report.ok, true);
  assert.equal(report.mode, "agent-handoff");
  assert.deepEqual(report.findings, []);
  assert.equal(report.probeCount, catalogRequestUrls(catalog).length);
  assert.deepEqual(calls.sort(), [...catalogRequestUrls(catalog)].sort());
  assertClaimsUnobserved(report);
  for (const site of catalog.sites) {
    assert.equal(byId(report, site.id).advertised, false);
    for (const id of HANDOFF_CHECK_IDS) {
      assert.equal(check(report, site.id, id).status, "not_applicable");
      assert.equal(check(report, site.id, id).detail, "handoff_not_advertised");
    }
    assert.equal(check(report, site.id, "home").status, "ok");
  }
  assert.equal(check(report, "ein-llc", "agent_card").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "agent_card").status, "not_applicable");
});

test("declared healthy overlay passes without calling undeclared siblings broken", async () => {
  const catalogWith = mergeHandoffOverlay(catalog, overlayHealthy);
  const fixture = healthyDeclaredFixture();
  const { fetchImpl, calls } = trackingFetch(fixture);
  const report = await runAgentHandoff(catalogWith, fetchImpl);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assertClaimsUnobserved(report);
  assert.equal(byId(report, "samedaydesk").advertised, true);
  assert.equal(byId(report, "ein-llc").advertised, false);
  assert.equal(check(report, "samedaydesk", "handoff_origin").detail, "exact_origin");
  assert.equal(check(report, "samedaydesk", "handoff_method").detail, "method_get");
  assert.equal(check(report, "samedaydesk", "handoff_availability").detail, "availability_observed");
  assert.equal(check(report, "samedaydesk", "handoff_human_review").status, "ok");
  assert.equal(check(report, "samedaydesk", "handoff_machine_guide").status, "ok");
  assert.match(check(report, "samedaydesk", "handoff_machine_guide").detail, /^openapi:/);
  assert.equal(check(report, "samedaydesk", "handoff_required_inputs").status, "ok");
  assert.equal(check(report, "samedaydesk", "handoff_query_secrets").status, "ok");
  assert.equal(check(report, "ein-llc", "handoff_origin").status, "not_applicable");
  assert.equal(check(report, "neomorphic-io", "handoff_human_review").status, "not_applicable");
  assert.equal(calls.includes(`${primaryOrigin}/openapi.json`), true);
  assert.equal(calls.includes(`${primaryOrigin}/review/demo`), true);
});

test("foreign human-review URL is a finding and is not fetched", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "observed",
    method: "GET",
    humanReviewUrlTemplate: "https://example.net/review/{projectId}",
    example: { url: "https://example.net/review/demo", inputs: { title: "x", summary: "y" } },
  });
  const { fetchImpl, calls } = trackingFetch(healthy);
  const report = await runAgentHandoff(catalogWith, fetchImpl);
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("foreign_url"), true);
  assert.equal(check(report, primary.id, "handoff_human_review").finding, "foreign_url");
  assert.equal(calls.some((url) => url.startsWith("https://example.net")), false);
  assertClaimsUnobserved(report);
});

test("secret in handoff query is a finding, not a score", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "observed",
    method: "GET",
    humanReviewUrlTemplate: `${primaryOrigin}/review/{projectId}?token=secret-value`,
    machineGuide: `${primaryOrigin}/openapi.json`,
    requiredInputs: ["title", "summary"],
    example: {
      url: `${primaryOrigin}/review/demo?token=secret-value`,
      inputs: { title: "Demo project", summary: "Fixture correspondence" },
    },
  });
  const { fetchImpl, calls } = trackingFetch(healthyDeclaredFixture());
  const report = await runAgentHandoff(catalogWith, fetchImpl);
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("secret_in_query"), true);
  assert.match(check(report, primary.id, "handoff_query_secrets").detail, /secret_in_query:token/);
  assert.equal(report.findings.some((row) => String(row.detail).includes("secret-value")), false);
  assert.equal(JSON.stringify(report).includes("secret-value"), false);
  assert.equal(calls.some((url) => url.includes("secret-value")), false);
  assertClaimsUnobserved(report);
});

test("JWT-shaped query value is treated as a secret", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc";
  assert.deepEqual(secretQueryHits(`${primaryOrigin}/review/demo?state=${jwt}`, primaryOrigin), ["state"]);
  assert.deepEqual(secretQueryHits(`${primaryOrigin}/review/demo`, primaryOrigin), []);
});

test("URL credentials are neither fetched nor exposed anywhere in the report", async () => {
  const credentialUrl = `${primaryOrigin.replace("https://", "https://private-user:private-password@")}\/review/demo`;
  const catalogWith = withHandoff({
    availability: "observed", method: "GET",
    humanReviewUrlTemplate: credentialUrl,
    machineGuide: credentialUrl,
    example: { url: credentialUrl },
  });
  const { fetchImpl, calls } = trackingFetch(healthy);
  const report = await runAgentHandoff(catalogWith, fetchImpl);
  assert.equal(report.ok, false);
  assert.equal(calls.some((url) => url.includes("private-")), false);
  assert.equal(JSON.stringify(report).includes("private-"), false);
});

test("benign query values are omitted from all report URL fields", async () => {
  const url = `${primaryOrigin}/review/demo?locale=private-locale#private-fragment`;
  const catalogWith = withHandoff({
    availability: "observed", method: "GET", humanReviewUrlTemplate: url,
    example: { url },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthy));
  const text = JSON.stringify(report);
  assert.equal(text.includes("private-locale"), false);
  assert.equal(text.includes("private-fragment"), false);
  assert.equal(text.includes("locale="), true);
});

test("slashless relative URL findings redact secret values too", async () => {
  const catalogWith = withHandoff({
    availability: "observed", method: "GET",
    humanReviewUrlTemplate: "review/demo?token=private-token",
    example: { url: "review/demo?token=private-token" },
  });
  const { fetchImpl, calls } = trackingFetch(healthy);
  const report = await runAgentHandoff(catalogWith, fetchImpl);
  assert.equal(findingCodes(report).includes("secret_in_query"), true);
  assert.equal(JSON.stringify(report).includes("private-token"), false);
  assert.equal(calls.some((url) => url.includes("private-token")), false);
});

test("unsupported or undeclared review method never fetches the example", async () => {
  for (const method of ["POST", undefined]) {
    const catalogWith = withHandoff({
      availability: "proposed", method,
      humanReviewUrlTemplate: `${primaryOrigin}/review/{projectId}`,
      example: { url: `${primaryOrigin}/review/demo` },
    });
    const { fetchImpl, calls } = trackingFetch(healthy);
    await runAgentHandoff(catalogWith, fetchImpl);
    assert.equal(calls.includes(`${primaryOrigin}/review/demo`), false);
  }
});

test("an unrelated readable example cannot verify the review URL template", async () => {
  const catalogWith = withHandoff({
    availability: "observed", method: "GET",
    humanReviewUrlTemplate: `${primaryOrigin}/approval/{projectId}`,
    example: { url: `${primaryOrigin}/review/demo` },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthyDeclaredFixture()));
  assert.equal(report.ok, false);
  assert.equal(check(report, primary.id, "handoff_human_review").detail, "example_template_mismatch");
});

test("colon-style review templates still match concrete examples", async () => {
  const catalogWith = withHandoff({
    availability: "observed", method: "GET",
    humanReviewUrlTemplate: `${primaryOrigin}/review/:projectId`,
    example: { url: `${primaryOrigin}/review/demo` },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthyDeclaredFixture()));
  assert.equal(check(report, primary.id, "handoff_human_review").status, "ok");
});

test("redirect credential and query values never enter the report", async () => {
  const catalogWith = withHandoff({
    availability: "observed", method: "GET", machineGuide: `${primaryOrigin}/openapi.json`,
  });
  const fixture = overlayPaths(primaryOrigin, {
    "/openapi.json": {
      status: 302, body: "", url: "https://private-user:private-password@example.net/guide?token=private-token",
    },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(fixture));
  assert.equal(findingCodes(report).includes("foreign_url"), true);
  assert.equal(JSON.stringify(report).includes("private-"), false);
});

test("manual live GET reports but does not follow a foreign redirect", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "manual");
    return new Response("", { status: 302, headers: { location: "https://example.net/private" } });
  };
  try {
    const response = await liveFetch(`${primaryOrigin}/openapi.json`, { redirect: "manual" });
    assert.equal(response.url, "https://example.net/private");
    assert.equal(response.status, 302);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(readFileSync(cli, "utf8"), /mode === "agent-handoff" \? "manual" : "follow"/);
});

test("broken exact review link is a finding", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "observed",
    method: "GET",
    humanReviewUrlTemplate: `${primaryOrigin}/review/{projectId}`,
    machineGuide: `${primaryOrigin}/openapi.json`,
    requiredInputs: ["title", "summary"],
    example: {
      url: `${primaryOrigin}/review/missing`,
      inputs: { title: "Demo project", summary: "Fixture correspondence" },
    },
  });
  const fixture = overlayPaths(primaryOrigin, {
    ...handoffSurfaces(primaryOrigin),
    "/review/missing": { status: 404, contentType: "text/plain", body: "Not found\n" },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("broken_exact_link"), true);
  assert.equal(check(report, primary.id, "handoff_human_review").status, "missing");
  assert.equal(check(report, primary.id, "handoff_human_review").finding, "broken_exact_link");
});

test("unsupported review method is a finding", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "proposed",
    method: "POST",
    humanReviewUrlTemplate: `${primaryOrigin}/review/{projectId}`,
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthy));
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("unsupported_method"), true);
  assert.equal(check(report, primary.id, "handoff_method").finding, "unsupported_method");
  assert.match(check(report, primary.id, "handoff_method").detail, /POST/);
});

test("published example missing a required input is a finding", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "observed",
    method: "GET",
    humanReviewUrlTemplate: `${primaryOrigin}/review/{projectId}`,
    machineGuide: `${primaryOrigin}/openapi.json`,
    requiredInputs: ["title", "summary"],
    example: {
      url: `${primaryOrigin}/review/demo`,
      inputs: { title: "Demo project" },
    },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthyDeclaredFixture()));
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("missing_required_input"), true);
  assert.equal(check(report, primary.id, "handoff_required_inputs").input, "summary");
  assert.equal(FINDING_CODES.includes("missing_required_input"), true);
});

test("proposed availability with a missing guide is not_applicable, not broken", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "proposed",
    method: "GET",
    machineGuide: `${primaryOrigin}/openapi.json`,
  });
  const fixture = overlayPaths(primaryOrigin, {
    "/openapi.json": { status: 404, contentType: "text/plain", body: "Not found\n" },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(fixture));
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.equal(check(report, primary.id, "handoff_machine_guide").status, "not_applicable");
  assert.match(check(report, primary.id, "handoff_machine_guide").detail, /proposed_unobserved/);
  assert.equal(check(report, primary.id, "handoff_availability").detail, "availability_proposed");
});

test("origin mismatch is a foreign_url finding", async () => {
  const catalogWith = withHandoff({
    origin: "https://example.net",
    availability: "proposed",
    method: "GET",
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthy));
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("foreign_url"), true);
  assert.match(check(report, primary.id, "handoff_origin").detail, /origin_mismatch/);
});

test("machine guide redirected to another origin is not ok", async () => {
  const catalogWith = withHandoff({
    origin: primaryOrigin,
    availability: "observed",
    method: "GET",
    machineGuide: `${primaryOrigin}/openapi.json`,
  });
  const fixture = overlayPaths(primaryOrigin, {
    "/openapi.json": {
      status: 200,
      contentType: "application/json",
      body: "{\"openapi\":\"3.1.0\"}",
      url: "https://example.net/openapi.json",
    },
  });
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(fixture));
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("foreign_url"), true);
  assert.match(check(report, primary.id, "handoff_machine_guide").detail, /redirect_foreign_origin/);
});

test("caller-supplied staged catalog can exercise a non-live origin", async () => {
  const staged = loadCatalog(join(here, "fixtures/handoff-staged-catalog.json"));
  const fixture = JSON.parse(readFileSync(join(here, "fixtures/handoff-staged-responses.json"), "utf8"));
  const report = await runAgentHandoff(staged, createFixtureFetch(fixture));
  assert.equal(report.ok, true);
  assert.equal(report.sites.length, 1);
  assert.equal(report.sites[0].id, "staged-handoff");
  assert.equal(report.sites[0].origin, "https://handoff.example.test");
  assert.equal(check(report, "staged-handoff", "handoff_human_review").status, "ok");
  assert.equal(check(report, "staged-handoff", "home").status, "ok");
  assertClaimsUnobserved(report);
});

test("readable review page does not observe payment, consent, or demand", async () => {
  const catalogWith = mergeHandoffOverlay(catalog, overlayHealthy);
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthyDeclaredFixture()));
  assert.equal(report.ok, true);
  assert.equal(check(report, "samedaydesk", "handoff_human_review").httpStatus, 200);
  assertClaimsUnobserved(report);
});

test("unknown overlay site id is rejected", () => {
  assert.throws(
    () => mergeHandoffOverlay(catalog, { sites: [{ id: "not-a-site", handoff: { method: "GET" } }] }),
    /not in catalog/,
  );
});

test("CLI agent-handoff default catalog fixture is compact JSON and exit 0", () => {
  const pass = spawnSync(
    process.execPath,
    [cli, "--mode", "agent-handoff", "--fixture", join(here, "fixtures/healthy.json")],
    { encoding: "utf8" },
  );
  assert.equal(pass.status, 0, pass.stderr);
  const trimmed = pass.stdout.trim();
  assert.equal(trimmed.includes("\n"), false);
  const parsed = JSON.parse(trimmed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "agent-handoff");
  assert.equal(parsed.handoffClaims.payment, "not_observed");
  assert.deepEqual(parsed.findings, []);
});

test("observed overlay against current healthy discovery surfaces is broken_exact_link", async () => {
  const catalogWith = mergeHandoffOverlay(catalog, overlayHealthy);
  const report = await runAgentHandoff(catalogWith, createFixtureFetch(healthy));
  assert.equal(report.ok, false);
  assert.equal(findingCodes(report).includes("broken_exact_link"), true);
  assert.equal(check(report, "samedaydesk", "handoff_human_review").finding, "broken_exact_link");
  assert.equal(check(report, "ein-llc", "handoff_origin").status, "not_applicable");
});

test("CLI agent-handoff overlay with surfaces exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-handoff-"));
  const fixturePath = join(dir, "healthy-handoff.json");
  writeFileSync(fixturePath, JSON.stringify(healthyDeclaredFixture()));
  const pass = spawnSync(
    process.execPath,
    [
      cli,
      "--mode",
      "agent-handoff",
      "--fixture",
      fixturePath,
      "--handoff",
      join(here, "fixtures/handoff-overlay-healthy.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(pass.status, 0, pass.stderr);
  const parsed = JSON.parse(pass.stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.findings.length, 0);
  assert.equal(parsed.sites.find((site) => site.id === "samedaydesk").advertised, true);
});

test("CLI agent-handoff reports findings with compact JSON and exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "portfolio-handoff-"));
  const overlayPath = join(dir, "overlay.json");
  writeFileSync(
    overlayPath,
    JSON.stringify({
      sites: [
        {
          id: primary.id,
          handoff: {
            origin: primaryOrigin,
            availability: "observed",
            method: "PUT",
            humanReviewUrlTemplate: "https://example.net/review/{projectId}",
          },
        },
      ],
    }),
  );
  const fail = spawnSync(
    process.execPath,
    [cli, "--mode", "agent-handoff", "--fixture", join(here, "fixtures/healthy.json"), "--handoff", overlayPath],
    { encoding: "utf8" },
  );
  assert.equal(fail.status, 1, fail.stderr);
  const parsed = JSON.parse(fail.stdout.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.mode, "agent-handoff");
  const codes = parsed.findings.map((row) => row.code);
  assert.equal(codes.includes("unsupported_method"), true);
  assert.equal(codes.includes("foreign_url"), true);
  assert.equal(parsed.handoffClaims.demand, "not_observed");
});

test("CLI --handoff requires agent-handoff mode", () => {
  const result = spawnSync(
    process.execPath,
    [cli, "--fixture", join(here, "fixtures/healthy.json"), "--handoff", join(here, "fixtures/handoff-overlay-healthy.json")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--handoff requires --mode agent-handoff/);
});

test("CLI staged catalog fixture exits 0", () => {
  const pass = spawnSync(
    process.execPath,
    [
      cli,
      "--mode",
      "agent-handoff",
      "--catalog",
      join(here, "fixtures/handoff-staged-catalog.json"),
      "--fixture",
      join(here, "fixtures/handoff-staged-responses.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(pass.status, 0, pass.stderr);
  const parsed = JSON.parse(pass.stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sites[0].origin, "https://handoff.example.test");
});
