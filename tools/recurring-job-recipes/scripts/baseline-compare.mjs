#!/usr/bin/env node
/**
 * Free direct HTTP/Git baseline vs recipe pack.
 * Matched input facts, timing, bytes, setup steps — not token claims.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const outDir = process.argv[2] ? resolve(process.argv[2]) : join("/tmp", "s21-baseline");
mkdirSync(outDir, { recursive: true });

const clock = new Date().toISOString();
const issueUrl = "https://github.com/epistemedeus/samedaydesk/issues/1";
const apiUrl = "https://api.github.com/repos/epistemedeus/samedaydesk/issues/1";

const report = {
  schema: "samedaydesk.baseline-compare.v1",
  clock,
  claims: { tokenSavings: false, externalCustomer: false, notDemand: true },
  inputs: { issueUrl, apiUrl },
  setups: [],
  runs: [],
};

function time(label, fn) {
  const started = performance.now();
  const value = fn();
  const elapsedMs = performance.now() - started;
  return { label, elapsedMs, value };
}

// Setup steps (counted for both paths)
report.setups.push({ path: "direct", steps: ["curl or fetch GitHub API", "parse JSON locally"] });
report.setups.push({
  path: "recipe",
  steps: [
    "checkout samedaydesk",
    "node tools/recurring-job-recipes/cli.mjs",
    "supply prior + issue-url + clock",
  ],
});

const direct = await (async () => {
  const started = performance.now();
  const response = await fetch(apiUrl, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "samedaydesk-s21-baseline",
      "x-github-api-version": "2022-11-28",
    },
  });
  const text = await response.text();
  const elapsedMs = performance.now() - started;
  const body = JSON.parse(text);
  return {
    path: "direct_http_git",
    status: response.status,
    bytes: Buffer.byteLength(text),
    elapsedMs,
    facts: {
      number: body.number,
      title: body.title,
      state: body.state,
      updatedAt: body.updated_at,
      bodyBytes: Buffer.byteLength(body.body || "", "utf8"),
    },
  };
})();
report.runs.push(direct);

const recipeCli = join(root, "cli.mjs");
const recipeRun = time("recipe_issue_to_work_brief", () =>
  spawnSync(
    process.execPath,
    [
      recipeCli,
      "--recipe",
      "issue-to-work-brief",
      "--prior",
      join(root, "fixtures/priors/issue-brief.prior.json"),
      "--issue-url",
      issueUrl,
      "--schedule",
      "weekly",
      "--clock",
      clock,
    ],
    { encoding: "utf8", cwd: repoRoot, env: process.env },
  ),
);
const recipeBody = recipeRun.value.status === 0 || recipeRun.value.stdout
  ? JSON.parse(recipeRun.value.stdout)
  : { ok: false, stderr: recipeRun.value.stderr };
report.runs.push({
  path: "recipe_pack",
  exitStatus: recipeRun.value.status,
  elapsedMs: recipeRun.elapsedMs,
  bytes: Buffer.byteLength(recipeRun.value.stdout || ""),
  facts: {
    number: recipeBody.evidence?.issue?.number ?? null,
    title: recipeBody.evidence?.issue?.title ?? null,
    state: recipeBody.evidence?.issue?.state ?? null,
    updatedAt: recipeBody.evidence?.issue?.updatedAt ?? null,
    bodyBytes: recipeBody.evidence?.fingerprint?.bodyBytes ?? null,
    outcome: recipeBody.outcome ?? null,
    reusableArtifact: Boolean(recipeBody.evidence?.brief && recipeBody.evidence?.markdown),
  },
});

const matched =
  direct.facts.number === report.runs[1].facts.number &&
  direct.facts.title === report.runs[1].facts.title &&
  direct.facts.state === report.runs[1].facts.state &&
  direct.facts.updatedAt === report.runs[1].facts.updatedAt &&
  direct.facts.bodyBytes === report.runs[1].facts.bodyBytes;

report.comparison = {
  matchedInputFacts: matched,
  directFirstClass: true,
  reusableArtifactImprovement: report.runs[1].facts.reusableArtifact
    ? "recipe adds immutable-prior diff, work-brief markdown, and recovery plan on top of raw issue JSON"
    : "none",
  keepDirectBaseline: "Direct GitHub HTTP remains first-class when only raw issue JSON is needed.",
  timing: {
    directMs: direct.elapsedMs,
    recipeMs: report.runs[1].elapsedMs,
  },
  bytes: {
    direct: direct.bytes,
    recipeStdout: report.runs[1].bytes,
  },
};

writeFileSync(join(outDir, "baseline-compare.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(matched && report.runs[1].exitStatus === 0 ? 0 : 1);
