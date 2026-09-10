import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const ARCHIVE = join(ROOT, "client/public/kit/s178-consumer-repeat-kit.tgz");
const OBTAIN = join(HERE, "../bin/obtain-kit.mjs");
const EXPECTED_SHA = "04e9b6f382eedd91ae27b0d0faa68abbee7c26a1f06f52e415cb5a5884dfe05d";
const EXPECTED_BYTES = 718948;
const CLOCK = "2026-09-10T18:00:00.000Z";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function obtain(args, cwd = ROOT) {
  return spawnSync(process.execPath, [OBTAIN, ...args], {
    encoding: "utf8",
    cwd,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function obtainAsync(args, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [OBTAIN, ...args], {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`obtain timed out: ${stderr || stdout}`));
    }, 30_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

function parseJson(stdout) {
  return JSON.parse(String(stdout).trim());
}

function runCli(kitRoot, args) {
  return spawnSync(process.execPath, [join(kitRoot, "bin/s178-cli.mjs"), ...args], {
    encoding: "utf8",
    cwd: kitRoot,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function digestFile(path) {
  return sha256(readFileSync(path));
}

test("committed archive pins match the public kit file", () => {
  const buf = readFileSync(ARCHIVE);
  assert.equal(buf.length, EXPECTED_BYTES);
  assert.equal(sha256(buf), EXPECTED_SHA);
});

test("wrong digest refuses with no extract and no execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "s227-wrong-digest-"));
  const dest = join(dir, "kit.tgz");
  const extractDir = join(dir, "extract");
  const fake = join(dir, "fake.tgz");
  const buf = Buffer.alloc(EXPECTED_BYTES, 7);
  writeFileSync(fake, buf);
  const r = obtain([
    "--from",
    fake,
    "--expected-sha256",
    EXPECTED_SHA,
    "--expected-bytes",
    String(EXPECTED_BYTES),
    "--dest",
    dest,
    "--extract-dir",
    extractDir,
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "wrong-digest");
  assert.equal(body.extracted, false);
  assert.equal(body.executed, false);
  assert.equal(existsSync(dest), false);
  assert.equal(existsSync(extractDir), false);
  assert.equal(existsSync(join(extractDir, "s178-consumer-repeat-kit/bin/s178-cli.mjs")), false);
});

test("wrong size refuses with no extract and no execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "s227-wrong-size-"));
  const dest = join(dir, "kit.tgz");
  const extractDir = join(dir, "extract");
  const fake = join(dir, "truncated.tgz");
  writeFileSync(fake, readFileSync(ARCHIVE).subarray(0, 100));
  const r = obtain([
    "--from",
    fake,
    "--expected-sha256",
    EXPECTED_SHA,
    "--expected-bytes",
    String(EXPECTED_BYTES),
    "--dest",
    dest,
    "--extract-dir",
    extractDir,
  ]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const body = parseJson(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, "wrong-size");
  assert.equal(body.extracted, false);
  assert.equal(body.executed, false);
  assert.equal(existsSync(dest), false);
  assert.equal(existsSync(extractDir), false);
});

test("bad HTTP status refuses with no extract and no execution", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s227-bad-status-"));
  const dest = join(dir, "kit.tgz");
  const extractDir = join(dir, "extract");
  const { server, origin } = await listen((_req, res) => {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing");
  });
  try {
    const r = await obtainAsync([
      "--from",
      `${origin}/kit/s178-consumer-repeat-kit.tgz`,
      "--expected-sha256",
      EXPECTED_SHA,
      "--expected-bytes",
      String(EXPECTED_BYTES),
      "--dest",
      dest,
      "--extract-dir",
      extractDir,
    ]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, false);
    assert.equal(body.code, "bad-status");
    assert.equal(body.status, 404);
    assert.equal(body.extracted, false);
    assert.equal(body.executed, false);
    assert.equal(existsSync(dest), false);
    assert.equal(existsSync(extractDir), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTP download of the committed archive verifies, extracts, and does not execute", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s227-http-ok-"));
  const dest = join(dir, "s178-consumer-repeat-kit.tgz");
  const extractDir = join(dir, "extract");
  const kitBytes = readFileSync(ARCHIVE);
  const { server, origin } = await listen((req, res) => {
    if (req.url === "/kit/s178-consumer-repeat-kit.tgz") {
      res.writeHead(200, { "content-type": "application/gzip", "content-length": kitBytes.length });
      res.end(kitBytes);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  try {
    const r = await obtainAsync([
      "--from",
      `${origin}/kit/s178-consumer-repeat-kit.tgz`,
      "--expected-sha256",
      EXPECTED_SHA,
      "--expected-bytes",
      String(EXPECTED_BYTES),
      "--dest",
      dest,
      "--extract-dir",
      extractDir,
    ]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const body = parseJson(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.extracted, true);
    assert.equal(body.executed, false);
    assert.equal(body.bytes, EXPECTED_BYTES);
    assert.equal(body.sha256, EXPECTED_SHA);
    assert.equal(statSize(dest), EXPECTED_BYTES);
    assert.equal(digestFile(dest), EXPECTED_SHA);
    assert.equal(existsSync(join(extractDir, "s178-consumer-repeat-kit/bin/s178-cli.mjs")), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function statSize(path) {
  return readFileSync(path).length;
}

test("fresh extract of the committed archive: two callers, repeat, malformed, no overwrite", { timeout: 120_000 }, () => {
  const work = mkdtempSync(join(tmpdir(), "s227-fresh-"));
  const dest = join(work, "s178-consumer-repeat-kit.tgz");
  const extractDir = join(work, "extract");
  const obtained = obtain([
    "--from",
    ARCHIVE,
    "--expected-sha256",
    EXPECTED_SHA,
    "--expected-bytes",
    String(EXPECTED_BYTES),
    "--dest",
    dest,
    "--extract-dir",
    extractDir,
  ]);
  assert.equal(obtained.status, 0, obtained.stderr || obtained.stdout);
  const obtainedBody = parseJson(obtained.stdout);
  assert.equal(obtainedBody.ok, true);
  assert.equal(obtainedBody.extracted, true);
  assert.equal(obtainedBody.executed, false);

  const kitRoot = join(extractDir, "s178-consumer-repeat-kit");
  assert.equal(existsSync(join(kitRoot, "bin/s178-cli.mjs")), true);
  assert.equal(existsSync(join(kitRoot, "CONSUMER-PROVENANCE.json")), true);

  const callers = join(work, "callers");
  mkdirSync(callers);
  const callerA = join(callers, "caller-a.json");
  const callerB = join(callers, "caller-b.json");
  const callerPartial = join(callers, "caller-partial.json");
  const callerReconciled = join(callers, "caller-reconciled.json");
  const callerMalformed = join(callers, "caller-malformed.json");
  const callerGarbage = join(callers, "caller-garbage.json");
  copyFileSync(join(kitRoot, "vendor/consumer-jobs-07/fixtures/positive.json"), callerA);
  copyFileSync(
    join(kitRoot, "vendor/s137-consumer-evidence-jobs/fixtures/synthetic/release-brief/cases/conflict-sha-mismatch.json"),
    callerB,
  );
  copyFileSync(
    join(kitRoot, "vendor/s137-consumer-evidence-jobs/fixtures/synthetic/release-brief/cases/partial-announced-only.json"),
    callerPartial,
  );
  copyFileSync(
    join(kitRoot, "vendor/s137-consumer-evidence-jobs/fixtures/synthetic/release-brief/cases/positive-aligned.json"),
    callerReconciled,
  );
  copyFileSync(join(kitRoot, "vendor/consumer-jobs-07/fixtures/negative-malformed.json"), callerMalformed);
  writeFileSync(callerGarbage, "not json\n");

  const hashA = digestFile(callerA);
  const hashB = digestFile(callerB);
  const hashPartial = digestFile(callerPartial);
  const hashReconciled = digestFile(callerReconciled);
  const hashMalformed = digestFile(callerMalformed);
  const hashGarbage = digestFile(callerGarbage);

  const labeled = runCli(kitRoot, ["run", "07", "--clock", CLOCK]);
  assert.equal(labeled.status, 0, labeled.stderr || labeled.stdout);
  const labeledBody = parseJson(labeled.stdout);
  assert.equal(labeledBody.ok, true);
  assert.equal(labeledBody.decision, "pass");
  assert.match(String(labeledBody.sources?.[0]?.path || ""), /vendor\/consumer-jobs-07\/fixtures\/positive\.json$/);

  const runA = runCli(kitRoot, ["run", "07", "--in", callerA, "--clock", CLOCK]);
  assert.equal(runA.status, 0, runA.stderr || runA.stdout);
  const bodyA = parseJson(runA.stdout);
  assert.equal(bodyA.ok, true);
  assert.equal(bodyA.decision, "pass");
  assert.equal(bodyA.artifactId, "procurement-brief");
  assert.equal(bodyA.payment?.attempted, false);

  const runB = runCli(kitRoot, ["run", "release-brief", "--in", callerB, "--clock", CLOCK]);
  assert.equal(runB.status, 0, runB.stderr || runB.stdout);
  const bodyB = parseJson(runB.stdout);
  assert.equal(bodyB.ok, true);
  assert.equal(bodyB.decision, "conflict");
  assert.equal(bodyB.artifactId, "release-brief");
  assert.ok(bodyB.repeatInput);
  assert.equal(bodyB.repeatInput.priorDecision, "conflict");

  const runPartial = runCli(kitRoot, ["run", "release-brief", "--in", callerPartial, "--clock", CLOCK]);
  assert.equal(runPartial.status, 0, runPartial.stderr || runPartial.stdout);
  const bodyPartial = parseJson(runPartial.stdout);
  assert.equal(bodyPartial.ok, true);
  assert.equal(bodyPartial.decision, "partial");
  const repeatNote = join(callers, "repeat-note.json");
  writeFileSync(repeatNote, `${JSON.stringify(bodyPartial.repeatInput, null, 2)}\n`);
  assert.equal(existsSync(repeatNote), true);
  assert.notEqual(repeatNote, callerPartial);

  const runChanged = runCli(kitRoot, ["run", "release-brief", "--in", callerReconciled, "--clock", CLOCK]);
  assert.equal(runChanged.status, 0, runChanged.stderr || runChanged.stdout);
  const bodyChanged = parseJson(runChanged.stdout);
  assert.equal(bodyChanged.ok, true);
  assert.equal(bodyChanged.decision, "pass");
  assert.notEqual(bodyChanged.decision, bodyPartial.decision);

  const runMalformed = runCli(kitRoot, ["run", "07", "--in", callerMalformed, "--clock", CLOCK]);
  assert.equal(runMalformed.status, 0, runMalformed.stderr || runMalformed.stdout);
  const bodyMalformed = parseJson(runMalformed.stdout);
  assert.equal(bodyMalformed.ok, true);
  assert.equal(bodyMalformed.decision, "fail");

  const runGarbage = runCli(kitRoot, ["run", "release-brief", "--in", callerGarbage, "--clock", CLOCK]);
  assert.equal(runGarbage.status, 1, runGarbage.stderr || runGarbage.stdout);
  const bodyGarbage = parseJson(runGarbage.stdout);
  assert.equal(bodyGarbage.ok, false);
  assert.equal(bodyGarbage.decision, "invalid");
  assert.equal(bodyGarbage.error?.code, "invalid_json");

  assert.equal(digestFile(callerA), hashA);
  assert.equal(digestFile(callerB), hashB);
  assert.equal(digestFile(callerPartial), hashPartial);
  assert.equal(digestFile(callerReconciled), hashReconciled);
  assert.equal(digestFile(callerMalformed), hashMalformed);
  assert.equal(digestFile(callerGarbage), hashGarbage);
});
