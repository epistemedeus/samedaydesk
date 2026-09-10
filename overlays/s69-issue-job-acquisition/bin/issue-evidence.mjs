#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");

function resolveRecipeRoot() {
  const candidates = [
    process.env.SAMEDAYDESK_RECIPES_ROOT,
    join(pkgRoot, "vendor", "recurring-job-recipes"),
    join(pkgRoot, "../../tools/recurring-job-recipes"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(join(c, "recipes/issue-evidence.mjs"))) return c;
  }
  throw new Error("cannot locate recurring-job-recipes root; set SAMEDAYDESK_RECIPES_ROOT");
}

const recipeRoot = resolveRecipeRoot();
const { values } = parseArgs({
  options: {
    help: { type: "boolean", default: false },
    "issue-url": { type: "string" },
    "evidence-fixture": { type: "string" },
    "issue-fixture": { type: "string" },
    prior: { type: "string" },
    schedule: { type: "string", default: "once" },
    clock: { type: "string" },
    horizon: { type: "string" },
    "max-comment-pages": { type: "string" },
    "per-page": { type: "string" },
    "github-token": { type: "string" },
    "out-dir": { type: "string" },
    "write-artifact": { type: "boolean", default: false },
    pretty: { type: "boolean", default: true },
  },
});

if (values.help) {
  process.stdout.write(`issue-evidence lean CLI (S62 semantics; S69 acquisition)

Node 22.x. Private-token-free default (no GITHUB_TOKEN env inference).

  node bin/issue-evidence.mjs --issue-url URL --max-comment-pages 2 --out-dir ./out --write-artifact
  node bin/issue-evidence.mjs --prior ./out/issue-evidence.seq-1.json --issue-url URL --out-dir ./out2 --write-artifact
  node bin/issue-evidence.mjs --evidence-fixture ./vendor/recurring-job-recipes/fixtures/issue-evidence/99533-base.json --schedule weekly --clock 2026-09-10T01:00:00.000Z
`);
  process.exit(0);
}

const { runIssueEvidence } = await import(pathToFileURL(join(recipeRoot, "recipes/issue-evidence.mjs")).href);
const { writeSequencedArtifact } = await import(pathToFileURL(join(recipeRoot, "lib/prior.mjs")).href);
const { sha256Hex, stableStringify } = await import(pathToFileURL(join(recipeRoot, "lib/hash.mjs")).href);

const input = {
  issueUrl: values["issue-url"],
  evidenceFixturePath: values["evidence-fixture"] ? resolve(values["evidence-fixture"]) : undefined,
  issueFixturePath: values["issue-fixture"] ? resolve(values["issue-fixture"]) : undefined,
  priorPath: values.prior ? resolve(values.prior) : undefined,
  scheduleHint: values.schedule || "once",
  clock: values.clock || new Date().toISOString(),
  horizonHours: values.horizon != null && values.horizon !== "" ? Number(values.horizon) : null,
  maxCommentPages:
    values["max-comment-pages"] != null && values["max-comment-pages"] !== ""
      ? Number(values["max-comment-pages"])
      : undefined,
  perPage: values["per-page"] != null && values["per-page"] !== "" ? Number(values["per-page"]) : undefined,
  githubToken: values["github-token"] || null,
};

if (!input.issueUrl && !input.evidenceFixturePath && !input.issueFixturePath) {
  process.stderr.write("error: supply --issue-url or --evidence-fixture\n");
  process.exit(2);
}

const result = await runIssueEvidence(input);
let persisted = { ok: true, skipped: true };
if (values["out-dir"]) {
  const outDir = resolve(values["out-dir"]);
  mkdirSync(outDir, { recursive: true });
  const stamp = (result.clock || new Date().toISOString()).replace(/[:.]/g, "-");
  const reportPath = join(outDir, `${result.recipeId || "issue-evidence"}.${stamp}.result.json`);
  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  let artifact = null;
  if (values["write-artifact"]) {
    const sequence = (result.prior?.sequence || 0) + 1;
    const body = {
      schema: "samedaydesk.recurring-job-prior.v1",
      recipeId: result.recipeId || "issue-evidence",
      createdAt: result.clock,
      sequence,
      immutable: true,
      sha256: sha256Hex(stableStringify(result.evidence)),
      payload: { evidence: result.evidence, outcome: result.outcome },
      payment: { attempted: false },
    };
    artifact = writeSequencedArtifact(outDir, result.recipeId || "issue-evidence", sequence, body);
  }
  persisted = { ok: true, reportPath, artifact };
}

const output = { ...result, persisted };
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
process.exit(result.ok || result.outcome === "stale_baseline" ? 0 : 1);
