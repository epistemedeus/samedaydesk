#!/usr/bin/env node
/**
 * Cold follow-the-doc runner for docs/agent-sds.
 *
 *   node docs/agent-sds/follow.mjs
 *     Extract ```bash blocks from quickstart.md, refuse wrong paths,
 *     run allowed commands from the repo root, check documented expects.
 *
 *   node docs/agent-sds/follow.mjs --scan
 *     Classify every ```bash block in this Diataxis set (not fixtures/).
 *
 *   node docs/agent-sds/follow.mjs --seed docs/agent-sds/fixtures/seeded-wrong-path.md
 *     Classify a seeded document and refuse wrong paths without executing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../..");
export const POLICY_PATH = join(here, "path-policy.json");
export const QUICKSTART_PATH = join(here, "quickstart.md");

export function loadPolicy(path = POLICY_PATH) {
  const policy = JSON.parse(readFileSync(path, "utf8"));
  if (policy.schema !== "samedaydesk.agent-sds.path-policy.v1") {
    throw new Error("unsupported_path_policy_schema");
  }
  if (!Array.isArray(policy.allowedPathPrefixes) || policy.allowedPathPrefixes.length === 0) {
    throw new Error("path_policy_missing_allowlist");
  }
  if (!Array.isArray(policy.refuse) || policy.refuse.length === 0) {
    throw new Error("path_policy_missing_refusals");
  }
  return policy;
}

export function extractFenced(md, lang = "bash") {
  const blocks = [];
  const re = new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g");
  let m;
  while ((m = re.exec(md))) {
    blocks.push({
      script: m[1].trim(),
      index: m.index,
      end: m.index + m[0].length,
    });
  }
  return blocks;
}

export function extractFollowSteps(md) {
  const blocks = extractFenced(md, "bash");
  return blocks.map((block) => {
    const after = md.slice(block.end);
    const expectMatch = after.match(/^\s*<!--\s*follow-expect\s+(\{[\s\S]*?\})\s*-->/);
    let expect = { exit: 0 };
    if (expectMatch) expect = JSON.parse(expectMatch[1]);
    return { script: block.script, expect };
  });
}

function stripTrailingPunct(token) {
  return token.replace(/[),.;]+$/g, "");
}

export function extractPaths(script) {
  const found = [];
  const seen = new Set();
  const push = (raw) => {
    const value = stripTrailingPunct(String(raw || "").trim());
    if (!value || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  for (const m of script.matchAll(/https?:\/\/[^\s"'`\\]+/gi)) push(m[0]);
  for (const m of script.matchAll(
    /(?:^|[\s"'`=])((?:\.\/)?(?:tools|docs|vendor|server|client|overlays|experiments|supabase)\/[^\s"'`\\]+)/g,
  )) {
    push(m[1].replace(/^\.\//, ""));
  }
  for (const m of script.matchAll(/(?:^|[\s"'`])(\/(?:extract(?:\/batch)?|api\/checkout[^\s"'`]*))/g)) {
    push(m[1]);
  }
  return found;
}

function pathKind(value) {
  if (/^https?:\/\//i.test(value)) return "url";
  if (value.startsWith("/extract") || value.startsWith("/api/")) return "route";
  return "fs";
}

function matchesRefuse(value, rule) {
  const needle = rule.match;
  if (!needle) return false;
  if (value.includes(needle)) {
    if (needle === "/extract" && value.includes("/extract/batch")) return false;
    if (needle === "/extract") {
      const isExtractRoute =
        /(?:^|https?:\/\/[^/\s]+)\/extract(?:\/batch)?(?:[/?#]|$)/i.test(value) ||
        value === "/extract" ||
        value === "/extract/batch";
      return isExtractRoute;
    }
    return true;
  }
  return false;
}

function isAllowedFsPath(value, policy) {
  const normalized = value.replace(/^\.\//, "");
  return policy.allowedPathPrefixes.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

export function classifyScript(script, policy = loadPolicy()) {
  const paths = extractPaths(script);
  const refusals = [];
  for (const path of paths) {
    const kind = pathKind(path);
    for (const rule of policy.refuse) {
      if (matchesRefuse(path, rule)) {
        refusals.push({ path, reason: rule.reason, ruleId: rule.id, kind });
        break;
      }
    }
    if (refusals.some((r) => r.path === path)) continue;
    if (kind === "url" || kind === "route") {
      refusals.push({ path, reason: "unlisted_live_or_route_path", kind });
      continue;
    }
    if (!isAllowedFsPath(path, policy)) {
      refusals.push({ path, reason: "unlisted_sds_path", kind });
    }
  }
  return {
    script,
    paths,
    refusals,
    allowed: refusals.length === 0,
  };
}

function getPath(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function parseJsonStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) throw new Error("empty_stdout");
  return JSON.parse(text);
}

export function checkExpect(result, expect = {}) {
  const failures = [];
  const wantedExit = expect.exit ?? 0;
  if (result.status !== wantedExit) {
    failures.push(`exit ${result.status} != ${wantedExit}`);
  }
  if (expect.json) {
    let parsed;
    try {
      parsed = parseJsonStdout(result.stdout);
    } catch (err) {
      failures.push(`stdout is not JSON (${err.message})`);
      return failures;
    }
    for (const [key, value] of Object.entries(expect.json)) {
      const actual = getPath(parsed, key);
      if (actual !== value) failures.push(`json.${key} ${JSON.stringify(actual)} != ${JSON.stringify(value)}`);
    }
  }
  return failures;
}

export function runScript(script, { cwd = REPO_ROOT } = {}) {
  return spawnSync("bash", ["-lc", script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 4 * 1024 * 1024,
  });
}

function listMarkdownDocs(dir = here) {
  const out = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const rel = relative(here, full);
      if (rel.split(/[\\/]/)[0] === "fixtures") continue;
      if (rel.split(/[\\/]/)[0] === "test") continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".md")) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

export function scanDocs(policy = loadPolicy()) {
  const docs = listMarkdownDocs();
  const findings = [];
  for (const file of docs) {
    const md = readFileSync(file, "utf8");
    for (const block of extractFenced(md, "bash")) {
      const classified = classifyScript(block.script, policy);
      findings.push({
        file: relative(REPO_ROOT, file),
        allowed: classified.allowed,
        refusals: classified.refusals,
        script: classified.script,
      });
    }
  }
  return findings;
}

export function followQuickstart({ policy = loadPolicy(), docPath = QUICKSTART_PATH } = {}) {
  const rel = relative(REPO_ROOT, docPath);
  const md = readFileSync(docPath, "utf8");
  const steps = extractFollowSteps(md);
  if (steps.length === 0) {
    return { ok: false, mode: "follow", doc: rel, executed: false, error: "quickstart_missing_bash" };
  }
  const ran = [];
  for (const step of steps) {
    const classified = classifyScript(step.script, policy);
    if (!classified.allowed) {
      return {
        ok: false,
        mode: "follow",
        doc: rel,
        executed: false,
        error: "quickstart_contains_wrong_path",
        refusals: classified.refusals,
        steps: ran,
      };
    }
    const result = runScript(step.script);
    const failures = checkExpect(result, step.expect);
    ran.push({
      script: step.script,
      exit: result.status,
      expect: step.expect,
      failures,
      stdoutHead: String(result.stdout || "").slice(0, 500),
      stderrHead: String(result.stderr || "").slice(0, 500),
    });
    if (failures.length > 0) {
      return {
        ok: false,
        mode: "follow",
        doc: rel,
        executed: true,
        error: "follow_expect_failed",
        steps: ran,
      };
    }
  }
  return { ok: true, mode: "follow", doc: rel, executed: true, steps: ran };
}

export function refuseSeed(seedPath, { policy = loadPolicy() } = {}) {
  const abs = resolve(REPO_ROOT, seedPath);
  const rel = relative(REPO_ROOT, abs);
  const raw = readFileSync(abs, "utf8");
  let scripts = [];
  if (rel.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (parsed.schema !== "samedaydesk.agent-sds.seeded-wrong-path.v1") {
      return { ok: false, mode: "seed", seed: rel, executed: false, error: "unsupported_seed_schema" };
    }
    scripts = Array.isArray(parsed.commands) ? parsed.commands.map(String) : [];
  } else {
    scripts = extractFenced(raw, "bash").map((b) => b.script);
  }
  const refusals = [];
  for (const script of scripts) {
    const classified = classifyScript(script, policy);
    for (const item of classified.refusals) {
      refusals.push({ ...item, script });
    }
  }
  if (refusals.length === 0) {
    return {
      ok: false,
      mode: "seed",
      seed: rel,
      executed: false,
      error: "seed_contained_no_wrong_path",
      refusals: [],
    };
  }
  return {
    ok: false,
    mode: "seed",
    seed: rel,
    executed: false,
    error: "wrong_path_refused",
    refusals,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(argv) {
  const args = argv.slice(2);
  const policy = loadPolicy();
  if (args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(
      "Usage: node docs/agent-sds/follow.mjs\n" +
        "       node docs/agent-sds/follow.mjs --scan\n" +
        "       node docs/agent-sds/follow.mjs --seed <fixture>\n",
    );
    process.exit(0);
  }
  if (args[0] === "--scan") {
    const findings = scanDocs(policy);
    const bad = findings.filter((f) => !f.allowed);
    const report = {
      ok: bad.length === 0,
      mode: "scan",
      executed: false,
      docs: findings.length,
      refusals: bad.flatMap((f) => f.refusals.map((r) => ({ file: f.file, ...r }))),
    };
    printJson(report);
    process.exit(report.ok ? 0 : 2);
  }
  if (args[0] === "--seed") {
    if (!args[1]) {
      printJson({ ok: false, mode: "seed", executed: false, error: "seed_path_required" });
      process.exit(1);
    }
    const report = refuseSeed(args[1], { policy });
    printJson(report);
    process.exit(report.error === "wrong_path_refused" ? 2 : 1);
  }
  if (args.length > 0) {
    printJson({ ok: false, mode: "follow", executed: false, error: "unknown_argument" });
    process.exit(1);
  }
  const report = followQuickstart({ policy });
  printJson(report);
  process.exit(report.ok ? 0 : 1);
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) main(process.argv);
