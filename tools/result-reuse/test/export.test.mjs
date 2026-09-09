import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { exportReuse, previewReuse } from "../src/export.mjs";
import { N45_PIN, OBSERVATION_SCHEMA, SITE_PIN, TASK_MEMORY_PIN } from "../src/pins.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixtures = join(root, "fixtures");
const cli = join(root, "cli.mjs");
const siteRoot = join(here, "../../..");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", cwd: siteRoot });
}

function options(taskId, extra = {}) {
  return {
    taskId,
    subject: `${taskId}-result`,
    sequence: 1,
    clock: "2026-09-09T10:00:00.000Z",
    ...extra,
  };
}

test("accepted page-change fixture previews a bounded observation without writing", () => {
  const preview = previewReuse(load("accepted-page-change.json"), options("rfq-and-vendor-page-watch"));
  assert.equal(preview.ok, true);
  assert.equal(preview.mode, "preview");
  assert.equal(preview.purchaseRequiresPublish, false);
  assert.equal(preview.publicSafeCertified, false);
  assert.equal(preview.evidenceKind, "user_selected_unverified");
  assert.equal(preview.observation.schema, OBSERVATION_SCHEMA);
  assert.equal(preview.observation.execute, false);
  assert.equal(preview.observation.epistemicStatus, "observed");
  assert.equal(preview.observation.source.version.startsWith("sha256:"), true);
  assert.equal(preview.observation.payload.verdict, "changed");
  assert.equal(preview.observation.payload.charged, undefined);
  assert.ok(preview.omitted.some((item) => item.reason === "filesystem_path") || preview.observation.payload.snapshot == null);
  assert.match(preview.observation.source.uri, /^https?:\/\//);
});

test("accepted extract-batch keeps failed rows and omits jsonLd by default", () => {
  const preview = previewReuse(load("accepted-extract-batch.json"), options("extract-product-jsonld"));
  assert.equal(preview.ok, true);
  assert.equal(preview.kind, "extract_batch");
  assert.equal(preview.incomplete, true);
  const failed = preview.observation.payload.sources.filter((row) => row.status === "failure");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].error.code, "missing_source");
  assert.equal(preview.observation.payload.sources[0].jsonLd, undefined);
  assert.equal(preview.observation.payload.charged, undefined);
  assert.equal(JSON.stringify(preview.observation).includes("charged"), false);
});

test("explicit selection can include jsonLd and still omits forbidden keys", () => {
  const preview = previewReuse(load("accepted-extract-batch.json"), options("extract-product-jsonld", {
    select: ["jsonLd", "title"],
  }));
  assert.equal(preview.ok, true);
  assert.ok(preview.observation.payload.sources[0].jsonLd);
  const denied = previewReuse(load("accepted-extract-batch.json"), options("denied", {
    select: ["authorization"],
  }));
  assert.equal(denied.ok, false);
  assert.match(denied.message, /forbidden/);
});

