import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRESENCE_SKILLS_INDEX_REL,
  SKILL_DESCRIPTIONS,
  SKILL_NAMES,
  skillUri,
} from "./catalog.mjs";
import { byteSize, sha256Uri } from "./digest.mjs";
import { REPO_ROOT, skillMdPath } from "./paths.mjs";

export function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    const err = new Error("SKILL.md must start with YAML frontmatter");
    err.code = "FRONTMATTER";
    throw err;
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) {
    const err = new Error("SKILL.md frontmatter must close");
    err.code = "FRONTMATTER";
    throw err;
  }
  const fields = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const match = /^(name|description|license):\s*(.*)$/.exec(line);
    if (!match) {
      const err = new Error(`unexpected frontmatter line: ${line}`);
      err.code = "FRONTMATTER";
      throw err;
    }
    fields[match[1]] = match[2];
  }
  if (!fields.name || !fields.description) {
    const err = new Error("frontmatter requires name and description");
    err.code = "FRONTMATTER";
    throw err;
  }
  return fields;
}

export function loadSkillFile(name) {
  const path = skillMdPath(name);
  if (!existsSync(path)) {
    const err = new Error(`committed SKILL.md missing: ${name}`);
    err.code = "MISSING_SKILL";
    err.skill = name;
    throw err;
  }
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const frontmatter = parseFrontmatter(text);
  if (frontmatter.name !== name) {
    const err = new Error(`frontmatter name ${frontmatter.name} does not match ${name}`);
    err.code = "FRONTMATTER";
    throw err;
  }
  const expected = SKILL_DESCRIPTIONS[name];
  if (frontmatter.description !== expected) {
    const err = new Error(`frontmatter description drift for ${name}`);
    err.code = "FRONTMATTER";
    err.skill = name;
    throw err;
  }
  if (/buy\.stripe\.com|cs_live_|cs_test_/i.test(text)) {
    const err = new Error(`SKILL.md ${name} must not embed Stripe checkout`);
    err.code = "PAID_REFUSE";
    throw err;
  }
  if (/(?:^|\n)[^#\n]*\b(?:PAYMENT-SIGNATURE|X-PAYMENT)\s*[:=]/i.test(text)) {
    const err = new Error(`SKILL.md ${name} must not embed payment header assignments`);
    err.code = "PAID_REFUSE";
    throw err;
  }
  return {
    name,
    path,
    text,
    bytes,
    frontmatter,
    uri: skillUri(name),
    digest: sha256Uri(bytes),
    size: byteSize(bytes),
  };
}

export function loadExpectedSkills() {
  return SKILL_NAMES.map((name) => loadSkillFile(name));
}

export function skillEntry(file) {
  return {
    uri: file.uri,
    frontmatter: { name: file.frontmatter.name, description: file.frontmatter.description },
    resources: [
      {
        uri: file.uri,
        digest: file.digest,
        size: file.size,
      },
    ],
  };
}

export function loadPresenceIndex(root = REPO_ROOT) {
  const path = join(root, PRESENCE_SKILLS_INDEX_REL);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function presenceNames(index) {
  if (!index || !Array.isArray(index.skills)) return [];
  return index.skills.map((s) => s.name);
}
