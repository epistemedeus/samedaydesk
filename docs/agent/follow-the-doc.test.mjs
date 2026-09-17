import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  discoveryAuthorityProblems,
  expectSeededRejected,
  resolvePublicFile,
  runFollowTheDoc,
  servePublic,
} from "./follow-the-doc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const runner = join(here, "follow-the-doc.mjs");
const EXPECTED_SHA =
  "e2e9b44e4d7318ac55052953318f05e53dbc121ab02e2762e34c919ac5469dec";
const EXPECTED_BYTES = 5255824;

function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || repoRoot,
      env: { ...process.env, ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolveP({ status: status ?? 1, stdout, stderr }));
  });
}

test("docs tree exists under docs/agent", () => {
  for (const name of [
    "README.md",
    "tutorial.md",
    "how-to.md",
    "reference.md",
    "explanation.md",
    "follow-the-doc.mjs",
    "fixtures/seeded-failures.json",
  ]) {
    assert.equal(existsSync(join(here, name)), true, name);
  }
});

test("committed archive matches the documented pin", () => {
  const archive = join(
    repoRoot,
    "client/public/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
  );
  const buf = readFileSync(archive);
  assert.equal(buf.length, EXPECTED_BYTES);
  assert.equal(createHash("sha256").update(buf).digest("hex"), EXPECTED_SHA);
});

test("full cold follow-the-doc run succeeds and rejects seeded failures", async () => {
  const result = await runFollowTheDoc({ seededFailure: "all" });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.paid, false);
  assert.equal(result.liveMerchantExtract, false);
  assert.equal(result.pins.sha256, EXPECTED_SHA);
  assert.equal(result.pins.bytes, EXPECTED_BYTES);
  assert.equal(result.tutorial.exitCode, 0);
  assert.equal(result.tutorial.kitOk, true);
  assert.equal(result.tutorial.exampleOk, true);
  assert.equal(result.tutorial.repeatChanged, true);
  assert.equal(result.tutorial.pageChangeOk, true);
  const byId = Object.fromEntries(result.seededFailures.map((s) => [s.id, s]));
  assert.equal(byId["digest-mismatch"].rejected, true);
  assert.notEqual(byId["digest-mismatch"].exitCode, 0);
  assert.equal(byId["missing-required-inputs"].rejected, true);
  assert.notEqual(byId["missing-required-inputs"].exitCode, 0);
  assert.equal(byId["example-on-page-change"].rejected, true);
  assert.notEqual(byId["example-on-page-change"].exitCode, 0);
});

test("CLI --seeded-failure digest-mismatch is rejected (exit 0 from runner)", async () => {
  const r = await spawnAsync(process.execPath, [
    runner,
    "--seeded-failure",
    "digest-mismatch",
    "--json",
  ]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.seededFailures[0].id, "digest-mismatch");
  assert.equal(body.seededFailures[0].rejected, true);
  assert.equal(body.seededFailures[0].extracted, false);
});

test("CLI default follow-the-doc prints ok true", async () => {
  const r = await spawnAsync(process.execPath, [runner]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.surface, "useful-jobs");
  assert.equal(body.version, "1.4.7");
});

function rawGet(origin, path) {
  return new Promise((resolveP, reject) => {
    const u = new URL(origin);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path, method: "GET" },
      (res) => {
        const chunks = [];
        res.on("data", (c) => {
          chunks.push(c);
        });
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolveP({
            status: res.statusCode,
            body: buf.toString("utf8"),
            bytes: buf.length,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("resolvePublicFile refuses traversal, directories, and bad URIs", () => {
  const root = join(repoRoot, "client/public");
  const archiveRel = "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz";
  const good = resolvePublicFile(root, archiveRel);
  assert.equal(good.ok, true);
  assert.equal(good.file.endsWith("useful-jobs-1.4.7.tar.gz"), true);

  const dir = resolvePublicFile(root, "/");
  assert.equal(dir.ok, false);
  assert.equal(dir.status, 404);

  const nestedDir = resolvePublicFile(root, "/for-agents/");
  assert.equal(nestedDir.ok, false);
  assert.equal(nestedDir.status, 404);

  const escape = resolvePublicFile(
    root,
    "/for-agents/../../../docs/agent/follow-the-doc.mjs",
  );
  assert.equal(escape.ok, false);
  assert.equal(escape.status, 404);

  const abs = resolvePublicFile(root, "//etc/passwd");
  assert.equal(abs.ok, false);
  assert.equal(abs.status, 404);

  const bad = resolvePublicFile(root, "/%ZZ");
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
});

test("loopback server returns 404/400 instead of throwing on directory or bad URI", async () => {
  const srv = await servePublic({ poisonDigest: false });
  try {
    const root = await rawGet(srv.origin, "/");
    assert.equal(root.status, 404);
    const dir = await rawGet(srv.origin, "/for-agents/");
    assert.equal(dir.status, 404);
    const bad = await rawGet(srv.origin, "/%ZZ");
    assert.equal(bad.status, 400);
    const escape = await rawGet(
      srv.origin,
      "/for-agents/../../../docs/agent/follow-the-doc.mjs",
    );
    assert.equal(escape.status, 404);
    assert.equal(escape.body.includes("follow-the-doc"), false);
    const archive = await rawGet(
      srv.origin,
      "/for-agents/useful-jobs/useful-jobs-1.4.7.tar.gz",
    );
    assert.equal(archive.status, 200);
    assert.equal(archive.bytes, EXPECTED_BYTES);
  } finally {
    await srv.stop();
  }
});

test("purchaseAuthority true is rejected by the authority pin", () => {
  const discovery = JSON.parse(
    readFileSync(join(repoRoot, "client/public/discovery/useful-jobs.json"), "utf8"),
  );
  const kit = JSON.parse(
    readFileSync(join(repoRoot, "client/src/data/usefulJobsKit.json"), "utf8"),
  );
  assert.deepEqual(discoveryAuthorityProblems(discovery, kit), []);
  const forged = { ...discovery, purchaseAuthority: true };
  const problems = discoveryAuthorityProblems(forged, kit);
  assert.equal(problems.some((p) => p.includes("purchaseAuthority")), true);
});

test("seeded expect rejects a zero exit that the fixture forbids", () => {
  const fixture = JSON.parse(
    readFileSync(join(here, "fixtures/seeded-failures.json"), "utf8"),
  );
  const spec = fixture.failures.find((f) => f.id === "digest-mismatch");
  const accepted = expectSeededRejected(spec, { status: 0, stdout: "", stderr: "" }, {
    extracted: true,
    executed: true,
  });
  assert.equal(accepted, false);
  const refused = expectSeededRejected(
    spec,
    { status: 1, stdout: "", stderr: "sha256 deadbeef != pin\n" },
    { extracted: false, executed: false },
  );
  assert.equal(refused, true);
});

test("CLI unknown seeded-failure is refused without claiming ok", async () => {
  const r = await spawnAsync(process.execPath, [
    runner,
    "--seeded-failure",
    "not-a-real-id",
    "--json",
  ]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.code, "unknown-seeded-failure");
  assert.equal(body.tutorial, null);
});
