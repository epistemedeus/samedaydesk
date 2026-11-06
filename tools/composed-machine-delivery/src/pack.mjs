import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const MEMBERS = [
  "tools/composed-machine-delivery",
  "tools/task-repeat-use",
  "tools/workflow-owned-extensions",
  "tools/two-sided-work-consumer",
  "tools/recurring-decision-consumer",
  "tools/result-reuse",
  "tools/task-bundle-economics",
  "tools/recurring-job-recipes",
  "vendor/hosted-wallet-market/src/fee.mjs",
  "vendor/hosted-wallet-market/src/public-route-limit.mjs",
  "client/src/data",
  "docs/receiving/h155030-sds-consumer-composition-20261106",
  "docs/receiving/h155060-sds-combined-release-qualification-20261106",
];

const EXCLUDES = [
  "tools/composed-machine-delivery/receiving",
  "tools/composed-machine-delivery/dist",
  "tools/task-repeat-use/TERMINAL.md",
  "tools/workflow-owned-extensions/N7-RECEIVING.md",
  "tools/two-sided-work-consumer/examples/TERMINAL-RECEIPT.md",
  "tools/two-sided-work-consumer/examples/whole-effort-receipt.json",
];

export function packDelivery({ out, root = REPO_ROOT } = {}) {
  if (!out) return { ok: false, reason: "out_required" };
  mkdirSync(dirname(out), { recursive: true });
  const args = ["-czf", out];
  for (const exclude of EXCLUDES) args.push(`--exclude=${exclude}`);
  args.push("-C", root, ...MEMBERS);
  const child = spawnSync("tar", args, { encoding: "utf8" });
  if (child.status !== 0) {
    return { ok: false, reason: "pack_failed", message: child.stderr || child.error?.message || "tar failed" };
  }
  return {
    ok: true,
    artifact: out,
    root,
    members: MEMBERS,
    excludes: EXCLUDES,
    extract: `tar -xzf ${out} -C <empty-dir>`,
    command: "node tools/composed-machine-delivery/cli.mjs deliver --request tools/composed-machine-delivery/examples/changed-request.json --store <dir> --out <public.json>",
  };
}

export function repoRoot() {
  return REPO_ROOT;
}

export function artifactMembers() {
  return MEMBERS.map((member) => join(REPO_ROOT, member));
}
