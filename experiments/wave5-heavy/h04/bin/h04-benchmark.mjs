#!/usr/bin/env node
import { loadCatalog } from "../src/catalog.mjs";
import { describeEngine, loadEngines } from "../src/engines.mjs";
import { replayAll } from "../src/m01-replay.mjs";
import { COMPOSITION_SHA, observedCompositionSha } from "../src/m01.mjs";
import { runCatalog } from "../src/run-examples.mjs";
import { runSmoke } from "../src/smoke.mjs";

function usage() {
  return `h04-benchmark — useful-job harness (read-only engine worktrees)

Commands:
  list    Show pinned engines and catalog examples
  smoke   Run each engine --help and --example (SAMPLE, not a customer job)
  run     Execute catalog examples against pinned W4/SDS52 engines
  m01     Replay catalog against M01 composition ${COMPOSITION_SHA}

From experiments/wave5-heavy/h04:
  node bin/h04-benchmark.mjs smoke
  node bin/h04-benchmark.mjs run
  node bin/h04-benchmark.mjs m01
  node bin/h04-benchmark.mjs list

Engines write --out-dir under runs/. SAMPLE/--example is never a paid sale.
`;
}

function emit(obj, code = 0) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exit(code);
}

const cmd = process.argv[2];

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(usage());
  process.exit(0);
}

if (cmd === "list") {
  const { engines, source } = loadEngines();
  const catalog = loadCatalog();
  emit({
    ok: true,
    source,
    engines: engines.map(describeEngine),
    catalog: {
      examples: catalog.examples.map((e) => ({
        id: e.id,
        family: e.family,
        kind: e.kind ?? null,
        engines: e.engines ?? e.engineId ?? null,
        dir: e.dir,
        expectedReport: Boolean(e.expectedReportPath),
      })),
      missingFamilies: catalog.missingFamilies,
      errors: catalog.errors,
    },
  });
}

if (cmd === "smoke") {
  const summary = await runSmoke();
  emit({ ok: true, command: "smoke", ...summary });
}

if (cmd === "run") {
  const summary = await runCatalog();
  emit({ ok: true, command: "run", ...summary });
}

if (cmd === "m01") {
  const summary = await replayAll();
  emit({
    ok: true,
    command: "m01",
    compositionSha: COMPOSITION_SHA,
    observedSha: observedCompositionSha(),
    ...summary,
  });
}

process.stderr.write(`unknown command ${cmd}\n`);
process.stdout.write(usage());
process.exit(2);
