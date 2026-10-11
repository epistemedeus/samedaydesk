import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { SUPPORT } from "../support.mjs";
import { captureInstalled } from "../installed.mjs";
import { observeSource } from "../source.mjs";
import { invocationId, runOneShot } from "../impact.mjs";
import { seal, sha256Hex, writeImmutable } from "../evidence.mjs";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(root, "tools/release-impact-211710/cli.mjs");
const CLOCK = "2026-10-11T03:02:00.000Z", INSTALLED_AT = "2026-10-11T03:00:00.000Z", OBSERVED_AT = "2026-10-11T03:01:00.000Z";
let dir, repo, base, changed, unrelated, removed, requirement, installed, installedPath;
async function command(program, args, cwd = repo) {
  return (await execute(program, args, { cwd, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 })).stdout.trim();
}
async function commit(message) {
  await command("git", ["add", "."]);
  await command("git", ["-c", "user.name=Root QA", "-c", "user.email=root-qa@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", message]);
  return command("git", ["rev-parse", "HEAD"]);
}
async function observation(toRef = base, overrides = {}) {
  const doc = await observeSource({ repo, fromRef: base, toRef, clock: OBSERVED_AT, windowStart: INSTALLED_AT });
  assert.equal(doc.status, "complete");
  return seal({ ...doc, ...overrides });
}
async function inputFor(name, doc, overrides = {}) {
  const observationPath = join(dir, `${name}.observation.json`);
  await writeFile(observationPath, `${JSON.stringify(doc)}\n`);
  return { installedPath, observationPath, repo, clock: CLOCK, horizonHours: 24, outDir: join(dir, `results-${name}`), ...overrides };
}
async function runCli(options, extra = []) {
  const args = [cli, "--installed", options.installedPath, "--repo", options.repo, "--clock", options.clock,
    "--horizon-hours", String(options.horizonHours), "--out-dir", options.outDir, "--timeout-ms", String(options.timeoutMs || 5000)];
  if (options.observationUrl) args.push("--observation-url", options.observationUrl);
  else args.push("--observation", options.observationPath);
  if (options.mountedOrigin) args.push("--mounted-origin");
  let stdout, stderr, code = 0;
  try { ({ stdout, stderr } = await execute(process.execPath, [...args, ...extra], { cwd: root, encoding: "utf8", timeout: 12000, maxBuffer: 1024 * 1024 })); }
  catch (error) { code = error.code; stdout = error.stdout; stderr = error.stderr; }
  assert.equal(stderr, "");
  return { code, body: JSON.parse(stdout) };
}
function noEffects(body) {
  assert.equal(body.effects.installedStateChanged, false);
  assert.equal(body.effects.paymentAttempted, false);
  assert.equal(body.knowledge.correctionValidityChanged, false);
  assert.equal(body.knowledge.unrelatedKnowledgeDiscarded, false);
  assert.equal(body.claims.customerOwnership, "unknown");
}
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "release-impact-211710-test-")); repo = join(dir, "installed-root");
  await mkdir(dirname(join(repo, SUPPORT.sourcePath)), { recursive: true });
  await copyFile(join(root, SUPPORT.sourcePath), join(repo, SUPPORT.sourcePath));
  const manifest = { name: "samedaydesk", version: "1.0.0", engines: { node: "22.x" }, dependencies: { unrelated: "1.0.0" } };
  await writeFile(join(repo, "package.json"), JSON.stringify(manifest));
  await command("git", ["init", "--quiet"]); base = await commit("QA replica of exact accepted source");
  installed = await captureInstalled({ repo, ref: base, clock: INSTALLED_AT });
  installedPath = join(dir, "installed.json"); await writeFile(installedPath, `${JSON.stringify(installed)}\n`);
  const source = await readFile(join(repo, SUPPORT.sourcePath), "utf8");
  await writeFile(join(repo, SUPPORT.sourcePath), source.replace("process.exit(1);", "process.exit(0);"));
  changed = await commit("Controlled supported refusal regression");
  await command("git", ["reset", "--hard", base]);
  await writeFile(join(repo, "package.json"), JSON.stringify({ ...manifest, dependencies: { unrelated: "2.0.0" } }));
  await writeFile(join(repo, "package-lock.json"), JSON.stringify({ fixture: true, dependency: "unrelated@2.0.0" }));
  unrelated = await commit("Unrelated dependency transition");
  await command("git", ["reset", "--hard", base]);
  await rm(join(repo, SUPPORT.sourcePath)); removed = await commit("Controlled source removal");
  await command("git", ["reset", "--hard", base]);
  await writeFile(join(repo, "package.json"), JSON.stringify({ ...manifest, engines: { node: "24.x" } }));
  requirement = await commit("Changed supported runtime requirement");
  await command("git", ["reset", "--hard", base]);
});
after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

