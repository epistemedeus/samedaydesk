#!/usr/bin/env node
/**
 * Prove useful-jobs SKILL.md advertises list/help only, overlay it onto
 * extracted 1.4.7, and run those commands against the real CLI.
 */
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PIN, SEEDED_RUN_SKILL, SKILL_PATH } from "../lib/paths.mjs";
import { parseSkillMarkdown } from "../lib/parse-skill.mjs";
import { bindEngine, overlaySkill } from "../lib/bind.mjs";
import { EXIT, envelope, exitFor } from "../lib/envelope.mjs";

function usage() {
  return `Usage:
  node packs/useful-jobs/bin/prove.mjs
  node packs/useful-jobs/bin/prove.mjs prove
  node packs/useful-jobs/bin/prove.mjs lint
  node packs/useful-jobs/bin/prove.mjs --seeded-failure advertised-run
  node packs/useful-jobs/bin/prove.mjs --seeded-failure unknown-job
  node packs/useful-jobs/bin/prove.mjs --skill <path>

Hashes committed useful-jobs 1.4.7, extracts outside the git tree, copies
SKILL.md to the extract root (next-archive overlay), and runs advertised
list/help. Does not publish. Does not invoke run.
`;
}

function parseArgs(argv) {
  const args = {
    command: "prove",
    skillPath: SKILL_PATH,
    seeded: null,
    keep: false,
    help: false,
  };
  const rest = [...argv];
  if (rest[0] === "prove" || rest[0] === "lint") {
    args.command = rest.shift();
  } else if (rest[0] === "help" || rest[0] === "--help" || rest[0] === "-h") {
    args.help = true;
    return args;
  }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--keep") args.keep = true;
    else if (a === "--skill") {
      const p = rest[i + 1];
      if (!p || p.startsWith("-")) return { error: "usage", message: "--skill requires a path" };
      args.skillPath = p;
      i += 1;
    } else if (a === "--seeded-failure") {
      const name = rest[i + 1];
      if (!name || name.startsWith("-")) {
        return { error: "usage", message: "--seeded-failure requires advertised-run or unknown-job" };
      }
      args.seeded = name;
      args.command = "seeded";
      i += 1;
    } else {
      return { error: "usage", message: `unknown argument: ${a}` };
    }
  }
  return args;
}

function emit(env) {
  process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  process.exit(exitFor(env));
}

function lintSkill(skillPath) {
  const md = readFileSync(skillPath, "utf8");
  return parseSkillMarkdown(md, { knownJobIds: PIN.jobs });
}

