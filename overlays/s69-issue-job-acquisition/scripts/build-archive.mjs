#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const overlay = join(here, "..");
const repoRoot = join(overlay, "../..");
const pin = JSON.parse(readFileSync(join(overlay, "PIN.json"), "utf8"));
const tip = pin.semanticsTip;
const staging = join(overlay, ".staging/issue-evidence-job");
const outDir = join(overlay, "dist");
const archiveName = `issue-evidence-job-${tip.slice(0, 12)}.tar.gz`;
const archivePath = join(outDir, archiveName);

rmSync(join(overlay, ".staging"), { recursive: true, force: true });
mkdirSync(join(staging, "vendor/recurring-job-recipes"), { recursive: true });
mkdirSync(outDir, { recursive: true });

const tipFiles = [
  "recipes/issue-evidence.mjs",
  "lib/cost.mjs",
  "lib/fetch.mjs",
  "lib/github-comments.mjs",
  "lib/github-issue.mjs",
  "lib/hash.mjs",
  "lib/issue-evidence-brief.mjs",
  "lib/issue-evidence-delta.mjs",
  "lib/issue-evidence-model.mjs",
  "lib/issue-evidence-prior.mjs",
  "lib/issue-evidence-transport.mjs",
  "lib/payment-guard.mjs",
  "lib/prior.mjs",
  "lib/recovery.mjs",
  "lib/work-brief.mjs",
  "specs/issue-evidence.recipe.json",
];
const recipeSrc = join(repoRoot, "tools/recurring-job-recipes");
for (const rel of tipFiles) {
  const src = join(recipeSrc, rel);
  if (!existsSync(src)) throw new Error(`missing tip file: ${rel}`);
  const dest = join(staging, "vendor/recurring-job-recipes", rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}
cpSync(join(recipeSrc, "fixtures/issue-evidence"), join(staging, "vendor/recurring-job-recipes/fixtures/issue-evidence"), {
  recursive: true,
});

const overlayFiles = [
  "bin/issue-evidence.mjs",
  "package.json",
  "PIN.json",
  "MANIFEST.json",
  "LICENSE",
  "SOURCE.txt",
  "INSTALL.txt",
  "SKILL.md",
  "docs/PRIOR-AND-CHANGE.md",
  "docs/PARTIAL-AND-RATE-LIMIT.md",
  "docs/SOURCE-LICENSE-PRIVACY.md",
  "docs/DIRECT-API-BASELINE.md",
  "docs/AGENT-EXAMPLE-99533.md",
  "scripts/install-local-skill.mjs",
];
for (const rel of overlayFiles) {
  const src = join(overlay, rel);
  if (!existsSync(src)) throw new Error(`missing overlay file: ${rel}`);
  const dest = join(staging, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}
mkdirSync(join(staging, "skill/issue-evidence"), { recursive: true });
cpSync(join(overlay, "SKILL.md"), join(staging, "skill/issue-evidence/SKILL.md"));

const packed = spawnSync("tar", ["-czf", archivePath, "-C", join(overlay, ".staging"), "issue-evidence-job"], {
  encoding: "utf8",
});
if (packed.status !== 0) throw new Error(packed.stderr || "tar failed");
const bytes = readFileSync(archivePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const receipt = {
  schema: "samedaydesk.lean-archive-receipt.v1",
  archive: archiveName,
  bytes: bytes.length,
  sha256,
  semanticsTip: tip,
  inputBase: pin.inputBase,
  builtAt: new Date().toISOString(),
};
writeFileSync(join(outDir, "archive.sha256.json"), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
