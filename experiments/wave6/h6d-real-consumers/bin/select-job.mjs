#!/usr/bin/env node
/**
 * H6D job-selection CLI.
 * Lists and selects real OSS consumer jobs. Does not grant purchase, network,
 * or scheduler authority. Projections that are not equivalent are labeled.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, MIGRATIONS, loadCatalog, selectJob } from "../lib/catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const usage = `h6d-select-job — pick a useful-jobs 1.4.0 real-corpus consumer

Usage:
  node bin/select-job.mjs list [--family lockfile|schemaWebhook|apiRoutes|pageSnapshots] [--json]
  node bin/select-job.mjs show <id> [--json]
  node bin/select-job.mjs migrations [--json]
  node bin/select-job.mjs run <id> [-- extra adapter args…]

Honesty:
  purchaseAuthority=false. schedulerDaemon=false. No live fetch.
  OpenAPI path+method is not an SDS route table.
  HTML is not extract-batch. yarn.lock is not npm package-lock.
`;

function die(code, message, extra = {}) {
  const body = { ok: false, error: message, purchaseAuthority: false, ...extra };
  process.stderr.write(`${JSON.stringify(body)}\n`);
  process.exit(code);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
  process.stdout.write(usage);
  process.exit(0);
}

if (cmd === "migrations") {
  printJson({ ok: true, equivalent: false, migrations: MIGRATIONS, purchaseAuthority: false });
  process.exit(0);
}

if (cmd === "list") {
  const familyFlag = argv.includes("--family") ? argv[argv.indexOf("--family") + 1] : null;
  const asJson = argv.includes("--json");
  if (familyFlag && !FAMILIES.includes(familyFlag)) {
    die(2, `unknown family ${familyFlag}`, { families: FAMILIES });
  }
  const catalog = loadCatalog();
  const rows = familyFlag ? catalog.byFamily[familyFlag] : catalog.consumers;
  if (asJson) {
    printJson({
      ok: true,
      family: familyFlag || "all",
      counts: catalog.counts,
      purchaseAuthority: false,
      jobs: rows.map((r) => ({
        id: r.id,
        family: r.family,
        jobId: r.jobId,
        repo: r.repo,
        ready: r.ready,
        testsPass: r.testsPass,
        migrationEquivalent: r.migration?.equivalent === true ? true : false,
      })),
    });
    process.exit(0);
  }
  for (const r of rows) {
    const ready = r.ready ? "ready" : "pending";
    const tests = r.testsPass ? "tests-pass" : "tests-open";
    process.stdout.write(`${r.id}\t${r.family || "?"}\t${r.jobId || "?"}\t${ready}\t${tests}\t${r.repo || ""}\n`);
  }
  process.exit(0);
}

if (cmd === "show" || cmd === "run") {
  const id = argv[1];
  if (!id) die(2, "missing-job-id");
  let rec;
  try {
    rec = selectJob(id);
  } catch (err) {
    die(2, err.code || err.message, { id });
  }
  if (cmd === "show") {
    printJson({
      ok: true,
      purchaseAuthority: false,
      schedulerDaemon: false,
      job: {
        id: rec.id,
        family: rec.family,
        jobId: rec.jobId,
        repo: rec.repo,
        path: rec.path,
        ready: rec.ready,
        testsPass: rec.testsPass,
        owned: rec.owned,
        acquisition: rec.acquisition,
        result: rec.result
          ? {
              status: rec.result.status,
              testsPass: rec.result.testsPass,
              testCounts: rec.result.testCounts,
              source: rec.result.source,
            }
          : null,
        migration: rec.migration || null,
        migrationsNote: rec.migration?.equivalent === false
          ? "This consumer uses a labeled non-equivalent projection. See `migrations`."
          : null,
      },
    });
    process.exit(0);
  }

  const adapter = join(rec.dir, "adapter.mjs");
  if (!existsSync(adapter)) {
    die(2, "adapter-not-ready", { id, dir: rec.dir });
  }
  const extra = argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : argv.slice(2);
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
  const r = spawnSync(process.execPath, [adapter, ...extra], {
    cwd: rec.dir,
    env,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status == null ? 1 : r.status);
}

die(2, `unknown-command ${cmd}`);