function runCli(cli, argv, cwd) {
  return spawnSync(process.execPath, [cli, ...argv], {
    encoding: "utf8",
    cwd,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function prove(skillPath, { keep } = {}) {
  const parsed = lintSkill(skillPath);
  if (!parsed.ok) {
    return envelope({
      ok: false,
      command: "prove",
      status: "fail",
      skillPath,
      code: parsed.code,
      error: parsed.error,
    });
  }

  let bound;
  try {
    bound = bindEngine();
  } catch (err) {
    return envelope({
      ok: false,
      command: "prove",
      status: "fail",
      skillPath,
      code: err.code || "RUNTIME",
      error: err.message,
      detail: err.extra || null,
    });
  }

  const overlay = overlaySkill(bound.kitRoot, SKILL_PATH);
  const results = [];
  for (const entry of parsed.advertised) {
    const r = runCli(bound.cli, entry.argv, bound.kitRoot);
    results.push({
      argv: entry.argv,
      status: r.status,
      stdoutPreview: String(r.stdout || "").slice(0, 400),
      stderrPreview: String(r.stderr || "").slice(0, 200),
    });
    if (r.status !== 0) {
      if (!keep) rmSync(bound.extractRoot, { recursive: true, force: true });
      return envelope({
        ok: false,
        command: "prove",
        status: "fail",
        skillPath,
        archiveOverlay: overlay,
        advertised: parsed.advertised,
        engine: {
          version: bound.version,
          sha256: bound.sha256,
          bytes: bound.bytes,
          kitRoot: bound.kitRoot,
        },
        results,
        code: "advertised-entry-failed",
        error: `advertised ${entry.argv.join(" ")} exited ${r.status}`,
        childStatus: r.status,
        childStderr: r.stderr,
        childStdout: r.stdout,
      });
    }
  }

  const listJson = runCli(bound.cli, ["list", "--json"], bound.kitRoot);
  let jobs = [];
  if (listJson.status === 0) {
    try {
      jobs = JSON.parse(listJson.stdout).jobs.map((j) => j.id);
    } catch {
      jobs = [];
    }
  }
  const expected = PIN.jobs;
  const missing = expected.filter((id) => !jobs.includes(id));
  if (listJson.status !== 0 || missing.length || jobs.length !== expected.length) {
    if (!keep) rmSync(bound.extractRoot, { recursive: true, force: true });
    return envelope({
      ok: false,
      command: "prove",
      status: "fail",
      skillPath,
      archiveOverlay: overlay,
      advertised: parsed.advertised,
      engine: {
        version: bound.version,
        sha256: bound.sha256,
        bytes: bound.bytes,
        kitRoot: bound.kitRoot,
      },
      results,
      jobs,
      code: "job-list-mismatch",
      error: missing.length
        ? `list missing job ids: ${missing.join(", ")}`
        : "list --json did not return the ten pinned jobs",
    });
  }

  if (!keep) rmSync(bound.extractRoot, { recursive: true, force: true });
  return envelope({
    ok: true,
    command: "prove",
    status: "pass",
    skillPath,
    archiveOverlay: "SKILL.md",
    advertised: parsed.advertised.map(({ verb, argv }) => ({ verb, argv })),
    engine: {
      version: bound.version,
      sha256: bound.sha256,
      bytes: bound.bytes,
    },
    results,
    jobs,
  });
}

function seededAdvertisedRun() {
  const parsed = lintSkill(SEEDED_RUN_SKILL);
  return envelope({
    ok: false,
    command: "seeded-failure",
    status: "fail",
    skillPath: SEEDED_RUN_SKILL,
    code: parsed.code || "advertised-run",
    error: parsed.error || "expected advertised-run refusal",
  });
}

function seededUnknownJob() {
  let bound;
  try {
    bound = bindEngine();
  } catch (err) {
    return envelope({
      ok: false,
      command: "seeded-failure",
      status: "error",
      code: err.code || "RUNTIME",
      error: err.message,
    });
  }
  const r = runCli(bound.cli, ["help", "not-a-job"], bound.kitRoot);
  rmSync(bound.extractRoot, { recursive: true, force: true });
  const blob = `${r.stdout || ""}${r.stderr || ""}`;
  const refused = r.status === 2 && /unknown job not-a-job/.test(blob);
  return envelope({
    ok: false,
    command: "seeded-failure",
    status: refused ? "fail" : "error",
    code: refused ? "unknown-job" : "seed-did-not-refuse",
    error: refused
      ? "unknown job not-a-job"
      : `expected help not-a-job to exit 2, got ${r.status}`,
    childStatus: r.status,
    childStderr: r.stderr,
    childStdout: r.stdout,
    engine: {
      version: bound.version,
      sha256: bound.sha256,
      bytes: bound.bytes,
    },
  });
}

const parsedArgs = parseArgs(process.argv.slice(2));
if (parsedArgs.error) {
  emit(
    envelope({
      ok: false,
      command: "prove",
      status: "usage",
      code: "usage",
      error: parsedArgs.message,
    }),
  );
}
if (parsedArgs.help) {
  process.stderr.write(usage());
  process.exit(EXIT.OK);
}

if (parsedArgs.command === "lint") {
  const parsed = lintSkill(parsedArgs.skillPath);
  if (!parsed.ok) {
    emit(
      envelope({
        ok: false,
        command: "lint",
        status: "fail",
        skillPath: parsedArgs.skillPath,
        code: parsed.code,
        error: parsed.error,
      }),
    );
  }
  emit(
    envelope({
      ok: true,
      command: "lint",
      status: "pass",
      skillPath: parsedArgs.skillPath,
      advertised: parsed.advertised.map(({ verb, argv }) => ({ verb, argv })),
    }),
  );
}

if (parsedArgs.seeded === "advertised-run") {
  emit(seededAdvertisedRun());
}
if (parsedArgs.seeded === "unknown-job") {
  emit(seededUnknownJob());
}
if (parsedArgs.command === "seeded") {
  emit(
    envelope({
      ok: false,
      command: "seeded-failure",
      status: "usage",
      code: "usage",
      error: `unknown seeded failure: ${parsedArgs.seeded}`,
    }),
  );
}

emit(prove(parsedArgs.skillPath, { keep: parsedArgs.keep }));
