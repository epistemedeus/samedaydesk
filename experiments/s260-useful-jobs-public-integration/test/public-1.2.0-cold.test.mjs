import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USEFUL_JOBS_ARCHIVE,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_ROOT,
} from "../../../client/src/data/machineEntry.mjs";
import { ensureIndependentInputs, listingInput } from "../lib/independent-inputs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const publicArchive = join(root, "client/public", USEFUL_JOBS_ARCHIVE.replace(/^\//, ""));

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function extractOutside() {
  const outside = mkdtempSync(join(tmpdir(), "uj-120-cold-"));
  copyFileSync(publicArchive, join(outside, `${USEFUL_JOBS_ROOT}.tar.gz`));
  const tar = spawnSync("tar", ["-xzf", join(outside, `${USEFUL_JOBS_ROOT}.tar.gz`), "-C", outside], {
    encoding: "utf8",
  });
  assert.equal(tar.status, 0, tar.stderr);
  const kit = join(outside, USEFUL_JOBS_ROOT);
  assert.equal(kit.startsWith(root), false);
  assert.equal(existsSync(join(kit, "bin/useful-jobs.mjs")), true);
  return { outside, kit };
}

function runCli(kit, args) {
  return spawnSync(process.execPath, [join(kit, "bin/useful-jobs.mjs"), ...args], {
    encoding: "utf8",
    cwd: kit,
  });
}

