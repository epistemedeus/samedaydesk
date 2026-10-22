const ALLOWED_VERBS = new Set(["list", "help"]);
const ALLOWED_LIST_FLAGS = new Set(["--json"]);

export function fail(code, message, extra = {}) {
  return { ok: false, code, error: message, ...extra };
}

function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function cliIndex(tokens) {
  return tokens.findIndex((t) => String(t).replace(/["']/g, "").endsWith("useful-jobs.mjs"));
}

function parseFrontmatter(md) {
  if (!md.startsWith("---\n")) {
    return fail("missing-frontmatter", "SKILL.md missing YAML frontmatter");
  }
  const end = md.indexOf("\n---\n", 4);
  if (end < 0) return fail("missing-frontmatter", "SKILL.md frontmatter not closed");
  const fm = md.slice(4, end);
  const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim();
  const descMatch = /^description:\s*(.+)$/m.exec(fm);
  const description = descMatch?.[1]?.trim();
  if (name !== "useful-jobs") {
    return fail("wrong-name", `SKILL.md name must be useful-jobs, got ${JSON.stringify(name)}`);
  }
  if (!description) return fail("missing-description", "SKILL.md description required");
  return { ok: true, name, description, body: md.slice(end + 5) };
}

function parseCommandLine(line, knownJobIds) {
  const tokens = tokenize(line);
  const hits = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (cliIndex(tokens.slice(i, i + 1)) !== 0) continue;
    const verb = tokens[i + 1];
    if (!verb || verb.startsWith("-")) {
      return fail("not-list-help", `missing command after useful-jobs.mjs: ${line}`);
    }
    if (verb === "run") {
      return fail("advertised-run", `SKILL.md advertises run; list and help only: ${line}`);
    }
    if (!ALLOWED_VERBS.has(verb)) {
      return fail("not-list-help", `SKILL.md advertises ${verb}; list and help only: ${line}`);
    }
    const rest = [];
    for (let j = i + 2; j < tokens.length; j += 1) {
      const t = tokens[j];
      if (t === "&&" || t === ";" || t === "||") break;
      if (cliIndex([t]) === 0) break;
      rest.push(t);
    }
    if (verb === "list") {
      for (const a of rest) {
        if (!ALLOWED_LIST_FLAGS.has(a)) {
          return fail("not-list-help", `list flag not allowed: ${a}`);
        }
      }
    }
    if (verb === "help") {
      const job = rest.find((a) => !a.startsWith("--"));
      for (const a of rest) {
        if (a.startsWith("--")) {
          return fail("not-list-help", `help flag not allowed: ${a}`);
        }
      }
      if (job && knownJobIds.length && !knownJobIds.includes(job)) {
        return fail("unknown-help-job", `help target is not a catalog job: ${job}`);
      }
    }
    hits.push({ verb, argv: [verb, ...rest], line });
  }
  return { ok: true, hits };
}

export function parseSkillMarkdown(md, { knownJobIds = [] } = {}) {
  const fm = parseFrontmatter(md);
  if (!fm.ok) return fm;

  const advertised = [];
  const fences = [...md.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)];
  for (const m of fences) {
    for (const raw of m[1].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (!/useful-jobs\.mjs/.test(line)) continue;
      const parsed = parseCommandLine(line, knownJobIds);
      if (!parsed.ok) return parsed;
      advertised.push(...parsed.hits);
    }
  }

  if (!advertised.length) {
    return fail("no-advertised-entry", "SKILL.md has no list/help entry");
  }
  if (!advertised.some((a) => a.verb === "list")) {
    return fail("no-advertised-entry", "SKILL.md must advertise list");
  }
  if (!advertised.some((a) => a.verb === "help")) {
    return fail("no-advertised-entry", "SKILL.md must advertise help");
  }

  return {
    ok: true,
    name: fm.name,
    description: fm.description,
    advertised,
  };
}
