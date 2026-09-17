import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCase } from "./lib/evaluate.mjs";

test("timeout is an honest mismatch even when exitCode matches", () => {
  const result = evaluateCase(
    {
      id: "timeout-seed",
      expectProduct: { exitCode: 124 },
      expectCorpus: { productVerdict: "reject", naiveRule: "exit0" },
    },
    { exitCode: 124, timedOut: true, json: { ok: false } },
  );
  assert.equal(result.honestCasePass, false);
  assert.ok(result.mismatches.some((row) => row.path === "timedOut" && row.actual === true));
});

test("wrapper-exit0 SHA mismatch is a false-green, not a timeout pass", () => {
  const result = evaluateCase(
    {
      id: "archive-wrong-digest",
      expectProduct: { exitCode: 0, stdoutJson: { ok: false, code: "wrong-digest" } },
      expectCorpus: { productVerdict: "reject", naiveRule: "exit0" },
    },
    { exitCode: 0, timedOut: false, json: { ok: false, code: "wrong-digest" } },
  );
  assert.equal(result.honestCasePass, true);
  assert.equal(result.falseGreen, true);
  assert.equal(result.falseAccept, true);
  assert.equal(result.observed.timedOut, false);
});

test("HTTP 200 homepage-identical unknown path is a false-green under naive http-200", () => {
  const result = evaluateCase(
    {
      id: "issue1-captured-soft-404",
      expectProduct: { exitCode: 0, httpStatus: 200, kind: "soft_404", stdoutJson: { ok: false } },
      expectCorpus: { productVerdict: "reject", naiveRule: "http-200" },
    },
    {
      exitCode: 0,
      timedOut: false,
      httpStatus: 200,
      kind: "soft_404",
      json: { ok: false, kind: "soft_404" },
    },
  );
  assert.equal(result.honestCasePass, true);
  assert.equal(result.falseGreen, true);
  assert.equal(result.honestProductVerdict, "reject");
  assert.equal(result.naiveProductVerdict, "accept");
});
