#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fixturePath } from "../lib/corpus.mjs";
import { engineLibIndexPath, ensureEngineRoot, enginePin } from "../lib/ensure-engine.mjs";

const root = ensureEngineRoot();
const lib = engineLibIndexPath();
const { compareLockfileTexts, createHashTermsAdapter } = await import(pathToFileURL(lib).href);

const before = readFileSync(fixturePath("fixtures/npm-v3-integrity/before.json"), "utf8");
const after = readFileSync(fixturePath("fixtures/npm-v3-integrity/after.json"), "utf8");

const constantAdapter = createHashTermsAdapter(() => "constant-injected-hash");
const constantReport = compareLockfileTexts(before, after, { hashPinTerms: constantAdapter.hashPinTerms });
const defaultReport = compareLockfileTexts(before, after);

const beforeDoc = JSON.parse(before);
const afterDoc = JSON.parse(after);
const beforeIntegrity = beforeDoc.packages["node_modules/m07-alpha"].integrity;
const afterIntegrity = afterDoc.packages["node_modules/m07-alpha"].integrity;

process.stdout.write(
  `${JSON.stringify({
    engineSha: enginePin().sha,
    engineRoot: root,
    integrityBytesDiffer: beforeIntegrity !== afterIntegrity,
    defaultChanged: defaultReport.counts.changed,
    constantChanged: constantReport.counts.changed,
    defaultStatus: defaultReport.status,
    constantStatus: constantReport.status,
    defaultKinds: defaultReport.changed[0]?.changeKinds || [],
    constantUnchanged: constantReport.counts.unchanged,
    finding: "constant-hasher-redefines-byte-equality",
  })}\n`,
);
