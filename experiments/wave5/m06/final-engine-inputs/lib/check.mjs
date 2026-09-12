import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveKit, KitIncomplete } from "./kit.mjs";
import { loadCorpus, loadPin, REPORT_SCHEMA } from "./paths.mjs";
import { loadDocuments } from "./documents.mjs";
import { observeCase } from "./cli.mjs";
import { checkWitnesses } from "./witness.mjs";
import { judge, isDefect } from "./judge.mjs";

function matchesObserved(expected, actual) {
  if (!expected) return { ok: false, problems: ["missing recorded observed"] };
  const fields = ["ok", "refused", "exitCode", "breaking", "compatible", "unknown", "usedClass", "reason", "code"];
  const problems = [];
  for (const field of fields) {
    if (expected[field] === undefined) continue;
    if (actual[field] !== expected[field]) {
      problems.push(`${field} expected ${expected[field]} got ${actual[field]}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export function runCheck({ kit } = {}) {
  const pin = loadPin();
  let resolved;
  try {
    resolved = kit || resolveKit(pin);
  } catch (err) {
    if (err instanceof KitIncomplete) {
      return { incomplete: true, error: err.message, pin };
    }
    throw err;
  }
  const corpus = loadCorpus();
  const rows = [];
  for (const entry of corpus.cases) {
    const documents = loadDocuments(entry, resolved);
    const actual = observeCase(resolved, entry, documents);
    const witnesses =
      entry.transport === "compare" || entry.transport === "kit-sample" || entry.transport === "example"
        ? checkWitnesses(
            {
              ...entry,
              used: documents.used,
              specified: entry.specified,
            },
            documents,
          )
        : { ok: true };
    const observedMatch = matchesObserved(entry.observed, actual);
    const judgment = judge(entry, actual);
    rows.push({
      id: entry.id,
      family: entry.family,
      advertised: entry.advertised !== false,
      specified: entry.specified,
      observed: {
        ok: actual.ok,
        refused: actual.refused,
        exitCode: actual.exitCode,
        status: actual.status,
        breaking: actual.breaking,
        compatible: actual.compatible,
        unknown: actual.unknown,
        unchangedCount: actual.unchangedCount,
        usedClass: actual.usedClass,
        reason: actual.reason,
        code: actual.code,
        customerBrief: actual.customerBrief,
        purchaseAuthority: actual.purchaseAuthority,
        sold: actual.sold,
        termsVersion: actual.termsVersion,
      },
      judgment,
      witnessesOk: witnesses.ok,
      witnessProblems: witnesses.problems || [],
      observedMatch: observedMatch.ok,
      observedProblems: observedMatch.problems,
      transportFailure: actual.transportFailure || !actual.parseable,
      command: actual.argv,
      cwd: actual.cwd,
    });
  }

  const defects = rows.filter((row) => isDefect(row.judgment));
  const falseSafe = defects.filter((row) => row.judgment.id === "false-safe");
  const falseUnsafe = defects.filter((row) => row.judgment.id === "false-unsafe");
  const transportFailures = rows.filter((row) => row.transportFailure);
  const witnessFailures = rows.filter((row) => !row.witnessesOk);
  const pinMismatches = rows.filter((row) => !row.observedMatch);

  const summary = {
    schema: REPORT_SCHEMA,
    verdict: transportFailures.length || witnessFailures.length ? "INCOMPLETE" : defects.length ? "FAIL" : "PASS",
    kitRoot: resolved.root,
    kitSource: resolved.source,
    defaultCli: pin.publicKit.defaultCli,
    command: `cd "$KIT" && node bin/useful-jobs.mjs run json-schema-webhook-drift --before <file> --after <file> --used <file> --out-dir <dir>`,
    cases: rows.length,
    agree: rows.filter((row) => row.judgment.id === "agree").length,
    falseSafe: falseSafe.map((row) => row.id),
    falseUnsafe: falseUnsafe.map((row) => row.id),
    wronglyCertain: defects.filter((row) => row.judgment.id === "wrongly-certain").map((row) => row.id),
    transportFailures: transportFailures.map((row) => row.id),
    witnessFailures: witnessFailures.map((row) => row.id),
    pinMismatches: pinMismatches.map((row) => row.id),
    nextOwner: "W5-M02 / D01 json-schema-webhook-drift (catalog pin 27482b712a7221e5079d70df85c5dd5608dc70eb). Root publishes after reconciliation.",
    purchaseAuthority: false,
    sold: false,
    customerBrief: false,
  };

  return { incomplete: false, pin, kit: resolved, rows, summary };
}

export function writeReport(result, outDir) {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "final-engine-inputs-report.json");
  writeFileSync(path, `${JSON.stringify({ summary: result.summary, rows: result.rows }, null, 2)}\n`);
  return path;
}

export { KitIncomplete };
