#!/usr/bin/env node
import { loadCorpus, fixturePath } from "../lib/corpus.mjs";
import { runEngineCli } from "../lib/engine-cli.mjs";
import { classifyReplay } from "../lib/classify.mjs";
import { ensureEngineRoot, enginePin } from "../lib/ensure-engine.mjs";

const corpus = loadCorpus();
const engineRoot = ensureEngineRoot();
const pin = enginePin();
const rows = [];

for (const caseSpec of corpus.cases) {
  const cli = runEngineCli({
    before: fixturePath(caseSpec.before),
    after: fixturePath(caseSpec.after),
  });
  const finding = classifyReplay(caseSpec, cli);
  rows.push(finding);
}

const failed = rows.filter((r) => !r.ok);
process.stdout.write(
  `${JSON.stringify(
    {
      engine: { sha: pin.sha, root: engineRoot },
      tested: rows.length,
      passed: rows.filter((r) => r.ok).length,
      failed: failed.length,
      kinds: Object.fromEntries(
        ["match", "gap", "valid-refusal", "engine-failure"].map((k) => [
          k,
          rows.filter((r) => r.kind === k).length,
        ]),
      ),
      rows,
    },
    null,
    2,
  )}\n`,
);
process.exit(failed.length ? 1 : 0);