test("actual CLI returns useful unchanged with exact refs, immutable prior and recipe outputs", async () => {
  const priorBytes = await readFile(installedPath);
  const options = await inputFor("unchanged", await observation());
  const { body, code } = await runCli(options);
  assert.equal(code, 0); assert.equal(body.outcome, "unchanged");
  assert.deepEqual([body.comparedRefs.from, body.comparedRefs.to], [base, base]);
  assert.equal(body.recipes.change.schema, "samedaydesk.recurring-job-recipe-result.v1");
  assert.equal(body.recipes.verification.outcome, "unchanged");
  assert.deepEqual(body.observationWindow, { start: INSTALLED_AT, end: OBSERVED_AT });
  assert.equal(body.nextCheck.owner, "Root"); noEffects(body);
  assert.deepEqual(await readFile(installedPath), priorBytes);
  assert.equal(JSON.parse(await readFile(body.persisted.path, "utf8")).integritySha256, body.integritySha256);
});
test("supported source regression is relevant and asks for the owning check, without claiming candidate installation", async () => {
  const { body, code } = await runCli(await inputFor("relevant", await observation(changed)));
  assert.equal(code, 0); assert.equal(body.outcome, "relevant_change");
  assert.ok(body.supportedFieldChanges.some(row => row.field === "sourceBlob"));
  assert.deepEqual(body.nextCheck.command, SUPPORT.normalCommand);
  assert.equal(body.claims.behaviorRegressionProven, false); assert.equal(body.claims.candidateInstalled, false);
  assert.equal(body.candidate.source.ref, changed); noEffects(body);
});
test("unrelated dependency changes retain supported knowledge and produce unchanged", async () => {
  const { body } = await runCli(await inputFor("unrelated", await observation(unrelated)));
  assert.equal(body.outcome, "unchanged");
  assert.equal(body.reason, "unrelated_source_change_supported_closure_unchanged");
  assert.ok(body.sourceDiff.unrelatedPaths.includes("package-lock.json"));
  assert.ok(body.sourceDiff.unrelatedPaths.includes("package.json"));
  assert.deepEqual(body.supportedFieldChanges, []); noEffects(body);
});
test("known removal of supported source is relevant rather than silently absent coverage", async () => {
  const { body } = await runCli(await inputFor("removed", await observation(removed)));
  assert.equal(body.outcome, "relevant_change"); assert.equal(body.candidate.source.source.status, "absent");
});
test("supported runtime requirement and explicit dependency versions are relevant", async t => {
  for (const [name, doc] of [
    ["requirement", await observation(requirement)],
    ["node", await observation(base, { runtime: { node: "v24.0.0", tar: installed.installation.runtime.tar, evidenceKind: "operator_supplied_target" } })],
    ["tar", await observation(base, { runtime: { node: process.version, tar: "tar (GNU tar) 1.36", evidenceKind: "operator_supplied_target" } })],
  ]) await t.test(name, async () => { const { body } = await runCli(await inputFor(name, doc)); assert.equal(body.outcome, "relevant_change"); });
});
test("stale installation refuses before producing an alert", async () => {
  const { body, code } = await runCli(await inputFor("stale", await observation(changed), { horizonHours: 0.01 }));
  assert.equal(code, 2); assert.equal(body.outcome, "stale_baseline"); assert.equal(body.recipes, undefined); noEffects(body);
});
test("missing immutable baseline is insufficient coverage", async () => {
  const { prior: _removed, ...rest } = installed;
  const path = join(dir, "no-prior.json"); await writeFile(path, JSON.stringify(seal(rest)));
  const { body } = await runCli(await inputFor("missing-prior", await observation(), { installedPath: path }));
  assert.equal(body.outcome, "insufficient_coverage"); assert.equal(body.reason, "missing_or_invalid_baseline");
});
test("missing installed input is an artifact-bearing refusal", async () => {
  const { body } = await runCli(await inputFor("missing-installed", await observation(), { installedPath: join(dir, "not-present.json") }));
  assert.equal(body.outcome, "insufficient_coverage"); assert.equal(body.reason, "input_missing");
  assert.equal(body.persisted.status, "written"); noEffects(body);
});
test("public merge or unknown installation does not supply installed acceptance", async () => {
  const path = join(dir, "merge-only.json");
  await writeFile(path, JSON.stringify(seal({ ...installed, installation: { ...installed.installation, status: "merged_only", relationship: "unknown" } })));
  const { body } = await runCli(await inputFor("merge-only", await observation(), { installedPath: path }));
  assert.equal(body.reason, "installed_acceptance_missing"); assert.equal(body.outcome, "insufficient_coverage");
});
test("installation evidence cannot silently drop predicate or dependency coverage", async t => {
  for (const [name, document] of [
    ["dependency", { ...installed, coverage: { ...installed.coverage, dependencyNames: ["node"] } }],
    ["predicate", { ...installed, installation: { ...installed.installation, probes: [] } }],
  ]) await t.test(name, async () => {
    const path = join(dir, `${name}-installed.json`); await writeFile(path, JSON.stringify(seal(document)));
    const { body } = await runCli(await inputFor(`missing-${name}`, await observation(), { installedPath: path }));
    assert.equal(body.outcome, "insufficient_coverage");
  });
});
test("partial, timeout and error observations retain successful witnesses and stop", async t => {
  for (const status of ["partial", "timed_out", "error"]) await t.test(status, async () => {
    const doc = await observation(changed, { status, failureCode: `controlled_${status}`, after: null });
    const { body, code } = await runCli(await inputFor(status, doc));
    assert.equal(code, status === "error" ? 1 : 2); assert.equal(body.outcome, status);
    assert.equal(body.successfulSourceWitnesses.before.ref, base); assert.equal(body.recipes, undefined); noEffects(body);
  });
});
test("missing source coverage, missing runtime and mismatched refs are refused", async t => {
  for (const [name, patch] of [
    ["coverage", { coverage: { sourcePaths: [], dependencyNames: SUPPORT.dependencies } }],
    ["runtime", { runtime: null }],
    ["ref", { fromRef: changed }],
    ["window", { window: { start: CLOCK, end: OBSERVED_AT } }],
  ]) await t.test(name, async () => {
    const { body } = await runCli(await inputFor(`invalid-${name}`, await observation(base, patch)));
    assert.equal(body.outcome, "insufficient_coverage"); assert.equal(body.recipes, undefined);
  });
});
test("sealed but false blob/diff claims cannot bypass exact local source verification", async t => {
  const doc = await observation(changed);
  for (const [name, patch] of [
    ["blob", { after: installed.installation.source }],
    ["paths", { changedPaths: [] }],
  ]) await t.test(name, async () => {
    const { body } = await runCli(await inputFor(`false-${name}`, seal({ ...doc, ...patch })));
    assert.equal(body.outcome, "insufficient_coverage");
  });
});
test("damaged baseline hashes and unsealed observations refuse", async t => {
  await t.test("baseline", async () => {
    const path = join(dir, "bad-prior.json"); await writeFile(path, JSON.stringify(seal({ ...installed, prior: { ...installed.prior, sha256: "0".repeat(64) } })));
    const { body } = await runCli(await inputFor("bad-prior", await observation(), { installedPath: path }));
    assert.equal(body.reason, "baseline_integrity_mismatch");
  });
  await t.test("observation", async () => {
    const doc = await observation(); doc.changedPaths = [SUPPORT.sourcePath];
    const { body } = await runCli(await inputFor("unsealed", doc)); assert.equal(body.reason, "observation_integrity_mismatch");
  });
});
test("missing Git objects produce a preserved incomplete observation", async () => {
  const doc = await observeSource({ repo, fromRef: base, toRef: "0".repeat(40), clock: OBSERVED_AT, windowStart: INSTALLED_AT });
  assert.equal(doc.status, "partial"); assert.equal(doc.before.ref, base);
  const { body } = await runCli(await inputFor("missing-object", doc)); assert.equal(body.outcome, "partial");
});
test("cold second process returns the same immutable result and leaves input bytes unchanged", async () => {
  const options = await inputFor("cold", await observation(changed));
  const first = await runCli(options); const artifactBytes = await readFile(first.body.persisted.path);
  const second = await runCli(options);
  assert.equal(second.body.persisted.status, "duplicate");
  assert.equal(second.body.integritySha256, first.body.integritySha256);
  assert.deepEqual(await readFile(first.body.persisted.path), artifactBytes); noEffects(second.body);
});
test("cold process preserves an unfinished invocation and does not repeat it", async () => {
  const options = await inputFor("pending", await observation());
  const id = invocationId({ installedDigest: sha256Hex(await readFile(options.installedPath)), observationDigest: sha256Hex(await readFile(options.observationPath)), clock: options.clock, horizonHours: options.horizonHours });
  const path = join(options.outDir, `${id}.pending.json`); writeImmutable(path, seal({ interrupted: true }));
  const bytes = await readFile(path); const { body } = await runCli(options);
  assert.equal(body.outcome, "uncertain_state"); assert.equal(body.reason, "unfinished_invocation_preserved");
  assert.deepEqual(await readFile(path), bytes); noEffects(body);
});
test("cold process preserves a damaged retained result instead of rewriting it", async () => {
  const options = await inputFor("damaged-result", await observation()); const first = await runCli(options);
  await writeFile(first.body.persisted.path, "interrupted artifact bytes\n");
  const { body } = await runCli(options); assert.equal(body.outcome, "uncertain_state");
  assert.equal(await readFile(first.body.persisted.path, "utf8"), "interrupted artifact bytes\n");
});
test("simultaneous invocations cannot overwrite one another", async () => {
  const options = await inputFor("concurrent", await observation());
  const outcomes = await Promise.all([runOneShot(options), runOneShot(options)]);
  assert.equal(outcomes.filter(row => row.persisted.status === "written").length, 1);
  assert.ok(outcomes.some(row => ["uncertain_state", "unchanged"].includes(row.outcome)));
});
test("local input symlink and oversized input refuse before recipe execution", async t => {
  for (const name of ["symlink", "large"]) await t.test(name, async () => {
    const path = join(dir, `${name}-input.json`);
    if (name === "symlink") await symlink(installedPath, path); else await writeFile(path, " ".repeat(1024 * 1024 + 1));
    const { body } = await runCli(await inputFor(name, await observation(), { installedPath: path }));
    assert.equal(body.outcome, "insufficient_coverage"); assert.equal(body.recipes, undefined);
  });
});
test("capture and observer CLIs are runnable and never overwrite prior exports", async () => {
  const capture = join(root, "tools/release-impact-211710/capture-installed.mjs"), observer = join(root, "tools/release-impact-211710/observe-source.mjs");
  const captured = join(dir, "capture-cli.json"), observed = join(dir, "observe-cli.json");
  const output = JSON.parse(await command(process.execPath, [capture, "--repo", repo, "--ref", base, "--clock", INSTALLED_AT, "--out", captured]));
  assert.equal(output.relationship, "owner_qa");
  const bytes = await readFile(captured);
  await assert.rejects(command(process.execPath, [capture, "--repo", repo, "--ref", base, "--clock", INSTALLED_AT, "--out", captured]));
  assert.deepEqual(await readFile(captured), bytes);
  const source = JSON.parse(await command(process.execPath, [observer, "--repo", repo, "--from", base, "--to", unrelated, "--clock", OBSERVED_AT, "--window-start", INSTALLED_AT, "--out", observed]));
  assert.equal(source.status, "complete");
});
test("mounted HTTP source uses actual CLI and bounded transport for success, partial, timeout, error and redirect", async t => {
  const full = await observation(changed), partial = seal({ ...full, status: "partial", failureCode: "partial_fixture", after: null });
  const counts = new Map();
  const server = createServer((req, res) => {
    counts.set(req.url, (counts.get(req.url) || 0) + 1);
    if (req.url === "/error") { res.writeHead(503); return res.end("source unavailable"); }
    if (req.url === "/redirect") { res.writeHead(302, { location: "/full" }); return res.end(); }
    if (req.url === "/slow") { const timer = setTimeout(() => res.end(JSON.stringify(full)), 200); res.on("close", () => clearTimeout(timer)); return; }
    if (req.url === "/large") { res.writeHead(200, { "content-length": String(1024 * 1024 + 1) }); return res.end("x"); }
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify(req.url === "/partial" ? partial : full));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    for (const [path, expected] of [["full", "relevant_change"], ["partial", "partial"], ["slow", "timed_out"], ["error", "error"], ["redirect", "error"], ["large", "error"]]) await t.test(path, async () => {
      const options = { installedPath, repo, clock: CLOCK, horizonHours: 24, outDir: join(dir, `http-${path}`),
        observationUrl: `http://127.0.0.1:${server.address().port}/${path}`, mountedOrigin: true, timeoutMs: path === "slow" ? 25 : 5000 };
      const started = Date.now();
      const { body } = await runCli(options); assert.equal(body.outcome, expected); noEffects(body);
      if (path === "large") assert.ok(Date.now() - started < 4000, "header refusal must close its owned HTTP request before its transport timeout");
      assert.equal(counts.get(`/${path}`), 1); assert.equal(body.persisted.status, "written");
      assert.equal(body.transport.attempts, 1);
      assert.ok(Date.parse(body.transport.attemptWindow.start) <= Date.parse(body.transport.attemptWindow.end));
      if (path === "error") assert.equal(body.transport.status, 503);
      if (path === "redirect") assert.equal(body.reason, "observation_redirect_refused");
      if (path === "large") assert.equal(body.reason, "observation_body_limit");
    });
    assert.equal(counts.get("/full"), 1, "redirect must not follow or retry");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test("payment replay options cannot obtain an execution surface", async () => {
  const options = await inputFor("payment-option", await observation());
  const { body, code } = await runCli(options, ["--replay-payment"]);
  assert.equal(code, 1); assert.equal(body.paymentAttempted, false); assert.equal(body.installedStateChanged, false);
});
test("unrelated private metadata stays in the immutable input and out of result artifacts", async () => {
  const marker = "PRIVATE_INPUT_MARKER_DO_NOT_EXPORT";
  const privateInstalled = seal({ ...installed,
    installation: { ...installed.installation, package: { ...installed.installation.package, customerData: marker }, source: { ...installed.installation.source, unrelatedKnowledge: marker }, runtime: { ...installed.installation.runtime, privateContext: marker } },
    coverage: { ...installed.coverage, privateContext: marker },
  });
  const path = join(dir, "private-metadata.json"); const bytes = `${JSON.stringify(privateInstalled)}\n`; await writeFile(path, bytes);
  const doc = await observation(base, { status: "partial", before: { ...installed.installation.source, privateContext: marker }, window: { start: INSTALLED_AT, end: OBSERVED_AT, privateContext: marker }, coverage: { ...(await observation()).coverage, privateContext: marker }, failureCode: marker });
  const { body } = await runCli(await inputFor("private-metadata", doc, { installedPath: path }));
  assert.equal(body.outcome, "partial"); assert.equal(JSON.stringify(body).includes(marker), false);
  assert.equal(await readFile(path, "utf8"), bytes);
  assert.equal((await readFile(body.persisted.path, "utf8")).includes(marker), false);
  const complete = await observation(base, { before: { ...installed.installation.source, privateContext: marker }, coverage: { ...(await observation()).coverage, privateContext: marker } });
  const completed = await runCli(await inputFor("private-metadata-complete", complete, { installedPath: path }));
  assert.equal(completed.body.outcome, "unchanged"); assert.equal(JSON.stringify(completed.body).includes(marker), false);
});
test("cold source assessment preserves unknown prior payment without replaying or reconciling it", async () => {
  const path = join(dir, "uncertain-payment.json");
  const document = seal({ ...installed, prior: { ...installed.prior, payment: { attempted: true, receiptId: "unknown-payment-fixture", charged: false } } });
  const bytes = `${JSON.stringify(document)}\n`; await writeFile(path, bytes);
  const options = await inputFor("uncertain-payment", await observation(), { installedPath: path });
  const first = await runCli(options), cold = await runCli(options);
  assert.equal(first.body.outcome, "unchanged"); assert.equal(cold.body.persisted.status, "duplicate");
  assert.equal(cold.body.recipes.change.payment.hasPriorReceipt, true); assert.equal(cold.body.claims.paymentReconciled, false);
  assert.equal(JSON.stringify(cold.body).includes("unknown-payment-fixture"), false);
  assert.equal(await readFile(path, "utf8"), bytes); noEffects(cold.body);
});
test("ambient Git replacement cannot change an exact compared object", async () => {
  await command("git", ["replace", base, changed]);
  try {
    const doc = await observation(); assert.equal(doc.before.source.blob, SUPPORT.acceptedBlob);
    const { body } = await runCli(await inputFor("git-replacement", doc)); assert.equal(body.outcome, "unchanged");
  } finally { await command("git", ["replace", "-d", base]); }
});
test("uninterpretable source runtime coverage preserves the prior without exporting its raw value", async () => {
  const marker = "PRIVATE_RUNTIME_MARKER";
  const manifestPath = join(repo, "package.json"), original = await readFile(manifestPath);
  try {
    const doc = JSON.parse(original); doc.engines.node = marker; await writeFile(manifestPath, JSON.stringify(doc));
    const head = await commit("Controlled uninterpretable runtime coverage");
    const observed = await observeSource({ repo, fromRef: base, toRef: head, clock: OBSERVED_AT, windowStart: INSTALLED_AT });
    assert.equal(observed.status, "partial");
    const { body } = await runCli(await inputFor("runtime-uninterpretable", observed));
    assert.equal(body.outcome, "partial"); assert.equal(body.observedFailure, "source_runtime_requirement_unrecognized");
    assert.equal(JSON.stringify(body).includes(marker), false); noEffects(body);
  } finally { await command("git", ["reset", "--hard", base]); }
});
test("unsupported source origins refuse without claiming a request was executed", async () => {
  const options = { installedPath, repo, clock: CLOCK, horizonHours: 24, outDir: join(dir, "unsupported-origin"), observationUrl: "https://unsupported.example.invalid/observation.json" };
  const { body } = await runCli(options);
  assert.equal(body.outcome, "insufficient_coverage"); assert.equal(body.reason, "observation_origin_not_supported");
  assert.equal(body.transport.attempts, 0); noEffects(body);
});
test("missing installation acceptance stops before an HTTP observation request", async () => {
  let requests = 0;
  const server = createServer((_req, res) => { requests += 1; res.end("{}"); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const options = { installedPath: join(dir, "missing-http-installation.json"), repo, clock: CLOCK, horizonHours: 24,
      outDir: join(dir, "missing-before-http"), observationUrl: `http://127.0.0.1:${server.address().port}/observation.json`, mountedOrigin: true };
    const { body } = await runCli(options);
    assert.equal(body.reason, "input_missing"); assert.equal(requests, 0); assert.equal(body.transport.attempts, 0);
    assert.equal(body.inputEvidence.observation, "not_read_or_incomplete_request");
  } finally { await new Promise(resolve => server.close(resolve)); }
});