test("omission defaults strip credential strings without echoing them", () => {
  const preview = previewReuse(load("credential-strings.json"), options("cred", { select: ["title"] }));
  assert.equal(preview.ok, true);
  const blob = JSON.stringify(preview);
  assert.equal(blob.includes("tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(blob.includes("Bearer tok_"), false);
  assert.ok(preview.omitted.some((item) => item.reason === "credential_shape"));
});

test("hostile javascript URLs and HTML are omitted; recipe URI remains http(s)", () => {
  const preview = previewReuse(load("hostile-urls-html.json"), options("hostile", {
    select: ["title", "description"],
  }));
  assert.equal(preview.ok, true);
  const blob = JSON.stringify(preview.observation);
  assert.equal(blob.includes("javascript:alert"), false);
  assert.equal(blob.includes("<script>"), false);
  assert.equal(preview.observation.source.uri.startsWith("http"), true);
  assert.equal(preview.observation.execute, false);
});

test("incomplete failed extract stays exportable with failure codes", () => {
  const preview = previewReuse(load("incomplete-failed-extract.json"), options("failed-batch"));
  assert.equal(preview.ok, true);
  assert.equal(preview.incomplete, true);
  assert.equal(preview.observation.payload.sources.every((row) => row.status === "failure"), true);
});

test("actual accepted complete changed page-change is complete, not unchanged", () => {
  const preview = previewReuse(load("accepted-complete-changed-page-change.json"), options("complete-change"));
  assert.equal(preview.ok, true);
  assert.equal(preview.observation.payload.verdict, "changed");
  assert.equal(preview.observation.payload.claims.complete, true);
  assert.equal(preview.incomplete, false);
});

test("all page-change branches use one scrub path and diagnostics do not echo hostile values", () => {
  const secret = "tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const input = load("accepted-complete-changed-page-change.json");
  input.verdict = secret;
  input.fields = [{ api_key: secret }];
  input.freshness = `Bearer ${secret}`;
  input.claims = { complete: true, attackerKey: secret };
  input.summary = { matched: 1, [secret]: "value" };
  input.job = { id: secret };
  const preview = previewReuse(input, options("scrub-all"));
  assert.equal(preview.ok, true);
  const blob = JSON.stringify(preview);
  assert.equal(blob.includes(secret), false);
  assert.ok(preview.omitted.some((item) => item.reason === "credential_shape"));
});

test("explicit record report and n45 page-change result both map", () => {
  const record = previewReuse(load("accepted-record-report.json"), options("record-sku"));
  assert.equal(record.ok, true);
  assert.equal(record.kind, "explicit_record");
  assert.equal(record.observation.payload.networkUsed, false);
  assert.equal(record.observation.payload.invalidRecords[0].missing.required[0].field, "sku");
  const n45 = previewReuse(load("n45-page-change-result.json"), options("n45-example-com", {
    clock: "2026-09-09T08:00:00.000Z",
  }));
  assert.equal(n45.ok, true);
  assert.equal(n45.kind, "n45_page_change_result");
  assert.equal(n45.observation.source.uri, "https://example.com/");
  assert.equal(n45.observation.payload.payment, undefined);
  assert.equal(n45.observation.payload.publicSafe, undefined);
  assert.equal(n45.observation.payload.sourceResultAssertions.originMarkedNoPayment, true);
});

test("correction is one-way B.supersedes=A; prior A stays immutable", () => {
  const prior = previewReuse(load("n45-page-change-result.json"), options("n45-example-com", {
    clock: "2026-09-09T08:00:00.000Z",
  }));
  const frozen = JSON.stringify(prior.observation);
  const preview = previewReuse(load("n45-page-change-result.json"), options("n45-example-com", {
    recordClass: "correction",
    correctsSequence: 1,
    sequence: 2,
    clock: "2026-09-09T09:00:00.000Z",
  }));
  assert.equal(preview.ok, true);
  assert.equal(preview.observation.revisionId, "rev_2");
  assert.deepEqual(preview.observation.supersedes, {
    observationId: preview.observation.observationId,
    revisionId: "rev_1",
  });
  assert.equal(preview.observation.supersededBy, undefined);
  assert.equal(prior.observation.supersededBy, undefined);
  assert.equal(JSON.stringify(prior.observation), frozen);
  assert.equal(prior.observation.revisionId, "rev_1");
});

test("schema-valid export is not automatic public-safe certification", () => {
  const preview = previewReuse(load("accepted-page-change.json"), options("rfq-and-vendor-page-watch"));
  assert.equal(preview.ok, true);
  assert.equal(preview.publicSafeCertified, false);
  assert.equal(preview.evidenceKind, "user_selected_unverified");
  assert.equal("publicSafe" in preview.observation, false);
});

test("source versions are deterministic for the same selection and clock", () => {
  const a = previewReuse(load("accepted-page-change.json"), options("rfq-and-vendor-page-watch"));
  const b = previewReuse(load("accepted-page-change.json"), options("rfq-and-vendor-page-watch"));
  assert.equal(a.observation.source.version, b.observation.source.version);
  assert.equal(JSON.stringify(a.observation), JSON.stringify(b.observation));
});

test("identity, revision, correction, and wall clock are explicit and never truncated", () => {
  const input = load("n45-page-change-result.json");
  for (const override of [
    { taskId: undefined },
    { subject: undefined },
    { sequence: undefined },
    { clock: undefined },
    { clock: "1970-01-01" },
    { subject: "x".repeat(129) },
    { recordClass: "correction", sequence: 2, correctsSequence: 2 },
    { recordClass: "observation", correctsSequence: 1 },
  ]) {
    const result = previewReuse(input, options("identity", override));
    assert.equal(result.ok, false, JSON.stringify(override));
  }
});

test("explicit task identity prevents same-subject collisions across unrelated tasks", () => {
  const input = load("n45-page-change-result.json");
  const a = previewReuse(input, options("task-a", { subject: "result" }));
  const b = previewReuse(input, options("task-b", { subject: "result" }));
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.observation.observationId, b.observation.observationId);
});

test("programmatic and CLI inputs fail cleanly at depth, count, byte, and JSON boundaries", () => {
  const deep = load("n45-page-change-result.json");
  let cursor = deep;
  for (let i = 0; i < 30; i += 1) cursor = cursor.extra = {};
  assert.match(previewReuse(deep, options("deep")).message, /depth limit/);

  const many = load("accepted-extract-batch.json");
  many.sources = Array.from({ length: 1001 }, () => ({}));
  assert.match(previewReuse(many, options("many")).message, /1000-item/);

  const cyclic = load("n45-page-change-result.json");
  cyclic.cycle = cyclic;
  assert.equal(previewReuse(cyclic, options("cycle")).ok, false);

  const malformedShape = load("accepted-complete-changed-page-change.json");
  malformedShape.rows.matched = {};
  assert.deepEqual(previewReuse(malformedShape, options("shape")), {
    ok: false,
    message: "recognized result has invalid bounded structure",
  });

  const dir = mkdtempSync(join(tmpdir(), "n61-reuse-bounds-"));
  const malformed = join(dir, "malformed.json");
  const attack = "tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  writeFileSync(malformed, `{"value":"${attack}"`);
  const common = ["--task-id", "bounded", "--subject", "bounded-result", "--sequence", "1", "--clock", "2026-09-09T10:00:00Z"];
  const bad = runCli(["preview", "--input", malformed, ...common]);
  assert.equal(bad.status, 1);
  assert.equal(bad.stderr.includes(attack), false);
  assert.deepEqual(parseCliError(bad.stderr), { ok: false, message: "cannot read --input as bounded JSON" });

  const oversized = join(dir, "oversized.json");
  writeFileSync(oversized, JSON.stringify({ value: "x".repeat(1_048_577) }));
  const large = runCli(["preview", "--input", oversized, ...common]);
  assert.equal(large.status, 1);
  assert.deepEqual(parseCliError(large.stderr), { ok: false, message: "cannot read --input as bounded JSON" });
});

test("missing original evidence URL stays disclosed and is not promoted to observed", () => {
  const input = {
    status: "ok",
    ok: true,
    networkUsed: false,
    records: [{ status: "ok" }],
    invalidRecords: [],
  };
  const preview = previewReuse(input, options("missing-source"));
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.sourceDisclosure, {
    originalEvidenceUrlAvailable: false,
    sourceRole: "recipe_locator_not_evidence",
  });
  assert.equal(preview.observation.source.uri, "https://samedaydesk.com/for-agents");
  assert.equal(preview.observation.epistemicStatus, "source_unavailable");
  assert.match(preview.observation.statement, /original evidence URL unavailable/i);
});

