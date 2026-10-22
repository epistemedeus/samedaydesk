#!/usr/bin/env node
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractReleasedKit,
  hypotheticalGpt35,
  independentDeltas,
  listPairs,
  loadPair,
  runVendorBudget,
} from "./lib.mjs";

const kit = process.env.USEFUL_JOBS_KIT || extractReleasedKit();
const rows = [];
for (const id of listPairs()) {
  const pair = loadPair(id);
  const outDir = mkdtempSync(join(tmpdir(), `vfc-${id}-`));
  const ran = runVendorBudget({
    kit,
    beforePath: pair.beforePath,
    afterPath: pair.afterPath,
    outDir,
  });
  const art = ran.artifact || {};
  const counts = art.underlying?.counts || {};
  const expected = pair.expected;
  const fail = [];
  if (art.status !== expected.status) fail.push(`status ${art.status} != ${expected.status}`);
  for (const [key, value] of Object.entries(expected.counts || {})) {
    if (counts[key] !== value) fail.push(`counts.${key} ${counts[key]} != ${value}`);
  }
  const kinds = (art.actions || []).map((row) => row.kind);
  for (const kind of expected.actionKinds || []) {
    if (!kinds.includes(kind)) fail.push(`missing action ${kind}`);
  }
  const deltas = independentDeltas(pair.before, pair.after);
  for (const want of expected.independentArithmetic || []) {
    if (want.delta == null) continue;
    const got = deltas.find((row) => row.field === want.field && row.kind === "field-change");
    if (!got || Math.abs(got.delta - want.delta) > 1e-12) fail.push(`arithmetic ${want.field}`);
  }
  rows.push({
    id,
    kind: pair.source.kind,
    structure: pair.source.structure,
    ok: fail.length === 0,
    fail,
    engineStatus: art.status,
    engineSummary: art.summary,
    actions: kinds,
    counts,
    independentDeltas: deltas,
    wrapperDefect: expected.wrapperDefect || null,
    outDir,
    cli: {
      status: ran.proc.status,
      stdout: String(ran.proc.stdout || "").trim(),
    },
  });
}

const report = {
  kit,
  pairs: rows,
  hypotheticalUsage: hypotheticalGpt35(),
  purchaseAuthority: false,
};
writeFileSync(join(process.cwd(), "vendor-field-harness-out.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: rows.every((row) => row.ok), n: rows.length, fails: rows.filter((r) => !r.ok).map((r) => r.id) }, null, 2)}\n`);
if (!rows.every((row) => row.ok)) process.exit(1);
