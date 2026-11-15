import { spawnSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COVERAGE_MEMBER, portableCoverage } from "./portable-coverage.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ALLOWLIST = new URL("../archive-files.txt", import.meta.url);
const MEMBERS = Object.freeze(readFileSync(ALLOWLIST, "utf8").trimEnd().split("\n"));
const MEMBER_PATH = /^(?:[\w-]+\/)+[\w.-]+$/;

export function packDelivery({ out, root = REPO_ROOT } = {}) {
  if (!out) return { ok: false, reason: "out_required" };
  let stage;
  try {
    const target = resolve(out);
    const sourceRoot = realpathSync(root);
    mkdirSync(dirname(target), { recursive: true });
    stage = mkdtempSync(join(dirname(target), ".composed-pack-"));
    const tree = join(stage, "tree");
    for (const member of MEMBERS) {
      if (!MEMBER_PATH.test(member)) throw new Error(`invalid archive member: ${member}`);
      const source = join(sourceRoot, member);
      if (!lstatSync(source).isFile() || realpathSync(source) !== source) {
        throw new Error(`archive member must be a regular file under the source root: ${member}`);
      }
      const staged = join(tree, member);
      mkdirSync(dirname(staged), { recursive: true });
      if (member === COVERAGE_MEMBER) {
        writeFileSync(staged, portableCoverage(readFileSync(source, "utf8")));
      } else {
        copyFileSync(source, staged);
      }
    }

    const candidate = join(stage, "archive.tar.gz");
    const env = { ...process.env, LC_ALL: "C" };
    delete env.TAR_OPTIONS;
    delete env.GZIP;
    const child = spawnSync("tar", [
      "-czf", candidate, "--no-recursion", "--mtime=@0", "--owner=0", "--group=0",
      "--numeric-owner", "--mode=0644", "-C", tree, ...MEMBERS,
    ], { encoding: "utf8", env });
    if (child.status !== 0) throw new Error(child.stderr || child.error?.message || "tar failed");
    renameSync(candidate, target);
    return {
      ok: true,
      artifact: out,
      root,
      members: MEMBERS,
      extract: `tar -xzf ${out} -C <empty-dir>`,
      command: "node tools/composed-machine-delivery/cli.mjs deliver --request tools/composed-machine-delivery/examples/changed-request.json --store <dir> --out <public.json>",
    };
  } catch (error) {
    return { ok: false, reason: "pack_failed", message: error.message };
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
  }
}

export function repoRoot() {
  return REPO_ROOT;
}

export function artifactMembers() {
  return MEMBERS.map((member) => join(REPO_ROOT, member));
}
