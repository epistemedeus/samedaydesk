import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  HERE,
  KIT_ARCHIVE,
  RELEASED_BYTES,
  RELEASED_SHA256,
  assertReleasedArchive,
  extractReleasedKit,
  hypotheticalGpt35,
  independentDeltas,
  listPairs,
  loadPair,
  runVendorBudget,
  sha256File,
} from "../lib.mjs";

describe("vendor-budget-impact field corpus on released 1.4.0", { timeout: 180_000 }, () => {
  const kit = extractReleasedKit();

  it("git archive matches published 1.4.0 provenance", () => {
    const pin = assertReleasedArchive();
    assert.equal(sha256File(KIT_ARCHIVE), RELEASED_SHA256);
    assert.equal(pin.bytes, RELEASED_BYTES);
  });

  it("released CLI help names vendor-budget-impact rows", () => {
    const help = spawnSync(process.execPath, [join(kit, "bin/useful-jobs.mjs"), "help", "vendor-budget-impact"], {
      encoding: "utf8",
      cwd: kit,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /vendor-budget-impact/);
    assert.match(help.stdout, /--before/);
    assert.match(help.stdout, /field/);
  });

  for (const id of listPairs()) {
    it(`pair ${id} matches expected status and independent arithmetic`, () => {
      const pair = loadPair(id);
      const ran = runVendorBudget({
        kit,
        beforePath: pair.beforePath,
        afterPath: pair.afterPath,
        outDir: mkdtempSync(join(tmpdir(), `vfc-test-${id}-`)),
      });
      assert.equal(ran.proc.status, 0, ran.proc.stderr + ran.proc.stdout);
      const art = ran.artifact;
      assert.equal(art.purchaseAuthority, false);
      assert.equal(art.status, pair.expected.status);
      const counts = art.underlying.counts;
      for (const [key, value] of Object.entries(pair.expected.counts || {})) {
        assert.equal(counts[key], value, `${id} counts.${key}`);
      }
      const kinds = art.actions.map((row) => row.kind);
      for (const kind of pair.expected.actionKinds || []) {
        assert.equal(kinds.includes(kind), true, `${id} missing ${kind}: ${kinds}`);
      }
      const deltas = independentDeltas(pair.before, pair.after);
      for (const want of pair.expected.independentArithmetic || []) {
        if (want.delta == null) continue;
        const got = deltas.find((row) => row.field === want.field && row.kind === "field-change");
        assert.ok(got, `${id} missing delta ${want.field}`);
        assert.ok(Math.abs(got.delta - want.delta) < 1e-12);
      }
      if (pair.expected.engineOmitsMagnitudes) {
        const blob = JSON.stringify(art.actions);
        assert.equal(blob.includes("0.0015"), false);
        assert.equal(blob.includes("0.0005"), false);
      }
    });
  }

  it("hypothetical usage is arithmetic on the GPT-3.5 pair, not a bill", () => {
    const hyp = hypotheticalGpt35();
    assert.equal(hyp.notACustomerInvoice, true);
    assert.equal(hyp.beforeUsd, 19);
    assert.equal(hyp.afterUsd, 8);
    assert.equal(hyp.deltaUsd, -11);
    assert.ok(hyp.missingBeforeAnyBill.length >= 3);
  });

  it("owned path stays under experiments/wave5-heavy/vendor-field-corpus", () => {
    assert.match(HERE, /experiments\/wave5-heavy\/vendor-field-corpus$/);
  });
});
