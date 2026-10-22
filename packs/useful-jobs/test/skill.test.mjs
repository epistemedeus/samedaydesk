import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { MANIFEST, PACK_ROOT, PIN, SKILL_PATH } from "../lib/paths.mjs";
import { parseSkillMarkdown } from "../lib/parse-skill.mjs";

test("SKILL.md has machine-readable frontmatter named useful-jobs", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  assert.ok(md.startsWith("---\n"));
  assert.match(md, /^name:\s*useful-jobs\s*$/m);
  assert.match(md, /^description:/m);
});

test("SKILL.md advertises list and help only", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  const parsed = parseSkillMarkdown(md, { knownJobIds: PIN.jobs });
  assert.equal(parsed.ok, true, parsed.error);
  const verbs = new Set(parsed.advertised.map((a) => a.verb));
  assert.deepEqual([...verbs].sort(), ["help", "list"]);
  assert.ok(parsed.advertised.some((a) => a.argv.join(" ") === "list"));
  assert.ok(parsed.advertised.some((a) => a.argv.join(" ") === "help"));
  assert.ok(parsed.advertised.some((a) => a.argv.join(" ") === "help lockfile-pin-delta"));
  assert.ok(parsed.advertised.some((a) => a.argv.join(" ") === "help api-upgrade-brief"));
  assert.ok(parsed.advertised.some((a) => a.argv.join(" ") === "list --json"));
});

test("SKILL.md fenced commands never include run", () => {
  const md = readFileSync(SKILL_PATH, "utf8");
  const fences = [...md.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)].map((m) => m[1]);
  assert.ok(fences.length >= 1);
  for (const body of fences) {
    assert.doesNotMatch(body, /\buseful-jobs\.mjs\s+run\b/);
  }
});

test("manifest places SKILL.md at next-archive root", () => {
  assert.equal(MANIFEST.includeInNextArchive.length, 1);
  assert.equal(MANIFEST.includeInNextArchive[0].source, "packs/useful-jobs/SKILL.md");
  assert.equal(MANIFEST.includeInNextArchive[0].archivePath, "SKILL.md");
  assert.deepEqual(MANIFEST.advertisedCommands, ["list", "help"]);
  assert.equal(PIN.skill.archivePath, "SKILL.md");
  assert.equal(join(PACK_ROOT, "SKILL.md"), SKILL_PATH);
});
