#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { listRecipes, persistResult, runRecipe } from "./lib/run.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", default: false },
    list: { type: "boolean", default: false },
    recipe: { type: "string" },
    prior: { type: "string" },
    candidate: { type: "string" },
    "current-fixture": { type: "string" },
    sources: { type: "string" },
    fields: { type: "string", default: "title" },
    schedule: { type: "string" },
    clock: { type: "string" },
    horizon: { type: "string" },
    "live-safe": { type: "boolean", default: false },
    "live-url": { type: "string" },
    "mounted-origin": { type: "boolean", default: false },
    retries: { type: "string", default: "2" },
    "out-dir": { type: "string" },
    "write-artifact": { type: "boolean", default: false },
    "replay-payment": { type: "boolean", default: false },
    pretty: { type: "boolean", default: true },
  },
});

if (values.help || (!values.list && !values.recipe && positionals.length === 0)) {
  process.stdout.write(`${usage()}\n`);
  process.exit(values.help ? 0 : 2);
}

if (values.list) {
  process.stdout.write(`${JSON.stringify(listRecipes(), null, 2)}\n`);
  process.exit(0);
}

const recipeId = values.recipe || positionals[0];
const input = {
  priorPath: values.prior ? resolve(values.prior) : undefined,
  candidatePath: values.candidate ? resolve(values.candidate) : undefined,
  currentFixturePath: values["current-fixture"] ? resolve(values["current-fixture"]) : undefined,
  fields: String(values.fields || "title")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  scheduleHint: values.schedule || null,
  clock: values.clock || new Date().toISOString(),
  horizonHours: values.horizon != null && values.horizon !== "" ? Number(values.horizon) : null,
  liveSafe: values["live-safe"],
  liveUrl: values["live-url"] || "https://example.com/",
  allowMountedOrigin: values["mounted-origin"],
  retries: Number(values.retries || 2),
  replayPayment: values["replay-payment"],
  sources: values.sources
    ? values.sources.split(",").map((item) => {
        const trimmed = item.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return { kind: "live_safe", url: trimmed };
        }
        return { kind: "fixture", path: resolve(trimmed) };
      })
    : undefined,
};

const result = await runRecipe(recipeId, input);
const persisted = persistResult(result, {
  outDir: values["out-dir"] ? resolve(values["out-dir"]) : undefined,
  writeArtifact: values["write-artifact"],
});

const output = { ...result, persisted };
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
process.exit(result.ok || result.outcome === "stale_baseline" ? 0 : 1);

function usage() {
  return `SameDayDesk recurring job recipes (one-shot; no cron, no daemon, no purchase).

Recipes reuse accepted page-change and structured-record contracts offline.
Operator supplies input and schedule. Priors are immutable. Partial and error
rows stay visible. Payment is never automatically replayed.

Usage:
  node tools/recurring-job-recipes/cli.mjs --list
  node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \\
    --prior ${rel("fixtures/priors/source-change.prior.json")} \\
    --current-fixture ${rel("fixtures/current/example-unchanged.json")} \\
    --schedule daily --clock 2026-09-09T15:00:00.000Z --horizon 168
  node tools/recurring-job-recipes/cli.mjs --recipe comparable-record-extraction \\
    --prior ${rel("fixtures/priors/record-extract.prior.json")} \\
    --sources ${rel("fixtures/pages/example-a.html")},${rel("fixtures/pages/example-b-partial.html")} \\
    --fields title,h1 --schedule weekly --clock 2026-09-09T15:00:00.000Z
  node tools/recurring-job-recipes/cli.mjs --recipe verification-reconcile \\
    --prior ${rel("fixtures/priors/verify.prior.json")} \\
    --candidate ${rel("fixtures/current/verify-candidate-unchanged.json")} \\
    --schedule daily --clock 2026-09-09T15:00:00.000Z

Safe live dry-run (free public HTML only; still not zero marginal cost):
  node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \\
    --prior ${rel("fixtures/priors/source-change.prior.json")} \\
    --live-safe --live-url https://example.com/ \\
    --fields title --schedule daily --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

Does not deploy, purchase, or start an always-on service.`;
}

function rel(path) {
  return join("tools/recurring-job-recipes", path);
}
