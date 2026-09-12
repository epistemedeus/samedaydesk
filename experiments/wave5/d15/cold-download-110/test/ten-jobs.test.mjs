import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureIndependentInputs } from "../lib/inputs.mjs";
import { invokeUsefulJobs, runJob } from "../lib/invoke.mjs";
import { expectProcessOk, expectRefusal, outDir } from "./helpers.mjs";

describe("ten advertised jobs with independent supplied inputs", () => {
  it("lockfile-pin-delta no-change, useful change, and html refusal", () => {
    const fx = ensureIndependentInputs();
    const unchanged = runJob("lockfile-pin-delta", [
      "--before",
      fx.lock.before,
      "--after",
      fx.lock.afterSame,
      "--out-dir",
      outDir("lock-same"),
    ]);
    const same = expectProcessOk(unchanged, {
      jobId: "lockfile-pin-delta",
      out: outDir("lock-same"),
      analysis: /informational/i,
    });
    assert.notEqual(same.provenance, "fixture");

    const changed = runJob("lockfile-pin-delta", [
      "--before",
      fx.lock.before,
      "--after",
      fx.lock.afterChange,
      "--out-dir",
      outDir("lock-change"),
    ]);
    expectProcessOk(changed, {
      jobId: "lockfile-pin-delta",
      out: outDir("lock-change"),
      analysis: /actionable/i,
    });

    const html = runJob("lockfile-pin-delta", [
      "--before",
      fx.lock.html,
      "--after",
      fx.lock.afterChange,
      "--out-dir",
      outDir("lock-html"),
    ]);
    expectRefusal(html, /html-input/i);
  });

  it("json-schema-webhook-drift no-change, used-pointer change, and OpenAPI refusal", () => {
    const fx = ensureIndependentInputs();
    expectProcessOk(
      runJob("json-schema-webhook-drift", [
        "--before",
        fx.schema.before,
        "--after",
        fx.schema.afterSame,
        "--used",
        fx.schema.used,
        "--out-dir",
        outDir("schema-same"),
      ]),
      { jobId: "json-schema-webhook-drift", out: outDir("schema-same"), analysis: /informational/i },
    );
    expectProcessOk(
      runJob("json-schema-webhook-drift", [
        "--before",
        fx.schema.before,
        "--after",
        fx.schema.afterChange,
        "--used",
        fx.schema.used,
        "--out-dir",
        outDir("schema-change"),
      ]),
      { jobId: "json-schema-webhook-drift", out: outDir("schema-change"), analysis: /actionable/i },
    );
    expectRefusal(
      runJob("json-schema-webhook-drift", [
        "--before",
        fx.schema.openapi,
        "--after",
        fx.schema.openapi,
        "--used",
        fx.schema.used,
        "--out-dir",
        outDir("schema-openapi"),
      ]),
      /not-this-job-openapi/i,
    );
  });

  it("route-table-diff no-change, useful change, and rewrite-homepage refusal", () => {
    const fx = ensureIndependentInputs();
    expectProcessOk(
      runJob("route-table-diff", [
        "--before",
        fx.route.before,
        "--after",
        fx.route.afterSame,
        "--out-dir",
        outDir("route-same"),
      ]),
      { jobId: "route-table-diff", out: outDir("route-same") },
    );
    expectProcessOk(
      runJob("route-table-diff", [
        "--before",
        fx.route.before,
        "--after",
        fx.route.afterChange,
        "--out-dir",
        outDir("route-change"),
      ]),
      { jobId: "route-table-diff", out: outDir("route-change") },
    );
    expectRefusal(
      runJob("route-table-diff", [
        "--before",
        fx.route.before,
        "--after",
        fx.route.afterChange,
        "--out-dir",
        outDir("route-home"),
        "--rewrite-homepage",
      ]),
      /homepage_rewrite/i,
    );
  });

  it("page-change-offline-job no-change, useful change, and --example refusal", () => {
    const fx = ensureIndependentInputs();
    const same = runJob("page-change-offline-job", [
      "--job",
      fx.page.jobSame,
      "--out-dir",
      outDir("page-same"),
    ]);
    expectProcessOk(same, { jobId: "page-change-offline-job", out: outDir("page-same"), analysis: /unchanged/i });
    const changed = runJob("page-change-offline-job", [
      "--job",
      fx.page.jobChange,
      "--out-dir",
      outDir("page-change"),
    ]);
    expectProcessOk(changed, { jobId: "page-change-offline-job", out: outDir("page-change"), analysis: /changed/i });
    expectRefusal(
      runJob("page-change-offline-job", ["--example", "--out-dir", outDir("page-example")]),
      /sample_as_delivered_watch/i,
    );
  });

  it("api-upgrade-brief no-change, used-op change, and missing used refusal", () => {
    const fx = ensureIndependentInputs();
    expectProcessOk(
      runJob("api-upgrade-brief", [
        "--before",
        fx.openapi.before,
        "--after",
        fx.openapi.afterSame,
        "--used",
        fx.openapi.used,
        "--out-dir",
        outDir("openapi-same"),
      ]),
      { jobId: "api-upgrade-brief", out: outDir("openapi-same") },
    );
    expectProcessOk(
      runJob("api-upgrade-brief", [
        "--before",
        fx.openapi.before,
        "--after",
        fx.openapi.afterChange,
        "--used",
        fx.openapi.used,
        "--out-dir",
        outDir("openapi-change"),
      ]),
      { jobId: "api-upgrade-brief", out: outDir("openapi-change") },
    );
    expectRefusal(
      runJob("api-upgrade-brief", [
        "--before",
        fx.openapi.before,
        "--after",
        fx.openapi.afterChange,
        "--out-dir",
        outDir("openapi-missing"),
      ]),
      /missing-required-inputs/i,
    );
  });

  it("vendor-budget-impact no-change, price change, and missing after refusal", () => {
    const fx = ensureIndependentInputs();
    expectProcessOk(
      runJob("vendor-budget-impact", [
        "--before",
        fx.pricing.before,
        "--after",
        fx.pricing.afterSame,
        "--out-dir",
        outDir("budget-same"),
      ]),
      { jobId: "vendor-budget-impact", out: outDir("budget-same"), analysis: /informational/i },
    );
    expectProcessOk(
      runJob("vendor-budget-impact", [
        "--before",
        fx.pricing.before,
        "--after",
        fx.pricing.afterChange,
        "--out-dir",
        outDir("budget-change"),
      ]),
      { jobId: "vendor-budget-impact", out: outDir("budget-change"), analysis: /actionable/i },
    );
    expectRefusal(
      runJob("vendor-budget-impact", ["--before", fx.pricing.before, "--out-dir", outDir("budget-missing")]),
      /missing-required-inputs/i,
    );
  });

  it("feed-agenda no-change, added entry, and missing after refusal", () => {
    const fx = ensureIndependentInputs();
    expectProcessOk(
      runJob("feed-agenda", [
        "--before",
        fx.feed.before,
        "--after",
        fx.feed.afterSame,
        "--out-dir",
        outDir("feed-same"),
      ]),
      { jobId: "feed-agenda", out: outDir("feed-same") },
    );
    expectProcessOk(
      runJob("feed-agenda", [
        "--before",
        fx.feed.before,
        "--after",
        fx.feed.afterChange,
        "--out-dir",
        outDir("feed-change"),
      ]),
      { jobId: "feed-agenda", out: outDir("feed-change") },
    );
    expectRefusal(
      runJob("feed-agenda", ["--before", fx.feed.before, "--out-dir", outDir("feed-missing")]),
      /missing-required-inputs/i,
    );
  });

  it("evidence-ci-annotation pass, fail analysis, and foreign-schema refusal", () => {
    const fx = ensureIndependentInputs();
    const pass = expectProcessOk(
      runJob("evidence-ci-annotation", ["--input", fx.evidence.pass, "--out-dir", outDir("evidence-pass")]),
      { jobId: "evidence-ci-annotation", out: outDir("evidence-pass") },
    );
    assert.match(String(pass.analysisStatus || "informational"), /informational|partial/i);
    const fail = runJob("evidence-ci-annotation", ["--input", fx.evidence.fail, "--out-dir", outDir("evidence-fail")]);
    const failClass = expectProcessOk(fail, { jobId: "evidence-ci-annotation", out: outDir("evidence-fail") });
    assert.match(String(failClass.analysisStatus || ""), /refus|fail|informational|partial/i);
    expectRefusal(
      runJob("evidence-ci-annotation", ["--input", fx.evidence.foreign, "--out-dir", outDir("evidence-foreign")]),
      /refus|schema|foreign|unrecognized/i,
    );
  });

  it("listing-repair-packet complete change, identical pair, partial, and identity mismatch", () => {
    const fx = ensureIndependentInputs();
    expectProcessOk(
      runJob("listing-repair-packet", ["--input", fx.listing.same, "--out-dir", outDir("listing-same")]),
      { jobId: "listing-repair-packet", out: outDir("listing-same") },
    );
    const change = expectProcessOk(
      runJob("listing-repair-packet", ["--input", fx.listing.change, "--out-dir", outDir("listing-change")]),
      { jobId: "listing-repair-packet", out: outDir("listing-change") },
    );
    assert.match(String(change.analysisStatus || ""), /actionable|partial|informational/i);
    const partial = expectProcessOk(
      runJob("listing-repair-packet", ["--input", fx.listing.partial, "--out-dir", outDir("listing-partial")]),
      { jobId: "listing-repair-packet", out: outDir("listing-partial") },
    );
    assert.match(String(partial.analysisStatus || ""), /partial/i);
    expectRefusal(
      runJob("listing-repair-packet", ["--input", fx.listing.mismatch, "--out-dir", outDir("listing-mismatch")]),
      /mismatch|refus/i,
    );
  });

  it("repeat-job-record verified identity, missing files informational, and digest mismatch refusal", () => {
    const fx = ensureIndependentInputs();
    const verified = expectProcessOk(
      runJob("repeat-job-record", [
        "--next-run",
        fx.repeat.nextRun,
        "--input-root",
        fx.repeat.filesDir,
        "--out-dir",
        outDir("repeat-ok"),
      ]),
      { jobId: "repeat-job-record", out: outDir("repeat-ok") },
    );
    assert.match(String(verified.analysisStatus || ""), /actionable/i);
    const missing = expectProcessOk(
      runJob("repeat-job-record", [
        "--next-run",
        fx.repeat.nextRunMissing,
        "--out-dir",
        outDir("repeat-missing"),
      ]),
      { jobId: "repeat-job-record", out: outDir("repeat-missing") },
    );
    assert.match(String(missing.analysisStatus || ""), /informational/i);
    expectRefusal(
      runJob("repeat-job-record", [
        "--next-run",
        fx.repeat.nextRunMismatch,
        "--out-dir",
        outDir("repeat-mismatch"),
      ]),
      /input-digest-mismatch/i,
    );
  });

  it("treats --example lockfile as labeled fixture funding, not payment", () => {
    const run = invokeUsefulJobs({ argv: ["run", "lockfile-pin-delta", "--example"] });
    const classified = expectProcessOk(run);
    assert.equal(classified.purchaseAuthority, false);
    const blob = `${run.stdout} ${JSON.stringify(run.json || {})}`;
    assert.match(blob, /fixture|SAMPLE|example/i);
    assert.notEqual(run.json?.sold, true);
  });
});
