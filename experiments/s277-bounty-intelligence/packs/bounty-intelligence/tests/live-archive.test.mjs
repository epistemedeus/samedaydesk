import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PACK } from "./helpers.mjs";
import { rank, selectOne } from "../src/index.mjs";

test("archived live capture exists with timestamps and moltbook failure", () => {
  const indexPath = join(PACK, "receipts/live-capture/index.json");
  assert.equal(existsSync(indexPath), true);
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.equal(index.dataLabel, "live-capture");
  assert.equal(index.bounded, true);
  assert.equal(index.crawl, false);
  assert.ok(index.capturedAt);
  const by = Object.fromEntries(index.captures.map((c) => [c.adapter, c]));
  for (const name of ["moltjobs", "frantic", "github-issues", "neomorphic-schedule", "moltbook"]) {
    assert.ok(by[name], name);
  }
  assert.ok(by.moltbook.error);
  assert.equal(by.moltbook.httpStatus, null);
});

test("archived live records still never rank moltbook/github/lab as paid jobs", () => {
  const recs = [];
  for (const a of ["moltjobs", "frantic", "github-issues", "neomorphic-schedule", "moltbook"]) {
    const j = JSON.parse(readFileSync(join(PACK, "receipts/live-capture", `${a}.json`), "utf8"));
    recs.push(...(j.records || []));
  }
  const now = "2026-09-11T15:30:00.000Z";
  const result = rank(recs, { effortHours: "0" }, { now });
  for (const r of result.annotated) {
    if (r.source.inaccessible || r.source.labSchedule || r.source.adapter === "github-issues") {
      assert.equal(r.status.availablePaidJob, false);
    }
  }
  const sel = selectOne(recs, { effortHours: "0" }, { now });
  if (sel.match) {
    assert.equal(sel.selected.adapter, "frantic");
    assert.ok(sel.selected.prerequisites.length > 0);
    assert.equal(sel.selected.claimAuthority, "none");
  } else {
    assert.equal(sel.reason, "no_genuinely_claimable_paid_job");
  }
});
