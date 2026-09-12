import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { PIN } from "../lib/resolve-kit.mjs";
import { input, kit, parseStdout, run, tmpOut } from "./helpers.mjs";

const shipped = kit();
const SDS = input("d01-spa-shells.json");

function refuse(before, after) {
  const result = run({ before, after, outDir: tmpOut() });
  const body = parseStdout(result);
  assert.equal(result.status, 2, `expected refuse, stderr=${result.stderr} stdout=${result.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  return body;
}

function ok(before, after) {
  const result = run({ before, after, outDir: tmpOut() });
  const body = parseStdout(result);
  assert.equal(result.status, 0, `expected ok, stderr=${result.stderr} stdout=${result.stdout}`);
  assert.equal(body.ok, true);
  return body;
}

test("shipped kit pin: useful-jobs 1.2.0 CLI is present", () => {
  assert.equal(shipped.sha256, PIN.publicKit.sha256);
  assert.equal(existsSync(shipped.bin), true);
  const pkg = JSON.parse(readFileSync(join(shipped.root, "package.json"), "utf8"));
  assert.equal(pkg.version, "1.2.0");
  const catalog = JSON.parse(readFileSync(join(shipped.root, "catalog.json"), "utf8"));
  const job = catalog.jobs.find((job) => job.id === "route-table-diff");
  assert.ok(job, "route-table-diff must be one of the ten public jobs");
  assert.equal(job.pin.sha, PIN.publicKit.enginePin);
});

test("positive add: kit h04 sample adds /for-agents/useful-jobs, not unsupported", () => {
  const before = join(shipped.root, "samples/routes/h04-route-01/before.json");
  const after = join(shipped.root, "samples/routes/h04-route-01/after.json");
  const body = ok(before, after);
  assert.equal(body.outcome, "changed");
  assert.equal(body.breaking, false);
  assert.deepEqual(body.added, ["/for-agents/useful-jobs"]);
  assert.equal(body.removed.length, 0);
  assert.notEqual(body.code, "unsupported_catalog");
});

test("positive remove: dropping /for-agents/useful-jobs is breaking, not unsupported", () => {
  const body = ok(SDS, input("d01-spa-shells-minus-useful-jobs.json"));
  assert.equal(body.outcome, "breaking");
  assert.equal(body.breaking, true);
  assert.deepEqual(body.removed, ["/for-agents/useful-jobs"]);
  assert.equal(body.added.length, 0);
});

test("positive add on D01 extract: restoring useful-jobs is changed, not unsupported", () => {
  const body = ok(input("d01-spa-shells-minus-useful-jobs.json"), SDS);
  assert.equal(body.outcome, "changed");
  assert.equal(body.breaking, false);
  assert.deepEqual(body.added, ["/for-agents/useful-jobs"]);
  assert.equal(body.removed.length, 0);
});

test("same identities, reverse order: permutation with equal digest.v2", () => {
  const body = ok(SDS, input("d01-spa-shells-permuted.json"));
  assert.equal(body.outcome, "permutation");
  assert.equal(body.breaking, false);
  assert.equal(body.orderChanged, true);
  assert.equal(body.counts.added, 0);
  assert.equal(body.counts.removed, 0);
  assert.equal(body.counts.changed, 0);
  assert.equal(body.tableDigest.before, body.tableDigest.after);
  assert.match(body.tableDigest.before, /^sha256:[0-9a-f]{64}$/);
});

test("trailing slash is claimed SDS identity, not an added route", () => {
  const body = ok(SDS, input("d01-spa-shells-trailing-slash.json"));
  assert.equal(body.breaking, false);
  assert.ok(body.outcome === "no-change" || body.outcome === "permutation");
  assert.equal(body.counts.added, 0);
  assert.equal(body.counts.removed, 0);
  assert.equal(body.tableDigest.before, body.tableDigest.after);
});

test("case is not claimed: /Terms is a different path from /terms", () => {
  const body = ok(SDS, input("d01-spa-shells-case.json"));
  assert.equal(body.outcome, "breaking");
  assert.equal(body.breaking, true);
  assert.ok(body.removed.includes("/terms"));
  assert.ok(body.added.includes("/Terms"));
});

test("method-only Express records are unsupported_catalog, not SDS routes", () => {
  const body = refuse(input("method-only.json"), SDS);
  assert.equal(body.code, "unsupported_catalog");
});

test("GET+POST with SDS fields on one path collide; method is not identity", () => {
  const body = ok(input("method-sds-single.json"), input("method-get-post-sds-same-path.json"));
  assert.notEqual(body.code, "unsupported_catalog");
  assert.equal(body.ok, true);
  assert.equal(body.breaking, true);
  assert.equal(body.outcome, "breaking");
  const hit = body.collisions.find((item) => item.kind === "path" && item.path === "/v1/projects/:projectId/events");
  assert.ok(hit, `expected path collision, got ${JSON.stringify(body.collisions)}`);
  assert.equal(body.added.length, 0);
  assert.equal(body.removed.length, 0);
});

test("Next-shaped [slug] with SDS fields is accepted as a literal path, not unsupported", () => {
  const body = ok(input("wildcard-literal-sds.json"), input("wildcard-literal-sds.json"));
  assert.equal(body.outcome, "no-change");
  assert.equal(body.breaking, false);
});

test("Next-shaped [slug] with SDS fields is a literal path add, not a wildcard parser", () => {
  const body = ok(SDS, input("d01-spa-shells-plus-wildcard.json"));
  assert.notEqual(body.code, "unsupported_catalog");
  assert.equal(body.outcome, "changed");
  assert.deepEqual(body.added, ["/tools/[slug]"]);
  assert.equal(body.removed.length, 0);
});

test("Express source file is unparseable JSON, not invented SDS routes", () => {
  const body = refuse(input("express-correspondence.excerpt.mjs"), SDS);
  assert.equal(body.code, "invalid_catalog");
  assert.equal(body.added, undefined);
});

test("Next App Router source is unparseable JSON, not invented SDS routes", () => {
  const body = refuse(input("next-app-router.excerpt.tsx"), SDS);
  assert.equal(body.code, "invalid_catalog");
});

test("genuine SDS OpenAPI paths map is unsupported_catalog, not hashed equal", () => {
  const body = refuse(input("openapi-presence.excerpt.json"), SDS);
  assert.equal(body.code, "unsupported_catalog");
  assert.equal(body.detail?.format, "openapi");
});

test("kit OpenAPI YAML sample is not an SDS catalog", () => {
  const yaml = join(shipped.root, "samples/openapi/a/before.yaml");
  const body = refuse(yaml, SDS);
  assert.equal(body.code, "invalid_catalog");
});

test("homepage path is refused; this check does not write shells", () => {
  const body = refuse(input("homepage.json"), SDS);
  assert.equal(body.code, "homepage_rewrite_refused");
});

test("CLI --rewrite-homepage is refused", () => {
  const result = run({
    before: SDS,
    after: SDS,
    outDir: tmpOut(),
    extraArgs: ["--rewrite-homepage"],
  });
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.code, "homepage_rewrite_refused");
});
