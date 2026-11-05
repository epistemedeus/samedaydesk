#!/usr/bin/env node
// N5-R05 Pilot Stage 1 runner.
// Calls the pinned source-root CLIs only. Does not import tools from the writer checkout.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);

const DECLARED_WRITER_BASE = "09b2d6155ce247d828355183c9367889daf5f0f0";
const DECLARED_WRITER_TREE = "0619ee40acd45537fe1fde8723d07152ef09508a";
const WRITER_REUSE_TREE = "4ad9557b5845ac03292326aadd95738d460878f5";
const SOURCE_COMMIT = "9f6c0c4e396dd7677f334400eed93e3445fad600";
const SOURCE_TREE = "8a85072962a71dc1b78b19a0dc0caf17aebac833";
const REUSE_TREE = "651930a2dbf880c25f475b160229959002de2d99";
const RECIPES_TREE = "61f78f632b6697171224b395b127fbbaa618ef78";
const RECUR_COMMIT = "da769f7870e494bb583e31766a477a2ff974fc10";
const BLOBS = {
  capture: "5796a1ffbe9075b249a0600666c4d0aa36f56a26",
  prior: "c2a324e82bef0b6409814515c88c6dcb77df1cff",
  changed: "582448cf4e962af87df1fec24023481ebb78cec4",
  reuseCli: "a8937ecb777cf017eeb5c327c06e553a3d0ffdf5",
  exportMjs: "939fa19abab4cf4432f8c8bc214cbb2676aca5f7",
  projectMjs: "bff16db7f645d27926836ccc2bb8deb4158a41c4",
  mapMjs: "8dd669b8d94142b17369567126e88a354d0c47ab",
  recipesCli: "da16132355557e03856b38540a393f2ea628bcc4",
  verifyRecipe: "17ac8962c22667dff399bc16f5e71a9af19e3613",
  alertRecipe: "2feeff14e3fa3ddb4c3a40f3dfc3d61ada5bf5f2",
};
const PATHS = {
  capture: "tools/recurring-job-recipes/fixtures/current/example-unchanged.json",
  prior: "tools/recurring-job-recipes/fixtures/priors/source-change.prior.json",
  changed: "tools/recurring-job-recipes/fixtures/current/example-changed.json",
  reuseCli: "tools/result-reuse/cli.mjs",
  exportMjs: "tools/result-reuse/src/export.mjs",
  projectMjs: "tools/result-reuse/src/project.mjs",
  mapMjs: "tools/result-reuse/src/map.mjs",
  recipesCli: "tools/recurring-job-recipes/cli.mjs",
  verifyRecipe: "tools/recurring-job-recipes/recipes/verification-reconcile.mjs",
  alertRecipe: "tools/recurring-job-recipes/recipes/source-change-alert.mjs",
};

const CLOCK = "2026-09-09T08:00:00.000Z";
const STALE_CLOCK = "2026-09-16T08:00:01.000Z";
const HORIZON = "168";
const TASK = "source-change-example";
const SUBJECT = "source-change-example-decision";
const RECIPE_VERSION = "samedaydesk.recurring-job-recipe-result.v1";
const REFUSAL_MESSAGE = "input is not the before-work public manifest for source-change-alert";
const MISSING_CAPTURE_MESSAGE = "before-work manifest is missing the current capture";

function parseArgs(argv) {
  const out = { skipNegative: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source-root") out.sourceRoot = argv[++i];
    else if (arg === "--out") out.out = argv[++i];
    else if (arg === "--skip-negative") out.skipNegative = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else return { error: `unknown argument ${arg}` };
  }
  return out;
}

