#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { listRecipes, persistResult, runRecipe } from "./lib/run.mjs";
import { exportLocalNeomorphicImport, previewLocalNeomorphicImport } from "./neomorphic-import/local.mjs";
import { writeFileSync } from "node:fs";

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
    "issue-url": { type: "string" },
    "issue-fixture": { type: "string" },
    "docs-url": { type: "string" },
    "gateway-origin": { type: "string" },
    retries: { type: "string", default: "2" },
    "out-dir": { type: "string" },
    "write-artifact": { type: "boolean", default: false },
    "replay-payment": { type: "boolean", default: false },
    "neomorphic-preview": { type: "boolean", default: false },
    "neomorphic-export": { type: "boolean", default: false },
    "task-id": { type: "string" },
    subject: { type: "string" },
    sequence: { type: "string" },
    "opt-in": { type: "boolean", default: false },
    "import-out": { type: "string" },
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
  issueUrl: values["issue-url"],
  issueFixturePath: values["issue-fixture"] ? resolve(values["issue-fixture"]) : undefined,
  docsUrl: values["docs-url"],
  gatewayOrigin: values["gateway-origin"],
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

let neomorphic = null;
if (values["neomorphic-preview"] || values["neomorphic-export"]) {
  const options = {
    taskId: values["task-id"] || `recipe-${recipeId}`,
    subject: values.subject || recipeId,
    sequence: Number(values.sequence || (result.prior?.sequence || 0) + 1),
    clock: result.clock || input.clock,
    optIn: values["opt-in"],
  };
  if (values["neomorphic-export"]) {
    neomorphic = exportLocalNeomorphicImport(result, options);
    if (neomorphic.ok && values["import-out"]) {
      writeFileSync(resolve(values["import-out"]), `${JSON.stringify(neomorphic.observation, null, 2)}\n`);
    }
  } else {
    neomorphic = previewLocalNeomorphicImport(result, options);
  }
}

const output = { ...result, persisted, neomorphic };
process.stdout.write(`${values.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output)}\n`);
process.exit(result.ok || result.outcome === "stale_baseline" ? 0 : 1);

function usage() {
  return `SameDayDesk recurring job recipes (one-shot; no cron, no daemon, no purchase).

Recipes: source-change-alert, comparable-record-extraction, verification-reconcile,
issue-to-work-brief, buyer-setup-trace.

Usage:
  node tools/recurring-job-recipes/cli.mjs --list
  node tools/recurring-job-recipes/cli.mjs --recipe source-change-alert \\
    --prior ${rel("fixtures/priors/source-change.prior.json")} \\
    --current-fixture ${rel("fixtures/current/example-unchanged.json")} \\
    --fields title --schedule daily --clock 2026-09-09T16:00:00.000Z --horizon 168
  node tools/recurring-job-recipes/cli.mjs --recipe issue-to-work-brief \\
    --prior ${rel("fixtures/priors/issue-brief.prior.json")} \\
    --issue-fixture ${rel("fixtures/issues/samedaydesk-1.json")} \\
    --schedule weekly --clock 2026-09-09T16:00:00.000Z
  node tools/recurring-job-recipes/cli.mjs --recipe buyer-setup-trace \\
    --schedule once --clock "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

Optional local Neomorphic observation (shared mode undeployed, not fabricated):
  ... --neomorphic-preview --task-id owner-qa --subject issue-1 --sequence 1
  ... --neomorphic-export --opt-in --import-out /tmp/observation.json --task-id owner-qa --subject issue-1 --sequence 1

Schedule-neutral specs: tools/recurring-job-recipes/specs/*.recipe.json
Does not install cron, deploy, purchase, or start an always-on service.`;
}

function rel(path) {
  return join("tools/recurring-job-recipes", path);
}
