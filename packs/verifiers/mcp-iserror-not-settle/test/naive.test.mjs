import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyCase } from "../src/classify.mjs";
import { naiveHttpSettle } from "../src/naive.mjs";
import { loadJson } from "../src/case.mjs";
import { SEEDED } from "./helpers.mjs";

test("naive 2xx-is-settle would accept the seeded unpaid Fix Pack; this verifier does not", () => {
  const raw = readFileSync(SEEDED, "utf8");
  const doc = JSON.parse(raw);
  const naive = naiveHttpSettle(doc.http.status, doc.rpc);
  assert.equal(naive.settled, true);
  assert.equal(naive.basis, "http_200");
  assert.equal(naive.ignoredIsError, true);

  const report = classifyCase({
    http: doc.http,
    rpc: doc.rpc,
    claim: doc.claim,
  });
  assert.equal(report.ok, false);
  assert.equal(report.verdict, "reject");
  assert.match(String(report.code), /iserror|claimed_settle|http_200/i);
});

test("loadJson of the seeded failure keeps claim.settled true", () => {
  const doc = loadJson(SEEDED);
  assert.equal(doc.claim.settled, true);
  assert.equal(doc.rpc.result.isError, true);
  assert.equal(doc.http.status, 200);
});