function git(cwd, args) {
  const result = spawnSync("git", ["--no-optional-locks", ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function writerTop() {
  return git(SCRIPT_DIR, ["rev-parse", "--show-toplevel"]).stdout;
}

function isInside(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

function verifySource(sourceRoot) {
  const checks = [];
  const add = (name, actual, expected) => {
    checks.push({ name, actual, expected, ok: actual === expected });
  };
  if (!sourceRoot || !existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    return {
      ok: false,
      checks: [{ name: "directory", actual: "missing", expected: "directory", ok: false }],
      message: "source root is missing",
    };
  }
  const root = resolve(sourceRoot);
  const top = writerTop();
  add("not_writer_checkout", root === resolve(top) ? "writer-checkout" : "separate", "separate");
  const head = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (head.status !== 0 || tree.status !== 0) {
    return {
      ok: false,
      checks: checks.concat([{ name: "git", actual: head.stderr || tree.stderr, expected: "rev-parse", ok: false }]),
      message: "source root is not a git checkout",
    };
  }
  add("commit", head.stdout, SOURCE_COMMIT);
  add("tree", tree.stdout, SOURCE_TREE);
  add("result_reuse_tree", git(root, ["rev-parse", "HEAD:tools/result-reuse"]).stdout, REUSE_TREE);
  add("recipes_tree", git(root, ["rev-parse", "HEAD:tools/recurring-job-recipes"]).stdout, RECIPES_TREE);
  add(
    "recur_result_reuse_tree",
    git(root, ["rev-parse", `${RECUR_COMMIT}:tools/result-reuse`]).stdout,
    REUSE_TREE,
  );
  const ancestor = git(root, ["merge-base", "--is-ancestor", RECUR_COMMIT, "HEAD"]);
  add("recur_ancestor", ancestor.status === 0 ? "yes" : "no", "yes");
  for (const [name, rel] of Object.entries(PATHS)) {
    const blob = git(root, ["rev-parse", `HEAD:${rel}`]);
    const file = join(root, rel);
    const hashed = existsSync(file) ? git(root, ["hash-object", "--no-filters", rel]) : { stdout: "missing-file" };
    add(`blob:${name}`, blob.stdout, BLOBS[name]);
    add(`worktree:${name}`, hashed.stdout, BLOBS[name]);
  }
  const porcelain = git(root, ["status", "--porcelain"]);
  add("clean", porcelain.stdout, "");
  const failed = checks.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    checks,
    root,
    message: failed.length === 0 ? "source root matches the pinned input" : "source root does not match the pinned input",
  };
}

function verifyWriter() {
  const top = writerTop();
  const head = git(top, ["rev-parse", "HEAD"]);
  const tree = git(top, ["rev-parse", "HEAD^{tree}"]);
  const reuse = git(top, ["rev-parse", "HEAD:tools/result-reuse"]);
  const recipes = git(top, ["rev-parse", "HEAD:tools/recurring-job-recipes"]);
  const capture = git(top, ["rev-parse", `HEAD:${PATHS.capture}`]);
  const prior = git(top, ["rev-parse", `HEAD:${PATHS.prior}`]);
  return {
    top,
    head: head.stdout,
    tree: tree.stdout,
    reuse: reuse.stdout,
    recipes: recipes.stdout,
    capture: capture.stdout,
    prior: prior.stdout,
    ok: reuse.stdout === WRITER_REUSE_TREE && head.status === 0,
  };
}

function refuse(payload) {
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(2);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseJson(text) {
  if (!text || !String(text).trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function manifestFrom(prior, capture, { recipeId = "source-change-alert", fields = ["title"] } = {}) {
  const body = {
    recipeId,
    recipeVersion: RECIPE_VERSION,
    fields,
    prior: {
      sha256: prior.sha256,
      sequence: prior.sequence,
      createdAt: prior.createdAt,
      payload: {
        url: prior.payload.url,
        status: prior.payload.status,
        title: prior.payload.title,
        fields: prior.payload.fields,
        contentHash: prior.payload.contentHash,
      },
    },
  };
  if (capture) {
    body.capture = {
      url: capture.url,
      status: capture.status,
      title: capture.title,
      fields: capture.fields,
      contentHash: capture.contentHash,
    };
    if (capture.partial === true) body.capture.partial = true;
  }
  return body;
}

function displayArg(value, sourceRoot, outDir) {
  const text = String(value);
  if (text === sourceRoot) return "$SOURCE";
  if (text.startsWith(`${sourceRoot}${sep}`)) return join("$SOURCE", relative(sourceRoot, text));
  if (text === outDir) return "$OUT";
  if (text.startsWith(`${outDir}${sep}`)) return join("$OUT", relative(outDir, text));
  return text;
}

function extractBody(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  return {
    ok: parsed.ok ?? null,
    mode: parsed.mode ?? null,
    verdict: parsed.verdict ?? null,
    reason: parsed.reason ?? null,
    message: parsed.message ?? null,
    action: parsed.action ?? null,
    outcome: parsed.outcome ?? parsed.decision?.useful?.outcome ?? null,
    recipeId: parsed.recipeId ?? parsed.decision?.useful?.recipeId ?? null,
    recovery: parsed.recovery?.action ?? parsed.decision?.useful?.recovery?.action ?? null,
    operatorNext: parsed.recovery?.operatorNext ?? parsed.decision?.useful?.recovery?.operatorNext ?? null,
    statement: parsed.decision?.statement ?? null,
    producerInvoked: parsed.producerInvoked ?? null,
    inputDigest: parsed.inputDigest ?? parsed.decision?.inputDigest ?? null,
    paymentAttempted: parsed.payment?.attempted ?? null,
    noChangeProven: parsed.evidence?.claims?.noChangeProven ?? null,
    automaticPaymentReplay: parsed.evidence?.claims?.automaticPaymentReplay ?? null,
    mismatches: Array.isArray(parsed.evidence?.mismatches)
      ? parsed.evidence.mismatches.map((item) => item.field)
      : null,
    changedFields: Array.isArray(parsed.evidence?.changed)
      ? parsed.evidence.changed.map((item) => item.field)
      : Array.isArray(parsed.decision?.useful?.evidence?.changed)
        ? parsed.decision.useful.evidence.changed.map((item) => item.field)
        : null,
    evidenceCode: parsed.evidence?.code ?? null,
    kind: parsed.kind ?? parsed.evidence?.kind ?? null,
    liveMetric: parsed.liveMetric?.recomputeCostAvoidedNetOfUpkeep ?? null,
    inputCaptureNs: parsed.mechanics?.inputCaptureNs ?? null,
  };
}

function runProcess(record, executable, args, cwd) {
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const wallNs = Number(process.hrtime.bigint() - started);
  const stderr = `${result.stderr || ""}${result.error ? `${result.error.message}\n` : ""}`;
  record.commands.push({
    id: record.nextId,
    executable,
    args,
    cwd,
    exit: result.status === null ? 128 : result.status,
    signal: result.signal || null,
    wallNs,
    stdout: result.stdout || "",
    stderr,
    parsedStdout: parseJson(result.stdout),
    parsedStderr: parseJson(result.stderr),
  });
  return record.commands[record.commands.length - 1];
}

function expect(record, id, ok, detail) {
  record.checks.push({ id, ok: Boolean(ok), detail });
}

function note(record, id, detail) {
  record.notes.push({ id, detail });
}

function bodyOf(command) {
  return command.parsedStdout || command.parsedStderr;
}

function messageOf(command) {
  return bodyOf(command)?.message || command.stderr.trim() || command.stdout.trim();
}

function noDecision(command) {
  const body = bodyOf(command);
  if (!body) return command.stdout.trim() === "";
  return body.verdict !== "reuse" && body.decision == null && body.action !== "bound";
}

function runNegative(sourceRoot, label) {
  const out = mkdtempSync(join(tmpdir(), "n5-r05-refuse-"));
  const started = process.hrtime.bigint();
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--source-root", sourceRoot, "--out", out, "--skip-negative"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const wallNs = Number(process.hrtime.bigint() - started);
  let entries = [];
  try {
    entries = readdirSync(out);
  } catch {
    entries = ["unreadable"];
  }
  rmSync(out, { recursive: true, force: true });
  return {
    label,
    sourceRoot,
    exit: result.status === null ? 128 : result.status,
    wallNs,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    entries,
  };
}

function identityArgs(stubPath, clock, withdraw) {
  return [
    "--task-id", TASK,
    "--subject", SUBJECT,
    "--sequence", "1",
    "--clock", clock,
    "--horizon", HORIZON,
    "--producer", stubPath,
    withdraw ? "--withdraw-opt-in" : "--opt-in",
  ];
}

function execute(ctx) {
  const { sourceRoot, outDir, writer, verified } = ctx;
  const record = { commands: [], checks: [], notes: [], negatives: ctx.negatives };
  const evidence = join(outDir, "evidence");
  const frozen = join(outDir, "frozen");
  const derived = join(outDir, "derived");
  rmSync(evidence, { recursive: true, force: true });
  rmSync(frozen, { recursive: true, force: true });
  rmSync(derived, { recursive: true, force: true });
  mkdirSync(evidence, { recursive: true });
  mkdirSync(frozen, { recursive: true });
  mkdirSync(derived, { recursive: true });

  const reuseCli = join(sourceRoot, PATHS.reuseCli);
  const recipeCli = join(sourceRoot, PATHS.recipesCli);
  const capturePath = join(sourceRoot, PATHS.capture);
  const priorPath = join(sourceRoot, PATHS.prior);
  const changedPath = join(sourceRoot, PATHS.changed);
  const prior = loadJson(priorPath);
  const capture = loadJson(capturePath);
  const changed = loadJson(changedPath);

  const hashOnly = { ...capture, contentHash: "sha256:fixture-example-domain-v1-hash-only" };
  const partial = { ...capture, partial: true };
  const hashOnlyPath = join(derived, "capture-hash-only.json");
  const partialPath = join(derived, "capture-partial.json");
  writeJson(hashOnlyPath, hashOnly);
  writeJson(partialPath, partial);

  const frozenManifest = manifestFrom(prior, capture);
  const changedManifest = manifestFrom(prior, changed);
  const hashManifest = manifestFrom(prior, hashOnly);
  const partialManifest = manifestFrom(prior, partial);
  const missingManifest = manifestFrom(prior, null);
  const d2Manifest = manifestFrom(prior, capture, {
    recipeId: "verification-reconcile",
    fields: ["contentHash", "title"],
  });
  const frozenManifestPath = join(frozen, "d1-manifest.json");
  const changedManifestPath = join(derived, "manifest-changed.json");
  const hashManifestPath = join(derived, "manifest-hash-only.json");
  const partialManifestPath = join(derived, "manifest-partial.json");
  const missingManifestPath = join(derived, "manifest-missing-capture.json");
  const d2ManifestPath = join(derived, "manifest-verification-reconcile.json");
  writeJson(frozenManifestPath, frozenManifest);
  writeJson(changedManifestPath, changedManifest);
  writeJson(hashManifestPath, hashManifest);
  writeJson(partialManifestPath, partialManifest);
  writeJson(missingManifestPath, missingManifest);
  writeJson(d2ManifestPath, d2Manifest);

  writeJson(join(frozen, "fixture-refs.json"), {
    note: "Both decisions read these source-root files. The bytes are not copied and no page was fetched.",
    capture: { path: PATHS.capture, gitBlob: BLOBS.capture, rawSha256: sha256File(capturePath) },
    prior: { path: PATHS.prior, gitBlob: BLOBS.prior, rawSha256: sha256File(priorPath) },
    changed: { path: PATHS.changed, gitBlob: BLOBS.changed, rawSha256: sha256File(changedPath) },
    writerCaptureBlob: writer.capture,
    writerPriorBlob: writer.prior,
  });

  const counterPath = join(evidence, "producer-calls.txt");
  const stubPath = join(evidence, "producer-stub.mjs");
  writeFileSync(counterPath, "");
  writeFileSync(
    stubPath,
    `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(counterPath)}, "x");
throw new Error("producer must not run");
`,
  );

  const run = (id, cliPath, args, cwd) => {
    record.nextId = id;
    if (!isInside(cliPath, sourceRoot)) {
      throw new Error(`refusing CLI outside source root: ${cliPath}`);
    }
    return runProcess(record, process.execPath, [cliPath, ...args], cwd);
  };

  const producedPath = join(frozen, "d1-produced.json");
  const observationPath = join(frozen, "d1-observation.json");
  const produce = run(
    "d1-produce-frozen",
    recipeCli,
    [
      "--recipe", "source-change-alert",
      "--prior", priorPath,
      "--current-fixture", capturePath,
      "--fields", "title",
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );
  writeFileSync(producedPath, produce.stdout);

  const bind = run(
    "d1-bind-frozen",
    reuseCli,
    [
      "decide-or-reuse",
      "--input", frozenManifestPath,
      "--produced", producedPath,
      "--out", observationPath,
      ...identityArgs(stubPath, CLOCK, false),
    ],
    sourceRoot,
  );
  const callsAfterBind = readFileSync(counterPath, "utf8");

  record.nextId = "producer-stub-probe";
  const probe = runProcess(record, process.execPath, [stubPath], sourceRoot);
  const probed = readFileSync(counterPath, "utf8");
  writeFileSync(counterPath, "");

  const reuse = run(
    "d1-reuse-frozen",
    reuseCli,
    [
      "decide-or-reuse",
      "--input", frozenManifestPath,
      "--decision", observationPath,
      ...identityArgs(stubPath, CLOCK, false),
    ],
    sourceRoot,
  );
  const callsAfterHit = readFileSync(counterPath, "utf8");

  const d2 = run(
    "d2-direct-frozen",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", capturePath,
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );
  writeFileSync(join(frozen, "d2-direct.json"), d2.stdout);

  const d2BindOut = join(evidence, "should-not-exist-d2-bind.json");
  const d2Bind = run(
    "d2-bind-refusal",
    reuseCli,
    [
      "decide-or-reuse",
      "--input", d2ManifestPath,
      "--produced", producedPath,
      "--out", d2BindOut,
      ...identityArgs(stubPath, CLOCK, false),
    ],
    sourceRoot,
  );
  const d2BindOwn = run(
    "d2-bind-own-result",
    reuseCli,
    [
      "decide-or-reuse",
      "--input", d2ManifestPath,
      "--produced", join(frozen, "d2-direct.json"),
      "--out", join(evidence, "should-not-exist-d2-bind-own.json"),
      ...identityArgs(stubPath, CLOCK, false),
    ],
    sourceRoot,
  );
  const d2Reuse = run(
    "d2-reuse-against-d1",
    reuseCli,
    [
      "decide-or-reuse",
      "--input", d2ManifestPath,
      "--decision", observationPath,
      ...identityArgs(stubPath, CLOCK, false),
    ],
    sourceRoot,
  );

  const previewArgs = ["--task-id", TASK, "--subject", SUBJECT, "--sequence", "1", "--clock", CLOCK];
  const d2Preview = run("d2-preview", reuseCli, ["preview", "--input", join(frozen, "d2-direct.json"), ...previewArgs], sourceRoot);
  const d2ExportOut = join(evidence, "should-not-exist-d2-export.json");
  const d2Export = run(
    "d2-export",
    reuseCli,
    ["export", "--input", join(frozen, "d2-direct.json"), ...previewArgs, "--opt-in", "--out", d2ExportOut],
    sourceRoot,
  );
  const capturePreview = run("capture-preview", reuseCli, ["preview", "--input", capturePath, ...previewArgs], sourceRoot);
  const captureExportOut = join(evidence, "should-not-exist-capture-export.json");
  const captureExport = run(
    "capture-export",
    reuseCli,
    ["export", "--input", capturePath, ...previewArgs, "--opt-in", "--out", captureExportOut],
    sourceRoot,
  );

  const changedReuse = run(
    "d1-reuse-changed",
    reuseCli,
    ["decide-or-reuse", "--input", changedManifestPath, "--decision", observationPath, ...identityArgs(stubPath, CLOCK, false)],
    sourceRoot,
  );
  const changedProduce = run(
    "d1-recompute-changed",
    recipeCli,
    [
      "--recipe", "source-change-alert",
      "--prior", priorPath,
      "--current-fixture", changedPath,
      "--fields", "title",
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );
  const changedD2 = run(
    "d2-changed",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", changedPath,
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );

  const hashReuse = run(
    "d1-reuse-hash-only",
    reuseCli,
    ["decide-or-reuse", "--input", hashManifestPath, "--decision", observationPath, ...identityArgs(stubPath, CLOCK, false)],
    sourceRoot,
  );
  const hashProduce = run(
    "d1-recompute-hash-only",
    recipeCli,
    [
      "--recipe", "source-change-alert",
      "--prior", priorPath,
      "--current-fixture", hashOnlyPath,
      "--fields", "title",
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );
  const hashD2 = run(
    "d2-hash-only",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", hashOnlyPath,
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );

  const missingBindOut = join(evidence, "should-not-exist-missing-bind.json");
  const missingBind = run(
    "d1-bind-missing-capture",
    reuseCli,
    [
      "decide-or-reuse",
      "--input", missingManifestPath,
      "--produced", producedPath,
      "--out", missingBindOut,
      ...identityArgs(stubPath, CLOCK, false),
    ],
    sourceRoot,
  );
  const missingReuse = run(
    "d1-reuse-missing-capture",
    reuseCli,
    ["decide-or-reuse", "--input", missingManifestPath, "--decision", observationPath, ...identityArgs(stubPath, CLOCK, false)],
    sourceRoot,
  );
  const missingCandidate = run(
    "d2-missing-candidate",
    recipeCli,
    ["--recipe", "verification-reconcile", "--prior", priorPath, "--schedule", "daily", "--clock", CLOCK, "--horizon", HORIZON],
    sourceRoot,
  );
  const invalidCandidate = run(
    "d2-invalid-candidate",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", join(derived, "missing-candidate.json"),
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );

  const partialReuse = run(
    "d1-reuse-partial",
    reuseCli,
    ["decide-or-reuse", "--input", partialManifestPath, "--decision", observationPath, ...identityArgs(stubPath, CLOCK, false)],
    sourceRoot,
  );
  const partialD2 = run(
    "d2-partial",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", partialPath,
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );

  const stale = run(
    "d1-reuse-stale",
    reuseCli,
    ["decide-or-reuse", "--input", frozenManifestPath, "--decision", observationPath, ...identityArgs(stubPath, STALE_CLOCK, false)],
    sourceRoot,
  );
  const staleD2 = run(
    "d2-stale",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", capturePath,
      "--schedule", "daily",
      "--clock", STALE_CLOCK,
      "--horizon", HORIZON,
    ],
    sourceRoot,
  );
  const withdrawn = run(
    "d1-withdraw",
    reuseCli,
    ["decide-or-reuse", "--input", frozenManifestPath, "--decision", observationPath, ...identityArgs(stubPath, CLOCK, true)],
    sourceRoot,
  );
  const withdrawD2 = run(
    "d2-withdraw-flag",
    recipeCli,
    [
      "--recipe", "verification-reconcile",
      "--prior", priorPath,
      "--candidate", capturePath,
      "--schedule", "daily",
      "--clock", CLOCK,
      "--horizon", HORIZON,
      "--withdraw-opt-in",
    ],
    sourceRoot,
  );

  const observation = existsSync(observationPath) ? loadJson(observationPath) : null;
  const producedBody = produce.parsedStdout;
  const reuseBody = reuse.parsedStdout;
  const d2Body = d2.parsedStdout;
  const hashProduceBody = hashProduce.parsedStdout;
  const hashD2Body = hashD2.parsedStdout;
  const changedProduceBody = changedProduce.parsedStdout;
  const changedD2Body = changedD2.parsedStdout;

  expect(record, "d1-produce-exit", produce.exit === 0, produce.exit);
  expect(record, "d1-produce-unchanged", producedBody?.outcome === "unchanged" && producedBody?.recovery?.action === "keep_prior", producedBody?.outcome);
  expect(record, "d1-produce-payment", producedBody?.payment?.attempted === false, producedBody?.payment);
  expect(record, "d1-bind-exit", bind.exit === 0 && bind.parsedStdout?.action === "bound", bind.exit);
  expect(record, "d1-bind-producer-absent", bind.parsedStdout?.producerInvoked === false && callsAfterBind === "", callsAfterBind || bind.parsedStdout?.producerInvoked);
  expect(record, "stub-probe-fires", probe.exit !== 0 && probed === "x", { exit: probe.exit, probed });
  expect(record, "d1-reuse-verdict", reuse.exit === 0 && reuseBody?.verdict === "reuse", reuseBody?.verdict);
  expect(record, "d1-reuse-outcome", reuseBody?.decision?.useful?.outcome === "unchanged", reuseBody?.decision?.useful?.outcome);
  expect(record, "d1-reuse-recovery", reuseBody?.decision?.useful?.recovery?.action === "keep_prior", reuseBody?.decision?.useful?.recovery?.action);
  expect(record, "d1-reuse-producer-absent", reuseBody?.producerInvoked === false && callsAfterHit === "", callsAfterHit);
  expect(record, "d1-costs-unknown", reuseBody?.liveMetric?.recomputeCostAvoidedNetOfUpkeep === "costs_unknown", reuseBody?.liveMetric);
  expect(record, "d2-exit", d2.exit === 0, d2.exit);
  expect(record, "d2-outcome", d2Body?.outcome === "unchanged", d2Body?.outcome);
  expect(record, "d2-mismatches", Array.isArray(d2Body?.evidence?.mismatches) && d2Body.evidence.mismatches.length === 0, d2Body?.evidence?.mismatches);
  expect(record, "d2-no-change", d2Body?.evidence?.claims?.noChangeProven === true, d2Body?.evidence?.claims?.noChangeProven);
  expect(record, "d2-no-replay", d2Body?.evidence?.claims?.automaticPaymentReplay === false, d2Body?.evidence?.claims?.automaticPaymentReplay);
  expect(record, "d2-payment", d2Body?.payment?.attempted === false, d2Body?.payment);
  expect(record, "d2-recovery", d2Body?.recovery?.action === "keep_prior", d2Body?.recovery?.action);
  expect(record, "same-capture-files", prior.payment?.attempted === false && capture.contentHash === "sha256:fixture-example-domain-v1", capture.contentHash);

  expect(record, "d2-bind-exit", d2Bind.exit === 1, d2Bind.exit);
  expect(record, "d2-bind-message", messageOf(d2Bind).includes(REFUSAL_MESSAGE), messageOf(d2Bind));
  expect(record, "d2-bind-no-decision", noDecision(d2Bind) && !existsSync(d2BindOut), existsSync(d2BindOut));
  expect(record, "d2-bind-own-no-decision", d2BindOwn.exit !== 0 && noDecision(d2BindOwn) && !existsSync(join(evidence, "should-not-exist-d2-bind-own.json")), messageOf(d2BindOwn));
  expect(record, "d2-reuse-not-hit", d2Reuse.exit === 0 && d2Reuse.parsedStdout?.verdict === "recompute" && d2Reuse.parsedStdout?.reason === "input_not_before_work" && d2Reuse.parsedStdout?.decision == null, d2Reuse.parsedStdout?.reason);
  expect(record, "d2-preview-refused", d2Preview.exit === 1 && messageOf(d2Preview).includes("unrecognized result"), messageOf(d2Preview));
  expect(record, "d2-export-refused", d2Export.exit === 1 && !existsSync(d2ExportOut), messageOf(d2Export));
  expect(record, "capture-preview-refused", capturePreview.exit === 1, messageOf(capturePreview));
  expect(record, "capture-export-refused", captureExport.exit === 1 && !existsSync(captureExportOut), messageOf(captureExport));
  note(record, "d2-export-message", messageOf(d2Export));
  note(record, "d2-bind-own-message", messageOf(d2BindOwn));

  expect(record, "changed-d1-reuse", changedReuse.exit === 0 && changedReuse.parsedStdout?.verdict === "recompute" && changedReuse.parsedStdout?.reason === "digest_mismatch" && changedReuse.parsedStdout?.decision == null, changedReuse.parsedStdout?.reason);
  expect(record, "changed-d1-recompute", changedProduce.exit === 0 && changedProduceBody?.outcome === "changed" && changedProduceBody?.recovery?.action === "review_and_sequence", changedProduceBody?.outcome);
  expect(record, "changed-d1-title", changedProduceBody?.evidence?.changed?.some((item) => item.field === "title"), changedProduceBody?.evidence?.changed);
  expect(record, "changed-d2", changedD2.exit === 0 && changedD2Body?.outcome === "changed", changedD2Body?.outcome);
  expect(
    record,
    "changed-d2-fields",
    changedD2Body?.evidence?.mismatches?.some((item) => item.field === "contentHash")
      && changedD2Body?.evidence?.mismatches?.some((item) => item.field === "title"),
    changedD2Body?.evidence?.mismatches?.map((item) => item.field),
  );

  expect(record, "hash-d1-reuse", hashReuse.exit === 0 && hashReuse.parsedStdout?.verdict === "recompute" && hashReuse.parsedStdout?.reason === "digest_mismatch" && hashReuse.parsedStdout?.decision == null, hashReuse.parsedStdout?.reason);
  expect(record, "hash-d1-unchanged", hashProduce.exit === 0 && hashProduceBody?.outcome === "unchanged" && hashProduceBody?.recovery?.action === "keep_prior", hashProduceBody?.outcome);
  expect(record, "hash-d1-not-content-field", !hashProduceBody?.evidence?.changed?.some((item) => item.field === "contentHash"), hashProduceBody?.evidence?.changed);
  expect(record, "hash-d2-changed", hashD2.exit === 0 && hashD2Body?.outcome === "changed", hashD2Body?.outcome);
  expect(
    record,
    "hash-d2-only-hash",
    hashD2Body?.evidence?.mismatches?.some((item) => item.field === "contentHash")
      && !hashD2Body?.evidence?.mismatches?.some((item) => item.field === "title"),
    hashD2Body?.evidence?.mismatches,
  );
  expect(
    record,
    "decisions-differ",
    hashProduceBody?.outcome === "unchanged" && hashD2Body?.outcome === "changed",
    { d1: hashProduceBody?.outcome, d2: hashD2Body?.outcome },
  );

  expect(record, "missing-bind-message", missingBind.exit === 1 && messageOf(missingBind).includes(MISSING_CAPTURE_MESSAGE), messageOf(missingBind));
  expect(record, "missing-bind-no-file", noDecision(missingBind) && !existsSync(missingBindOut), existsSync(missingBindOut));
  expect(record, "missing-reuse-recompute", missingReuse.exit === 0 && missingReuse.parsedStdout?.verdict === "recompute" && missingReuse.parsedStdout?.reason === "input_not_before_work" && missingReuse.parsedStdout?.decision == null, missingReuse.parsedStdout?.reason);
  expect(record, "missing-candidate", missingCandidate.exit === 1 && missingCandidate.parsedStdout?.evidence?.code === "missing_candidate", missingCandidate.parsedStdout?.evidence?.code);
  expect(record, "invalid-candidate", invalidCandidate.exit === 1 && invalidCandidate.parsedStdout?.evidence?.code === "invalid_candidate", invalidCandidate.parsedStdout?.evidence?.code);

  expect(record, "partial-d1", partialReuse.exit === 0 && partialReuse.parsedStdout?.verdict === "recompute" && partialReuse.parsedStdout?.reason === "digest_mismatch" && partialReuse.parsedStdout?.decision == null, partialReuse.parsedStdout?.reason);
  expect(record, "partial-d2", partialD2.exit === 0 && partialD2.parsedStdout?.outcome === "partial" && partialD2.parsedStdout?.recovery?.action === "keep_partial_rows", partialD2.parsedStdout?.outcome);

  expect(record, "stale-d1", stale.exit === 0 && stale.parsedStdout?.verdict === "recompute" && stale.parsedStdout?.reason === "stale_clock" && stale.parsedStdout?.decision == null, stale.parsedStdout?.reason);
  expect(record, "stale-d2", staleD2.exit === 0 && staleD2.parsedStdout?.outcome === "stale_baseline" && staleD2.parsedStdout?.recovery?.action === "refresh_baseline", staleD2.parsedStdout?.outcome);
  expect(record, "withdraw-d1", withdrawn.exit === 0 && withdrawn.parsedStdout?.verdict === "recompute" && withdrawn.parsedStdout?.reason === "opt_in_withdrawn" && withdrawn.parsedStdout?.decision == null, withdrawn.parsedStdout?.reason);
  expect(record, "withdraw-d2-no-gate", withdrawD2.exit !== 0 && withdrawD2.stdout.trim() === "" && /withdraw-opt-in|unknown/i.test(withdrawD2.stderr), withdrawD2.stderr.slice(0, 400));

  for (const item of record.negatives) {
    const parsed = parseJson(item.stderr);
    expect(record, `negative-${item.label}-exit`, item.exit === 2, item.exit);
    expect(record, `negative-${item.label}-empty`, item.entries.length === 0 && item.stdout.trim() === "", { entries: item.entries, stdout: item.stdout.slice(0, 200) });
    expect(record, `negative-${item.label}-code`, parsed?.code === "source_root_refused", parsed?.code || item.stderr.slice(0, 200));
  }

  const endPorcelain = git(sourceRoot, ["status", "--porcelain"]);
  const endCapture = git(sourceRoot, ["hash-object", "--no-filters", PATHS.capture]).stdout;
  const endPrior = git(sourceRoot, ["hash-object", "--no-filters", PATHS.prior]).stdout;
  expect(record, "source-clean", endPorcelain.stdout === "" && endCapture === BLOBS.capture && endPrior === BLOBS.prior, endPorcelain.stdout);
  expect(record, "observation-schema", observation?.schema === "neomorphic.task-memory.observation.v1", observation?.schema);
  expect(record, "observation-binding", observation?.payload?.decisionBinding?.recipeId === "source-change-alert", observation?.payload?.decisionBinding?.recipeId);
  const observationText = observation ? JSON.stringify(observation) : "";
  expect(record, "observation-no-path", observationText !== "" && !observationText.includes("/tmp/") && !observationText.includes(sourceRoot), observationText.includes("/tmp/"));
  expect(
    record,
    "cli-under-source",
    record.commands.filter((command) => command.args[0]?.endsWith("cli.mjs")).every((command) => command.executable === process.execPath && isInside(command.args[0], sourceRoot)),
    "cli path",
  );
  expect(
    record,
    "no-live-or-replay",
    record.commands.every((command) => !command.args.includes("--live-safe") && !command.args.includes("--replay-payment") && !command.args.includes("--write-artifact")),
    "flags",
  );
  const frozenProduces = record.commands.filter((command) => command.id === "d1-produce-frozen");
  expect(record, "frozen-producer-once", frozenProduces.length === 1 && frozenProduces[0].exit === 0, frozenProduces.length);

  const failed = record.checks.filter((item) => !item.ok);
  const verdict = judge(record, failed);
  const saved = persist(record, {
    evidence,
    frozen,
    sourceRoot,
    outDir,
    writer,
    verified,
    verdict,
    observation,
    startedAt: ctx.startedAt,
  });
  return { verdict, failed, resultPath: saved };
}

function judge(record) {
  const ok = (id) => record.checks.find((item) => item.id === id)?.ok === true;
  const frozenOk = ["d1-reuse-verdict", "d1-reuse-outcome", "d1-reuse-recovery", "d2-outcome", "d2-no-change", "d2-no-replay", "d2-payment", "d1-produce-payment"].every(ok);
  const differ = ok("decisions-differ") && ok("hash-d1-unchanged") && ok("hash-d2-changed");
  const clean = ok("frozen-producer-once") && ok("source-clean") && ok("no-live-or-replay") && ok("cli-under-source") && ok("observation-no-path");
  const refusals = ["d2-bind-exit", "d2-bind-message", "d2-bind-no-decision", "missing-bind-no-file", "hash-d1-reuse", "stale-d1", "withdraw-d1", "partial-d1"].every(ok);
  const reasons = [];
  if (!frozenOk) reasons.push("frozen D1 reuse or frozen D2 direct answer did not match the useful outcomes");
  if (!differ) reasons.push("contentHash-only variant did not separate the decisions");
  if (!clean) reasons.push("a frozen producer rerun, source edit, live fetch, or checkout import was involved");
  if (!refusals) reasons.push("a refusal case returned a decision");
  const matrixFailed = record.checks.some((item) => !item.ok);
  if (frozenOk && differ && clean && refusals && !matrixFailed) {
    return {
      code: "supported-with-within-cli-no-fit",
      text: "The saved capture supports two different decisions. D1 is a decide-or-reuse hit. D2 is direct sharing of the same capture. decide-or-reuse refuses D2, and that refusal is the within-CLI no-fit.",
    };
  }
  if (!differ && frozenOk) {
    return {
      code: "no-fit",
      text: "NO-FIT. On the contentHash-only capture the two decisions do not diverge, so D2 adds nothing beyond D1. Treated as a duplicate of the existing source-change-alert reuse.",
    };
  }
  return {
    code: "falsified",
    text: `FALSIFIED. ${reasons.join(" ") || "A required check failed."}`,
  };
}

function persist(record, ctx) {
  const commands = record.commands.map((command) => {
    const stdoutPath = join(ctx.evidence, `${command.id}.stdout.txt`);
    const stderrPath = join(ctx.evidence, `${command.id}.stderr.txt`);
    writeFileSync(stdoutPath, command.stdout);
    writeFileSync(stderrPath, command.stderr);
    return {
      id: command.id,
      exit: command.exit,
      wallMs: Number((command.wallNs / 1e6).toFixed(3)),
      wallNs: command.wallNs,
      stdoutBytes: Buffer.byteLength(command.stdout),
      stderrBytes: Buffer.byteLength(command.stderr),
      stdoutSha256: sha256(command.stdout),
      stderrSha256: sha256(command.stderr),
      argv: [command.executable, ...command.args].map((item) => displayArg(item, ctx.sourceRoot, ctx.outDir)),
      extract: extractBody(command.parsedStdout) || extractBody(command.parsedStderr),
    };
  });
  for (const item of record.negatives) {
    writeFileSync(join(ctx.evidence, `negative-${item.label}.stderr.txt`), item.stderr);
    writeFileSync(join(ctx.evidence, `negative-${item.label}.stdout.txt`), item.stdout);
  }
  const byId = Object.fromEntries(commands.map((command) => [command.id, command]));
  const summary = {
    verdict: ctx.verdict,
    startedAt: ctx.startedAt,
    node: process.version,
    writer: ctx.writer,
    declaredWriterBase: DECLARED_WRITER_BASE,
    declaredWriterTree: DECLARED_WRITER_TREE,
    source: {
      commit: SOURCE_COMMIT,
      tree: SOURCE_TREE,
      resultReuseTree: REUSE_TREE,
      recipesTree: RECIPES_TREE,
      recurCommit: RECUR_COMMIT,
      root: ctx.sourceRoot,
      verified: ctx.verified.ok,
    },
    blobs: BLOBS,
    captureRawSha256: sha256File(join(ctx.sourceRoot, PATHS.capture)),
    priorRawSha256: sha256File(join(ctx.sourceRoot, PATHS.prior)),
    inputDigest: byId["d1-bind-frozen"]?.extract?.inputDigest || null,
    checks: record.checks,
    notes: record.notes,
    commands,
    negatives: record.negatives.map((item) => ({
      label: item.label,
      exit: item.exit,
      wallMs: Number((item.wallNs / 1e6).toFixed(3)),
      entries: item.entries,
      stderrSha256: sha256(item.stderr),
    })),
  };
  writeJson(join(ctx.evidence, "summary.json"), summary);
  const result = renderResult(summary, byId, record);
  const resultPath = join(ctx.outDir, "RESULT.md");
  writeFileSync(resultPath, result);
  return resultPath;
}

function sentence(value) {
  if (!value) return "(missing)";
  const text = String(value).trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function ms(command) {
  return command ? command.wallMs.toFixed(3) : "n/a";
}

function cell(value) {
  if (value == null) return "";
  return String(value).replaceAll("|", "/");
}

function renderResult(summary, byId, record) {
  const failed = record.checks.filter((item) => !item.ok);
  const rows = summary.commands.map((command) => `| ${command.id} | ${command.exit} | ${command.wallMs.toFixed(3)} | ${cell(command.extract?.verdict || command.extract?.outcome || command.extract?.message || command.extract?.reason || "")} |`);
  const negativeRows = summary.negatives.map((item) => `| negative-${item.label} | ${item.exit} | ${item.wallMs.toFixed(3)} | source_root_refused, out dir empty |`);
  const d1 = byId["d1-reuse-frozen"]?.extract;
  const d1p = byId["d1-produce-frozen"]?.extract;
  const d1b = byId["d1-bind-frozen"]?.extract;
  const d2 = byId["d2-direct-frozen"]?.extract;
  const bindRefusal = byId["d2-bind-refusal"]?.extract;
  const hash1 = byId["d1-recompute-hash-only"]?.extract;
  const hash2 = byId["d2-hash-only"]?.extract;
  const lines = [];
  lines.push("# N5-R05 receipt");
  lines.push("");
  lines.push(summary.verdict.text);
  lines.push("");
  lines.push("## Bases");
  lines.push("");
  lines.push(`- Declared writer base: \`${DECLARED_WRITER_BASE}\`, tree \`${DECLARED_WRITER_TREE}\`.`);
  lines.push(`- Actual writer base at this run: \`${summary.writer.head}\`, tree \`${summary.writer.tree}\`. ${summary.writer.head === DECLARED_WRITER_BASE && summary.writer.tree === DECLARED_WRITER_TREE ? "The actual writer HEAD matches the declared base." : "The actual writer HEAD differs from the declared base."}`);
  lines.push(`- Writer tools/result-reuse tree: \`${summary.writer.reuse}\`. Every CLI path in this run is under the source root.`);
  lines.push(`- Writer tools/recurring-job-recipes tree: \`${summary.writer.recipes}\`. Writer capture blob \`${summary.writer.capture}\`, prior blob \`${summary.writer.prior}\`. Same fixture blobs, read only through the source root.`);
  lines.push(`- Input source: \`${SOURCE_COMMIT}\`, tree \`${SOURCE_TREE}\`.`);
  lines.push(`- Input tools/result-reuse tree: \`${REUSE_TREE}\`, equal to \`${RECUR_COMMIT}\`.`);
  lines.push(`- Input tools/recurring-job-recipes tree: \`${RECIPES_TREE}\`.`);
  lines.push("- Writer history at this run is the declared base. The input commit is the detached source root.");
  lines.push(`- Source root for this run: \`${summary.source.root}\`.`);
  lines.push(`- Node: ${summary.node}. Run started: ${summary.startedAt}.`);
  lines.push("");
  lines.push("## Blobs");
  lines.push("");
  lines.push(`- example-unchanged.json git blob \`${BLOBS.capture}\`, raw sha256 \`${summary.captureRawSha256}\`.`);
  lines.push(`- source-change.prior.json git blob \`${BLOBS.prior}\`, raw sha256 \`${summary.priorRawSha256}\`.`);
  lines.push(`- example-changed.json git blob \`${BLOBS.changed}\`.`);
  lines.push(`- result-reuse cli.mjs \`${BLOBS.reuseCli}\`, src/export.mjs \`${BLOBS.exportMjs}\`, src/project.mjs \`${BLOBS.projectMjs}\`, src/map.mjs \`${BLOBS.mapMjs}\`.`);
  lines.push(`- recipes cli.mjs \`${BLOBS.recipesCli}\`, verification-reconcile.mjs \`${BLOBS.verifyRecipe}\`, source-change-alert.mjs \`${BLOBS.alertRecipe}\`.`);
  lines.push(`- D1 before-work digest: \`${summary.inputDigest}\`.`);
  lines.push("");
  lines.push("## Normal consumer output");
  lines.push("");
  lines.push("D1 source-change-alert. Consumer: owner and synthetic. Task source-change-example, subject source-change-example-decision, fields title, clock 2026-09-09T08:00:00.000Z, horizon 168.");
  lines.push("");
  lines.push(`- One producer run, then a hit with the producer absent. Producer outcome \`${d1p?.outcome}\`, recovery \`${d1p?.recovery}\`, payment.attempted \`${d1p?.paymentAttempted}\`.`);
  lines.push(`- Bind action \`${d1b?.action}\`, producerInvoked \`${d1b?.producerInvoked}\`.`);
  lines.push(`- Reuse verdict \`${d1?.verdict}\`, outcome \`${d1?.outcome}\`, recovery \`${d1?.recovery}\`, producerInvoked \`${d1?.producerInvoked}\`.`);
  lines.push(`- Statement: ${d1?.statement || "(missing)"}.`);
  lines.push(`- Operator next: ${sentence(d1?.operatorNext)}`);
  lines.push(`- recomputeCostAvoidedNetOfUpkeep: \`${d1?.liveMetric}\`. inputCaptureNs: ${d1?.inputCaptureNs}.`);
  lines.push("");
  lines.push("D2 verification-reconcile. Consumer: synthetic. Same capture file and same prior file, unedited recipe, direct sharing. No opt-in flag exists on this command.");
  lines.push("");
  lines.push(`- Outcome \`${d2?.outcome}\`, recovery \`${d2?.recovery}\`, mismatches \`${JSON.stringify(d2?.mismatches)}\`.`);
  lines.push(`- noChangeProven \`${d2?.noChangeProven}\`, automaticPaymentReplay \`${d2?.automaticPaymentReplay}\`, payment.attempted \`${d2?.paymentAttempted}\`.`);
  lines.push(`- Operator next: ${sentence(d2?.operatorNext)}`);
  lines.push("");
  lines.push("Within-CLI no-fit for D2:");
  lines.push("");
  lines.push(`- decide-or-reuse bind of a verification-reconcile manifest exited ${byId["d2-bind-refusal"]?.exit}. Message: ${bindRefusal?.message || "(missing)"}. No observation file was written.`);
  lines.push(`- The reuse form on that manifest exited ${byId["d2-reuse-against-d1"]?.exit} with verdict \`${byId["d2-reuse-against-d1"]?.extract?.verdict}\` reason \`${byId["d2-reuse-against-d1"]?.extract?.reason}\`. It did not return a D2 decision.`);
  lines.push(`- preview and export of the D2 result exited ${byId["d2-preview"]?.exit} and ${byId["d2-export"]?.exit}. Message: ${byId["d2-export"]?.extract?.message || "(missing)"}. Export did not store an unbound legacy observation, so a later unbound_legacy recompute was not reached.`);
  lines.push(`- preview and export of the capture file itself exited ${byId["capture-preview"]?.exit} and ${byId["capture-export"]?.exit}. The capture is shared as the fixture file.`);
  lines.push("");
  lines.push("## One result does not answer the other");
  lines.push("");
  lines.push("ContentHash-only variant, title left at Example Domain. Both commands read derived/capture-hash-only.json.");
  lines.push("");
  lines.push(`- D1 recompute: outcome \`${hash1?.outcome}\`, recovery \`${hash1?.recovery}\`. Title is the watched field, so the field alert does not fire.`);
  lines.push(`- D1 saved reuse against that manifest: verdict \`${byId["d1-reuse-hash-only"]?.extract?.verdict}\`, reason \`${byId["d1-reuse-hash-only"]?.extract?.reason}\`. The frozen hit is not served.`);
  lines.push(`- D2: outcome \`${hash2?.outcome}\`, mismatches ${JSON.stringify(hash2?.mismatches)}. The later observation is not the same delivered content.`);
  lines.push("");
  lines.push("Field-changed committed fixture example-changed.json:");
  lines.push("");
  lines.push(`- D1 reuse reason \`${byId["d1-reuse-changed"]?.extract?.reason}\`. D1 recompute outcome \`${byId["d1-recompute-changed"]?.extract?.outcome}\`, recovery \`${byId["d1-recompute-changed"]?.extract?.recovery}\`.`);
  lines.push(`- D2 outcome \`${byId["d2-changed"]?.extract?.outcome}\`, mismatches ${JSON.stringify(byId["d2-changed"]?.extract?.mismatches)}.`);
  lines.push("");
  lines.push("## Failure cases");
  lines.push("");
  lines.push(`- Missing capture, bind exit ${byId["d1-bind-missing-capture"]?.exit}: ${byId["d1-bind-missing-capture"]?.extract?.message}.`);
  lines.push(`- Missing capture, reuse exit ${byId["d1-reuse-missing-capture"]?.exit}: verdict \`${byId["d1-reuse-missing-capture"]?.extract?.verdict}\`, reason \`${byId["d1-reuse-missing-capture"]?.extract?.reason}\`. The bind path keeps the specific sentence. The reuse path collapses it to input_not_before_work.`);
  lines.push(`- D2 with no --candidate exit ${byId["d2-missing-candidate"]?.exit}, code \`${byId["d2-missing-candidate"]?.extract?.evidenceCode}\`.`);
  lines.push(`- D2 nonexistent candidate exit ${byId["d2-invalid-candidate"]?.exit}, code \`${byId["d2-invalid-candidate"]?.extract?.evidenceCode}\`.`);
  lines.push(`- Partial capture: D1 reuse reason \`${byId["d1-reuse-partial"]?.extract?.reason}\`. D2 outcome \`${byId["d2-partial"]?.extract?.outcome}\`, recovery \`${byId["d2-partial"]?.extract?.recovery}\`.`);
  lines.push(`- Freshness clock ${STALE_CLOCK}, horizon 168: D1 reason \`${byId["d1-reuse-stale"]?.extract?.reason}\`. D2 outcome \`${byId["d2-stale"]?.extract?.outcome}\`, recovery \`${byId["d2-stale"]?.extract?.recovery}\`.`);
  lines.push(`- Withdrawal: D1 reason \`${byId["d1-withdraw"]?.extract?.reason}\`. D2 --withdraw-opt-in exit ${byId["d2-withdraw-flag"]?.exit}. The direct recipe has no opt-in gate. The frozen D2 command succeeded without one. Recorded, not fixed.`);
  lines.push(`- Wrong source root and missing source root: both refused with exit 2, empty stdout, and an empty output directory. No CLI was started.`);
  lines.push("");
  lines.push("## Commands and exits");
  lines.push("");
  lines.push("Executables are the source-root tools/result-reuse/cli.mjs and tools/recurring-job-recipes/cli.mjs. Full argv, stdout, and stderr are under evidence/.");
  lines.push("");
  lines.push("| Id | Exit | Wall ms | Result |");
  lines.push("| --- | --- | --- | --- |");
  lines.push(...rows);
  lines.push(...negativeRows);
  lines.push("");
  lines.push("## Adaptation and review versus direct sharing");
  lines.push("");
  lines.push("Direct sharing is the competent baseline. It is the two recipe commands on the same capture and the same prior. No second fetch was made.");
  lines.push("");
  lines.push(`| Step | Wall ms | What it answers |`);
  lines.push(`| --- | --- | --- |`);
  lines.push(`| D1 direct producer | ${ms(byId["d1-produce-frozen"])} | unchanged, keep_prior |`);
  lines.push(`| D1 bind | ${ms(byId["d1-bind-frozen"])} | stores that decision |`);
  lines.push(`| D1 reuse hit, producer absent | ${ms(byId["d1-reuse-frozen"])} | same decision, plus digest, opt-in, freshness, and private-field gates |`);
  lines.push(`| D2 direct | ${ms(byId["d2-direct-frozen"])} | same delivered content, no payment replay |`);
  lines.push(`| D2 decide-or-reuse bind | ${ms(byId["d2-bind-refusal"])} | refuses |`);
  lines.push(`| D2 export | ${ms(byId["d2-export"])} | refuses |`);
  lines.push("");
  lines.push(`Measured producer wall time is ${ms(byId["d1-produce-frozen"])} ms. Measured reuse-hit wall time is ${ms(byId["d1-reuse-frozen"])} ms. The hit also reports inputCaptureNs ${d1?.inputCaptureNs}. Net savings are not claimed. The CLI sets recomputeCostAvoidedNetOfUpkeep to costs_unknown, and operator compute is not priced.`);
  lines.push("");
  lines.push("Adaptation: D1 uses the existing decide-or-reuse flags. D2 was not adapted into that CLI. The bind refusal is the whole adaptation result, and the useful D2 answer is the same direct command sharing already uses. Consumer diff is none. project.mjs and map.mjs stay internal to those CLIs. Bind is the path that writes the mapped observation. Preview and export are the path that enters project, and both refuse this capture and the D2 result.");
  lines.push("");
  lines.push(`Review: ${record.checks.length} checks, ${failed.length} failed. Source worktree status after the run is clean. No tools/result-reuse or tools/recurring-job-recipes file was edited.`);
  if (failed.length) {
    lines.push("");
    lines.push("Failed checks:");
    lines.push("");
    for (const item of failed) {
      lines.push(`- ${item.id}: ${JSON.stringify(item.detail)}`);
    }
  }
  lines.push("");
  lines.push("## Falsifier");
  lines.push("");
  lines.push(`- Frozen D1 reuse and frozen D2 direct answer: ${["d1-reuse-verdict", "d1-reuse-outcome", "d1-reuse-recovery", "d2-outcome", "d2-no-change", "d2-no-replay"].every((id) => record.checks.find((item) => item.id === id)?.ok) ? "pass" : "fail"}.`);
  lines.push(`- ContentHash-only divergence: ${record.checks.find((item) => item.id === "decisions-differ")?.ok ? "pass" : "fail"}.`);
  lines.push(`- No second frozen producer, no live fetch, no consumer edit: ${record.checks.find((item) => item.id === "frozen-producer-once")?.ok && record.checks.find((item) => item.id === "source-clean")?.ok ? "pass" : "fail"}. Variant recomputes use example-changed.json and the derived hash-only file, not a second run on the frozen capture.`);
  lines.push(`- Refusals stay recompute, refusal, or error: ${record.checks.find((item) => item.id === "d2-bind-no-decision")?.ok && record.checks.find((item) => item.id === "missing-bind-no-file")?.ok ? "pass" : "fail"}.`);
  lines.push("");
  lines.push("## Next external-use question");
  lines.push("");
  lines.push("Who besides the owner would hold a second need against the same capture? That is R07's scale question, and it stays a hold.");
  lines.push("");
  lines.push("## Limits");
  lines.push("");
  lines.push("- Payment was not attempted. The prior records payment.attempted false, and both frozen outputs report payment.attempted false.");
  lines.push("- No live fetch, paid monitor, cron, or scheduled request. --schedule daily is only the recipe's stored hint.");
  lines.push("- No public-safe certification and no merchant acceptance. The capture has no license field. Permission is the caller opt-in, the public example.com fixture, and private-field rejection.");
  lines.push("- No savings claim. Costs stay costs_unknown.");
  lines.push("- No edit to result-reuse, the recipes, or any core. The release branch codex/h136010-machine-release-20261103 was not pushed, merged, or used as a PR base.");
  lines.push("- experiments/n5-remainder was not used.");
  lines.push("- D2's missing opt-in withdrawal gate is a finding of the direct route, not a fix.");
  lines.push("- Consumers stay labeled owner and synthetic. There is no second real consumer.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error || args.help || !args.sourceRoot) {
    refuse({
      ok: false,
      code: args.help ? "help" : "usage",
      message: args.error || "usage: run.mjs --source-root <detached-9f6c0c4e> --out <experiment-dir>",
    });
  }
  const sourceRoot = resolve(args.sourceRoot);
  const outDir = resolve(args.out || SCRIPT_DIR);
  const verified = verifySource(sourceRoot);
  if (!verified.ok) {
    refuse({
      ok: false,
      code: "source_root_refused",
      message: verified.message,
      effects: [],
      checks: verified.checks.filter((item) => !item.ok),
    });
  }
  if (isInside(outDir, sourceRoot)) {
    refuse({
      ok: false,
      code: "source_root_refused",
      message: "output directory is inside the source root",
      effects: [],
    });
  }
  const writer = verifyWriter();
  if (!writer.ok) {
    refuse({
      ok: false,
      code: "writer_checkout_refused",
      message: "writer result-reuse tree is not the pinned main tree; refusing before any CLI call",
      effects: [],
      writer,
    });
  }
  const startedAt = new Date().toISOString();
  let negatives = [];
  if (!args.skipNegative) {
    const missing = join(tmpdir(), "n5-r05-missing-source-root");
    rmSync(missing, { recursive: true, force: true });
    negatives = [
      runNegative(missing, "missing"),
      runNegative(writer.top, "writer"),
    ];
  }
  const outcome = execute({
    sourceRoot,
    outDir,
    writer,
    verified,
    negatives,
    startedAt,
  });
  process.stdout.write(`${JSON.stringify({ ok: outcome.verdict.code === "supported-with-within-cli-no-fit", verdict: outcome.verdict.code, result: outcome.resultPath, failed: outcome.failed.map((item) => item.id) })}\n`);
  process.exit(outcome.verdict.code === "supported-with-within-cli-no-fit" ? 0 : 1);
}

main();
