#!/usr/bin/env node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES } from "../lib/corpus.mjs";
import { evaluateReport } from "../lib/evaluate.mjs";
import { resolveKit } from "../lib/kit.mjs";
import { materializeCases } from "../lib/materialize.mjs";
import { CASES_ROOT } from "../lib/paths.mjs";
import { readWrittenReport, runJob } from "../lib/run-shipped.mjs";

const id = process.argv[2];
if (!id) {
  process.stderr.write("usage: node bin/run-case.mjs <case-id>\n");
  process.exit(2);
}
const caseDef = CASES.find((item) => item.id === id);
if (!caseDef) {
  process.stderr.write(JSON.stringify({ ok: false, error: `unknown case ${id}` }) + "\n");
  process.exit(2);
}

materializeCases();
const kit = resolveKit();
const jobPath = join(CASES_ROOT, caseDef.id, "job.json");
const outDir = mkdtempSync(join(tmpdir(), `m09-fei-${caseDef.id}-`));
const spawn = runJob(kit, { jobPath, outDir, extraArgs: caseDef.extraArgs });
const written = readWrittenReport(outDir);
const result = evaluateReport(caseDef, spawn, written);
process.stdout.write(
  JSON.stringify(
    {
      command: spawn.command,
      kitRoot: kit.root,
      engineVersion: kit.engineVersion,
      jobPath,
      outDir,
      exitCode: spawn.exitCode,
      result,
    },
    null,
    2,
  ) + "\n",
);
process.exit(result.ok && spawn.exitCode === (caseDef.expected.exitCode ?? 0) ? 0 : 1);