function stdoutJson(run) {
  const text = String(run.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${run.stderr}`);
  return JSON.parse(text);
}

function packetStatus(outDir) {
  return JSON.parse(readFileSync(join(outDir, "repair-packet.json"), "utf8")).status;
}

test("1.2.0 archive bytes match current kit pin and catalog version", () => {
  const buf = readFileSync(publicArchive);
  assert.equal(buf.length, USEFUL_JOBS_ARCHIVE_BYTES);
  assert.equal(sha256(buf), USEFUL_JOBS_ARCHIVE_SHA256);
  assert.equal(USEFUL_JOBS_ROOT, "useful-jobs-1.2.0");
  const catalog = JSON.parse(
    readFileSync(join(root, "client/public/for-agents/useful-jobs/catalog.json"), "utf8"),
  );
  const pin = JSON.parse(
    readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.2.0.sha256.json"), "utf8"),
  );
  assert.equal(catalog.version, "1.2.0");
  assert.equal(catalog.jobs.length, 10);
  assert.equal(catalog.jobs[0].id, "lockfile-pin-delta");
  assert.equal(pin.sha256, USEFUL_JOBS_ARCHIVE_SHA256);
  assert.equal(pin.bytes, buf.length);
});

test("cold 1.2.0 listing-repair: unknown and declared providers, partial/full, mismatch", () => {
  const { outside, kit } = extractOutside();
  try {
    const fxRoot = join(outside, "independent-inputs");
    const fx = ensureIndependentInputs(fxRoot);
    const cases = [
      { name: "grexal-partial", path: fx.listing.partial, expected: "partial" },
      {
        name: "agensi-partial",
        path: join(fxRoot, "listing/agensi-partial.json"),
        body: listingInput({
          inputId: "d15-listing-agensi-partial",
          jobRef: "d15-listing-agensi-partial",
          kind: "partial",
          provider: "agensi",
        }),
        expected: "partial",
      },
      {
        name: "d15cold-partial",
        path: join(fxRoot, "listing/d15cold-partial.json"),
        mutate: () => {
          const input = JSON.parse(readFileSync(fx.listing.partial, "utf8"));
          input.identity.provider = "d15cold";
          return input;
        },
        expected: "partial",
      },
      { name: "grexal-change", path: fx.listing.change, expected: "actionable" },
      {
        name: "agensi-change",
        path: join(fxRoot, "listing/agensi-change.json"),
        body: listingInput({
          inputId: "d15-listing-agensi-change",
          jobRef: "d15-listing-agensi-change",
          kind: "change",
          provider: "agensi",
        }),
        expected: "actionable",
      },
      {
        name: "d15cold-complete",
        path: join(fxRoot, "listing/d15cold-complete.json"),
        body: listingInput({
          inputId: "d15-listing-d15cold-complete",
          jobRef: "d15-listing-d15cold-complete",
          kind: "change",
          provider: "d15cold",
        }),
        expected: "refused",
      },
      { name: "grexal-agensi-mismatch", path: fx.listing.mismatch, expected: "refused" },
    ];

    for (const spec of cases) {
      if (spec.body) writeFileSync(spec.path, `${JSON.stringify(spec.body, null, 2)}\n`);
      if (spec.mutate) writeFileSync(spec.path, `${JSON.stringify(spec.mutate(), null, 2)}\n`);
      const out = join(outside, `out-${spec.name}`);
      const run = runCli(kit, ["run", "listing-repair-packet", "--input", spec.path, "--out-dir", out]);
      assert.equal(run.status, 0, `${spec.name}: ${run.stderr}\n${run.stdout}`);
      const body = stdoutJson(run);
      assert.equal(body.ok, true, spec.name);
      assert.equal(body.status, spec.expected, spec.name);
      assert.equal(packetStatus(out), spec.expected, spec.name);
      assert.notEqual(body.sold, true);
    }

    const missing = runCli(kit, ["run", "listing-repair-packet", "--out-dir", join(outside, "out-listing-missing")]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stdout + missing.stderr, /missing-required-inputs/i);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("cold 1.2.0: ten advertised jobs independent positive and refusal smokes", () => {
  const { outside, kit } = extractOutside();
  try {
    const fx = ensureIndependentInputs(join(outside, "independent-inputs"));

    function expectOk(jobId, args, out, analysis) {
      const run = runCli(kit, ["run", jobId, ...args, "--out-dir", out]);
      assert.equal(run.status, 0, `${jobId}: ${run.stderr}\n${run.stdout}`);
      const body = stdoutJson(run);
      assert.equal(body.ok, true, jobId);
      assert.equal(body.purchaseAuthority, false);
      if (analysis) assert.match(String(body.status || ""), analysis);
      return body;
    }

    function expectRefuse(jobId, args, pattern) {
      const run = runCli(kit, ["run", jobId, ...args]);
      assert.notEqual(run.status, 0, jobId);
      assert.match(run.stdout + run.stderr, pattern);
    }

    expectOk(
      "lockfile-pin-delta",
      ["--before", fx.lock.before, "--after", fx.lock.afterChange],
      join(outside, "out-lock-change"),
      /actionable/i,
    );
    expectRefuse(
      "lockfile-pin-delta",
      ["--before", fx.lock.html, "--after", fx.lock.afterChange, "--out-dir", join(outside, "out-lock-html")],
      /html-input/i,
    );

    expectOk(
      "json-schema-webhook-drift",
      ["--before", fx.schema.before, "--after", fx.schema.afterChange, "--used", fx.schema.used],
      join(outside, "out-schema-change"),
      /actionable/i,
    );
    expectRefuse(
      "json-schema-webhook-drift",
      [
        "--before",
        fx.schema.openapi,
        "--after",
        fx.schema.openapi,
        "--used",
        fx.schema.used,
        "--out-dir",
        join(outside, "out-schema-openapi"),
      ],
      /not-this-job-openapi/i,
    );

    expectOk(
      "route-table-diff",
      ["--before", fx.route.before, "--after", fx.route.afterChange],
      join(outside, "out-route-change"),
    );
    const home = runCli(kit, [
      "run",
      "route-table-diff",
      "--before",
      fx.route.before,
      "--after",
      fx.route.afterChange,
      "--out-dir",
      join(outside, "out-route-home"),
      "--rewrite-homepage",
    ]);
    assert.notEqual(home.status, 0);
    assert.match(home.stdout + home.stderr, /homepage_rewrite/i);

    expectOk("page-change-offline-job", ["--job", fx.page.jobChange], join(outside, "out-page-change"), /changed/i);
    const pageExample = runCli(kit, ["run", "page-change-offline-job", "--example", "--out-dir", join(outside, "out-page-example")]);
    assert.notEqual(pageExample.status, 0);
    assert.match(pageExample.stdout + pageExample.stderr, /sample_as_delivered_watch/i);

    expectOk(
      "api-upgrade-brief",
      ["--before", fx.openapi.before, "--after", fx.openapi.afterChange, "--used", fx.openapi.used],
      join(outside, "out-openapi-change"),
    );
    expectRefuse(
      "api-upgrade-brief",
      ["--before", fx.openapi.before, "--after", fx.openapi.afterChange, "--out-dir", join(outside, "out-openapi-missing")],
      /missing-required-inputs/i,
    );

    expectOk(
      "vendor-budget-impact",
      ["--before", fx.pricing.before, "--after", fx.pricing.afterChange],
      join(outside, "out-budget-change"),
      /actionable/i,
    );
    expectRefuse(
      "vendor-budget-impact",
      ["--before", fx.pricing.before, "--out-dir", join(outside, "out-budget-missing")],
      /missing-required-inputs/i,
    );

    expectOk(
      "feed-agenda",
      ["--before", fx.feed.before, "--after", fx.feed.afterChange],
      join(outside, "out-feed-change"),
    );
    expectRefuse(
      "feed-agenda",
      ["--before", fx.feed.before, "--out-dir", join(outside, "out-feed-missing")],
      /missing-required-inputs/i,
    );

    expectOk("evidence-ci-annotation", ["--input", fx.evidence.pass], join(outside, "out-evidence-pass"));
    expectRefuse(
      "evidence-ci-annotation",
      ["--input", fx.evidence.foreign, "--out-dir", join(outside, "out-evidence-foreign")],
      /refus|schema|foreign|unrecognized|invalid/i,
    );

    const listingChange = expectOk(
      "listing-repair-packet",
      ["--input", fx.listing.change],
      join(outside, "out-listing-change"),
    );
    assert.match(String(listingChange.status), /actionable|partial|informational/i);
    const listingPartial = expectOk(
      "listing-repair-packet",
      ["--input", fx.listing.partial],
      join(outside, "out-listing-partial"),
      /partial/i,
    );
    assert.equal(listingPartial.status, "partial");
    expectRefuse(
      "listing-repair-packet",
      ["--out-dir", join(outside, "out-listing-missing")],
      /missing-required-inputs/i,
    );

    expectOk(
      "repeat-job-record",
      ["--next-run", fx.repeat.nextRun, "--input-root", fx.repeat.filesDir],
      join(outside, "out-repeat-ok"),
      /actionable/i,
    );
    expectRefuse(
      "repeat-job-record",
      ["--next-run", fx.repeat.nextRunMismatch, "--out-dir", join(outside, "out-repeat-mismatch")],
      /input-digest-mismatch/i,
    );
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
