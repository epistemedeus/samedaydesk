import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyWrapperCliResult } from "../src/classify.mjs";
import { runWrapperCli, REPO_ROOT } from "../src/run-wrapper-cli.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const OWNED = join(here, "..");
export const CALLER = join(REPO_ROOT, "server/paid-useful-jobs/fixtures/caller");

export const budgetBefore = join(CALLER, "vendor-budget-impact/before.json");
export const budgetAfter = join(CALLER, "vendor-budget-impact/after.json");
export const feedBefore = join(CALLER, "feed-agenda/before.xml");
export const feedAfter = join(CALLER, "feed-agenda/after.xml");
export const evidencePass = join(CALLER, "evidence-ci-annotation/input.json");
export const htmlRefuse = join(OWNED, "fixtures/pricing/not-pricing.html");
export const oaBefore = join(OWNED, "fixtures/openapi/before.yaml");
export const oaUsedRemoved = join(OWNED, "fixtures/openapi/after-used-removed.yaml");
export const oaUnusedOnly = join(OWNED, "fixtures/openapi/after-unused-only.yaml");
export const oaUsed = join(OWNED, "fixtures/openapi/used.json");

export function writeNoteOnlyAfter(dest) {
  const before = JSON.parse(readFileSync(budgetBefore, "utf8"));
  writeFileSync(
    dest,
    `${JSON.stringify({ ...before, note: "Unrelated caller note; rows unchanged." }, null, 2)}\n`,
  );
  return dest;
}

export function writeEvidenceFail(dest) {
  const packet = JSON.parse(readFileSync(evidencePass, "utf8"));
  packet.decision = "fail";
  packet.jobId = "caller-fail";
  packet.limitations = ["identity missing (caller fail path)"];
  writeFileSync(dest, `${JSON.stringify(packet, null, 2)}\n`);
  return dest;
}

export function writeEvidenceBadSchema(dest) {
  const packet = JSON.parse(readFileSync(evidencePass, "utf8"));
  packet.schema = "not-a-supported-schema";
  writeFileSync(dest, `${JSON.stringify(packet, null, 2)}\n`);
  return dest;
}

export function writeRepeatDigestMismatch(workDir) {
  const root = join(workDir, "input-root");
  mkdirSync(root, { recursive: true });
  copyFileSync(join(CALLER, "repeat-job-record/input-root/before.json"), join(root, "before.json"));
  copyFileSync(join(CALLER, "repeat-job-record/input-root/after.json"), join(root, "after.json"));
  const manifest = JSON.parse(
    readFileSync(join(CALLER, "repeat-job-record/next-run-with-root.json"), "utf8"),
  );
  manifest.currentInputs.after.sha256 = "0".repeat(64);
  const nextRun = join(workDir, "next-run.json");
  writeFileSync(nextRun, `${JSON.stringify(manifest, null, 2)}\n`);
  return { nextRun, inputRoot: root };
}

export function runJob(jobId, flags, outDir) {
  const args = ["run", jobId, ...flags];
  if (outDir) args.push("--out-dir", outDir);
  const result = runWrapperCli(args);
  const classified = classifyWrapperCliResult(result, { jobId, outDir });
  return { result, classified };
}