function parseCliError(stderr) {
  const line = stderr.trim().split("\n").findLast((item) => item.startsWith("{"));
  return JSON.parse(line);
}

test("export refuses to write without opt-in; CLI preview does not write a file", () => {
  const denied = exportReuse(load("n45-page-change-result.json"), options("n45-example-com"));
  assert.equal(denied.ok, false);
  assert.match(denied.message, /opt-in/);
  const dir = mkdtempSync(join(tmpdir(), "n55-reuse-"));
  const out = join(dir, "should-not-exist.json");
  const preview = runCli(["preview", "--input", join(fixtures, "n45-page-change-result.json"), "--task-id", "n45-example-com", "--subject", "n45-example-com-result", "--sequence", "1", "--clock", "2026-09-09T08:00:00.000Z"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).mode, "preview");
  const missing = spawnSync("test", ["-e", out]);
  assert.equal(missing.status, 1);
  const written = runCli([
    "export",
    "--input", join(fixtures, "n45-page-change-result.json"),
    "--opt-in",
    "--out", out,
    "--task-id", "n45-example-com",
    "--subject", "n45-example-com-result",
    "--sequence", "1",
    "--clock", "2026-09-09T08:00:00.000Z",
  ]);
  assert.equal(written.status, 0, written.stderr);
  const observation = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(observation.schema, OBSERVATION_SCHEMA);
  assert.equal(observation.execute, false);
});

test("pins name the exact accepted task-memory, N45, and W15 site commits", () => {
  assert.equal(TASK_MEMORY_PIN, "d18274f1107348418971b6bccc15121afa8318cf");
  assert.equal(N45_PIN, "f4e61b6226ef4eb1f8f651bccd57f96067e4ab96");
  assert.equal(SITE_PIN, "8f0765f86ae28081df6f6cde6a78801db8aeacee");
});

test("W15 overflow CSS and overflow test stay untouched", () => {
  const names = [
    "client/src/pages/Mcp.module.css",
    "server/scripts/test-for-agents-code-overflow.js",
  ];
  const status = spawnSync("git", ["diff", "--name-only", "--", ...names], {
    encoding: "utf8",
    cwd: siteRoot,
  });
  assert.equal(status.stdout.trim(), "");
});

test("payment, homepage, and browser-path files are unchanged in this helper tree", () => {
  const names = [
    "client/index.html",
    "server/lib/payment-attempt.js",
    "server/routes/checkout.js",
    "client/src/pages/Checkout.tsx",
    "client/src/pages/Auth.tsx",
    "server/scripts/test-checkout-http-lifecycle.js",
    "server/scripts/test-payment-attempt-idempotency.js",
    "client/scripts/checkoutAttemptNavigation.test.ts",
  ];
  const status = spawnSync("git", ["diff", "--name-only", "--", ...names], {
    encoding: "utf8",
    cwd: siteRoot,
  });
  assert.equal(status.stdout.trim(), "");
});
