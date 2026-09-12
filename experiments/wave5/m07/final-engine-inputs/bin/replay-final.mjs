#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, fixturePath } from "../lib/corpus.mjs";
import { runShippedCli } from "../lib/run-shipped.mjs";
import { classifyFinal } from "../lib/classify-final.mjs";
import { ensureShippedEngines } from "../lib/ensure-shipped.mjs";

const PKG_ROOT = fileURLToPath(new URL("..", import.meta.url));
const corpus = loadCases();
const engines = ensureShippedEngines();
const rows = [];

for (const caseSpec of corpus.cases) {
  for (const kind of corpus.engines) {
    const cli = runShippedCli(kind, {
      before: fixturePath(caseSpec.before),
      after: fixturePath(caseSpec.after),
    });
    const finding = classifyFinal(caseSpec, cli);
    rows.push({
      ...finding,
      command: cli.argv.join(" "),
    });
  }
}

const failed = rows.filter((r) => !r.ok);
const ownerqa = rows.filter((r) => r.ownerqa);
const payload = {
  source: {
    merchant: `${engines.pin.merchant.repo}@${engines.pin.merchant.sha} ${engines.pin.merchant.ownedPath}`,
    kit: `${engines.pin.publicKit.repo}@${engines.pin.publicKit.sha} ${engines.pin.publicKit.archive}`,
    kitSha256: engines.pin.publicKit.sha256,
    d01: `${engines.pin.d01.repo}@${engines.pin.d01.sha} ${engines.pin.d01.ownedPath}`,
    merchantRoot: engines.merchantRoot,
    kitRoot: engines.kitRoot,
  },
  command: "cd experiments/wave5/m07/final-engine-inputs && node --test --test-concurrency=1 test/*.test.mjs && node bin/replay-final.mjs",
  tested: rows.length,
  passed: rows.filter((r) => r.ok).length,
  failed: failed.length,
  ownerqa: ownerqa.length,
  nBty003: 0,
  kinds: Object.fromEntries(
    ["match", "supported-unknown", "incorrect-named-delta", "engine-failure"].map((k) => [
      k,
      rows.filter((r) => r.kind === k).length,
    ]),
  ),
  rows,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

const failBlock = failed.length
  ? failed.map((f) => `- \`${f.id}\`/${f.engine}: ${f.kind} — ${f.detail}`).join("\n")
  : "none";
const nextOwner = failed.length
  ? "W5-M03 OWNERQA on shipped lockfile-pin-delta identity (not a payable N-BTY003 claim). Root reconciles after that."
  : "Root publishes after reconciliation. This worker does not merge or deploy.";
const verdict = failed.length ? "FAIL" : "PASS";
const md = `# W5-M07 final-engine-inputs

## Verdict

**${verdict}** — ${payload.passed}/${payload.tested} engine-case runs. OWNERQA defects: ${payload.ownerqa}. Payable N-BTY003: 0.

## Exact source

- Merchant: \`${payload.source.merchant}\`
- Public kit 1.2.0: \`${payload.source.kit}\` sha256 \`${payload.source.kitSha256}\`
- D01 PR74 kernel compared: \`${payload.source.d01}\`
- Merchant CLI root: \`${payload.source.merchantRoot}\`
- Kit root: \`${payload.source.kitRoot}\`

## Command

\`\`\`bash
${payload.command}
\`\`\`

## Observed

| Case | Engine | Kind | Detail |
| --- | --- | --- | --- |
${rows.map((r) => `| ${r.id} | ${r.engine} | ${r.kind} | ${String(r.detail).replace(/\|/g, "/")} |`).join("\n")}

## Failure / minimal counterexample

${failBlock}

## Next owner

${nextOwner}

Prior M07 Co11 \`e81efc8a\` corpus is preserved and is not this proof. Link-stub skip is supported unknown under npm \`link: true\` plus shipped \`entry.link === true\` continue.
`;
writeFileSync(join(PKG_ROOT, "RESULT.md"), md);
process.exit(failed.length ? 1 : 0);
