#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const overlay = join(here, "..");
const { values } = parseArgs({
  options: {
    runtime: { type: "string", default: "grok" },
    home: { type: "string" },
    from: { type: "string" },
    "allow-default-home": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
if (values.help || !values.home) {
  process.stdout.write(
    "node scripts/install-local-skill.mjs --runtime grok|hermes|project --home <disposable> [--from archive|dir]\n",
  );
  process.exit(values.help ? 0 : 2);
}
const home = resolve(values.home);
const defaults = [resolve(homedir(), ".grok"), resolve(homedir(), ".hermes")];
if (defaults.includes(home) && !values["allow-default-home"]) {
  process.stderr.write("error: refusing default ~/.grok or ~/.hermes without --allow-default-home\n");
  process.exit(2);
}
const from = values.from ? resolve(values.from) : join(overlay, "SKILL.md");
let skillSrc;
let unpackDir = null;
if (from.endsWith(".tar.gz") || from.endsWith(".tgz")) {
  unpackDir = mkdtempSync(join(tmpdir(), "s69-unpack-"));
  const tar = spawnSync("tar", ["-xzf", from, "-C", unpackDir], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(tar.stderr || "unpack failed");
  skillSrc = join(unpackDir, "issue-evidence-job/skill/issue-evidence/SKILL.md");
  if (!existsSync(skillSrc)) skillSrc = join(unpackDir, "issue-evidence-job/SKILL.md");
} else if (from.endsWith("SKILL.md")) skillSrc = from;
else if (existsSync(join(from, "skill/issue-evidence/SKILL.md"))) skillSrc = join(from, "skill/issue-evidence/SKILL.md");
else if (existsSync(join(from, "SKILL.md"))) skillSrc = join(from, "SKILL.md");
else throw new Error(`cannot locate SKILL.md from ${from}`);

const skillsDir =
  values.runtime === "project"
    ? join(home, ".grok", "skills", "issue-evidence")
    : join(home, "skills", "issue-evidence");
mkdirSync(skillsDir, { recursive: true });
cpSync(skillSrc, join(skillsDir, "SKILL.md"));
const md = readFileSync(join(skillsDir, "SKILL.md"), "utf8");
if (!md.startsWith("---\n")) throw new Error("SKILL.md missing YAML frontmatter");
if (unpackDir) rmSync(unpackDir, { recursive: true, force: true });
process.stdout.write(
  `${JSON.stringify({ ok: true, runtime: values.runtime, home, skillsDir, skillPath: join(skillsDir, "SKILL.md"), bytes: Buffer.byteLength(md) }, null, 2)}\n`,
);
