#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ROOT } from "../test/helpers.mjs";
import { loadPins } from "../lib/paths.mjs";

const outRoot = join(ROOT, "artifact");
mkdirSync(outRoot, { recursive: true });
const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=768" };
const bin = join(ROOT, "bin/vendor-change-ci.mjs");

function run(fixture, dir, expectStatus) {
  const dest = join(outRoot, dir);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const proc = spawnSync(process.execPath, [bin, "run", "--fixture", fixture, "--out-dir", dest], {
    encoding: "utf8",
    cwd: ROOT,
    env,
    timeout: 60_000,
  });
  if (proc.status !== expectStatus) {
    throw new Error(`${fixture} exit ${proc.status} expected ${expectStatus}\n${proc.stdout}\n${proc.stderr}`);
  }
  return { dest, stdout: proc.stdout, status: proc.status };
}

const openai = run("openai-gpt35-turbo-20230613-20240125", "openai", 0);
const hostile = run("hostile-partial-capture", "hostile", 2);
const pins = loadPins();

const summary = {
  schema: "samedaydesk.hg04.vendor-change-ci.export.v1",
  kit: {
    version: pins.released.version,
    sha256: pins.released.sha256,
    bytes: pins.released.bytes,
    sourceCommit: pins.released.sourceCommit,
    urls: pins.released.urls,
  },
  candidate141: {
    version: pins.candidate.version,
    status: pins.candidate.status,
    pr: pins.candidate.pr,
    sha256: pins.candidate.sha256,
    bytes: pins.candidate.bytes,
  },
  openai: JSON.parse(readFileSync(join(openai.dest, "machine-action.json"), "utf8")),
  hostile: JSON.parse(readFileSync(join(hostile.dest, "machine-action.json"), "utf8")),
  invoiceClaim: false,
  forecast: false,
  purchaseAuthority: false,
  autoUpdateBaselineOnFailure: false,
  exportedAt: new Date().toISOString(),
};

writeFileSync(join(outRoot, "export.json"), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(
  join(outRoot, "export.md"),
  [
    "# hg04 vendor-change-ci export",
    "",
    `Released kit: useful-jobs **${pins.released.version}** sha256 \`${pins.released.sha256}\` (${pins.released.bytes} bytes).`,
    `Public pair: OpenAI GPT-3.5 Turbo 2023-06-13 vs 2024-01-25 -> machine action **${summary.openai.kind}** (ci=${summary.openai.ci}).`,
    `Hostile partial capture -> machine action **${summary.hostile.kind}** (ci=${summary.hostile.ci}).`,
    "No invoice, no forecast, no baseline rewrite, no purchase authority.",
    "",
  ].join("\n"),
);

const files = [
  "bin/vendor-change-ci.mjs",
  "bin/vendor-change-ci.py",
  "bin/obtain-kit.mjs",
  "lib/truth.mjs",
  "pins.json",
  "fixtures/openai-gpt35-turbo-20230613-20240125/expected.json",
  "fixtures/hostile-partial-capture/expected.json",
];
const hashes = Object.fromEntries(files.map((rel) => [rel, createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex")]));
writeFileSync(join(outRoot, "source-sha256.json"), `${JSON.stringify(hashes, null, 2)}\n`);
if (existsSync(join(openai.dest, "vendor-change-ci.md"))) {
  copyFileSync(join(openai.dest, "vendor-change-ci.md"), join(outRoot, "openai-review.md"));
}
if (existsSync(join(hostile.dest, "vendor-change-ci.md"))) {
  copyFileSync(join(hostile.dest, "vendor-change-ci.md"), join(outRoot, "hostile-review.md"));
}
process.stdout.write(`${JSON.stringify({ ok: true, outRoot, openai: summary.openai.kind, hostile: summary.hostile.kind }, null, 2)}\n`);
