import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  USEFUL_JOBS_ARCHIVE,
  USEFUL_JOBS_ARCHIVE_BYTES,
  USEFUL_JOBS_ARCHIVE_SHA256,
  USEFUL_JOBS_ROOT,
} from "../../../client/src/data/machineEntry.mjs";
import { ensureIndependentInputs } from "../lib/independent-inputs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const publicArchive = join(root, "client/public", USEFUL_JOBS_ARCHIVE.replace(/^\//, ""));

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function extractOutside() {
  const outside = mkdtempSync(join(tmpdir(), "uj-130-life-"));
  copyFileSync(publicArchive, join(outside, `${USEFUL_JOBS_ROOT}.tar.gz`));
  const tar = spawnSync("tar", ["-xzf", join(outside, `${USEFUL_JOBS_ROOT}.tar.gz`), "-C", outside], {
    encoding: "utf8",
  });
  assert.equal(tar.status, 0, tar.stderr);
  const kit = join(outside, USEFUL_JOBS_ROOT);
  assert.equal(kit.startsWith(root), false);
  return { outside, kit };
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function runCli(kit, args, { timeoutMs = 30_000, env = process.env } = {}) {
  return spawnSync(process.execPath, [join(kit, "bin/useful-jobs.mjs"), ...args], {
    encoding: "utf8",
    cwd: kit,
    timeout: timeoutMs,
    env,
    killSignal: "SIGTERM",
  });
}

function stdoutJson(run) {
  const text = String(run.stdout || "").trim();
  assert.ok(text, `empty stdout; stderr=${run.stderr}`);
  return JSON.parse(text);
}

test("1.4.0 archive identity is current and 1.3.0/1.2.0 are unchanged", () => {
  const buf = readFileSync(publicArchive);
  assert.equal(buf.length, USEFUL_JOBS_ARCHIVE_BYTES);
  assert.equal(sha256(buf), USEFUL_JOBS_ARCHIVE_SHA256);
  assert.equal(USEFUL_JOBS_ROOT, "useful-jobs-1.4.0");
  const prev13 = readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.3.0.tar.gz"));
  assert.equal(prev13.length, 2574904);
  assert.equal(sha256(prev13), "bc4db0ec83109852b8fdbd542d10d515c0053a30dd9b93836c9ad7c738510b6c");
  const prev12 = readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz"));
  assert.equal(prev12.length, 2579117);
  assert.equal(sha256(prev12), "dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb");
});

test("cold 1.4.0 lockfile positive and HTML refusal", () => {
  const { outside, kit } = extractOutside();
  try {
    const fx = ensureIndependentInputs(join(outside, "independent-inputs"));
    const ok = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      fx.lock.before,
      "--after",
      fx.lock.afterChange,
      "--out-dir",
      join(outside, "out-lock"),
    ]);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    const body = JSON.parse(ok.stdout);
    assert.equal(body.ok, true);
    assert.notEqual(body.purchaseAuthority, true);
    const refuse = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      fx.lock.html,
      "--after",
      fx.lock.afterChange,
      "--out-dir",
      join(outside, "out-html"),
    ]);
    assert.notEqual(refuse.status, 0);
    assert.match(refuse.stdout + refuse.stderr, /html-input/i);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("public CLI timeout kills owned hang children", async () => {
  const { outside, kit } = extractOutside();
  const pidFile = join(outside, "hang.pid");
  try {
    const bin = join(kit, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs");
    writeFileSync(
      bin,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
if (process.env.D16_FINAL_PIDFILE) writeFileSync(process.env.D16_FINAL_PIDFILE, \`\${process.pid}\\n\`);
setInterval(() => {}, 1 << 30);
`,
    );
    chmodSync(bin, 0o755);
    const fx = ensureIndependentInputs(join(outside, "independent-inputs"));
    const child = spawn(
      process.execPath,
      [
        join(kit, "bin/useful-jobs.mjs"),
        "run",
        "lockfile-pin-delta",
        "--before",
        fx.lock.before,
        "--after",
        fx.lock.afterChange,
        "--out-dir",
        join(outside, "out-hang"),
      ],
      {
        cwd: kit,
        env: { ...process.env, D16_FINAL_PIDFILE: pidFile },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await new Promise((r) => setTimeout(r, 400));
    const hangPid = existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
    assert.equal(Number.isInteger(hangPid), true, "hang fixture did not write a pid");
    child.kill("SIGTERM");
    await new Promise((resolveWait) => child.once("close", resolveWait));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(pidAlive(child.pid), false);
    assert.equal(pidAlive(hangPid), false, "owned hang child survived SIGTERM");
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("lockfile crash after json does not mix this-run json with previous md in caller out-dir", () => {
  const { outside, kit } = extractOutside();
  try {
    const bin = join(kit, "engines/lockfile-pin-delta/bin/lockfile-delta.mjs");
    writeFileSync(
      bin,
      `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const i = process.argv.indexOf("--out-dir");
const outDir = i >= 0 ? process.argv[i + 1] : null;
if (!outDir) process.exit(2);
writeFileSync(join(outDir, "pin-delta.json"), JSON.stringify({ ok: true, thisRun: true }) + "\\n");
process.exit(1);
`,
    );
    chmodSync(bin, 0o755);
    const fx = ensureIndependentInputs(join(outside, "independent-inputs"));
    const out = join(outside, "out-partial");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "pin-delta.json"), '{"stale":true}\n');
    writeFileSync(join(out, "pin-delta.md"), "ORPHAN-MD-PREVIOUS-RUN\n");
    const r = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      fx.lock.before,
      "--after",
      fx.lock.afterChange,
      "--out-dir",
      out,
    ]);
    assert.notEqual(r.status, 0);
    const json = JSON.parse(readFileSync(join(out, "pin-delta.json"), "utf8"));
    const md = readFileSync(join(out, "pin-delta.md"), "utf8");
    assert.equal(json.thisRun, undefined);
    assert.equal(json.stale, true);
    assert.equal(md.includes("ORPHAN-MD-PREVIOUS-RUN"), true);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("cold 1.4.0: ten advertised jobs independent positive and refusal smokes", () => {
  const { outside, kit } = extractOutside();
  try {
    const fx = ensureIndependentInputs(join(outside, "independent-inputs"));
    function expectOk(jobId, args, out, analysis) {
      const run = runCli(kit, ["run", jobId, ...args, "--out-dir", out]);
      assert.equal(run.status, 0, `${jobId}: ${run.stderr}\n${run.stdout}`);
      const body = stdoutJson(run);
      assert.equal(body.ok, true, jobId);
      assert.notEqual(body.purchaseAuthority, true);
      assert.notEqual(body.sold, true);
      if (analysis) {
        const blob = `${body.status || ""} ${body.report?.verdict || ""} ${JSON.stringify(body)}`;
        assert.match(blob, analysis);
      }
      return body;
    }
    function expectRefuse(jobId, args, pattern) {
      const run = runCli(kit, ["run", jobId, ...args]);
      assert.notEqual(run.status, 0, jobId);
      assert.match(run.stdout + run.stderr, pattern);
    }
    expectOk("lockfile-pin-delta", ["--before", fx.lock.before, "--after", fx.lock.afterChange], join(outside, "out-lock-change"), /actionable/i);
    expectRefuse("lockfile-pin-delta", ["--before", fx.lock.html, "--after", fx.lock.afterChange, "--out-dir", join(outside, "out-lock-html")], /html-input/i);
    expectOk("json-schema-webhook-drift", ["--before", fx.schema.before, "--after", fx.schema.afterChange, "--used", fx.schema.used], join(outside, "out-schema-change"), /actionable/i);
    expectRefuse("json-schema-webhook-drift", ["--before", fx.schema.openapi, "--after", fx.schema.openapi, "--used", fx.schema.used, "--out-dir", join(outside, "out-schema-openapi")], /not-this-job-openapi/i);
    expectOk("route-table-diff", ["--before", fx.route.before, "--after", fx.route.afterChange], join(outside, "out-route-change"));
    const home = runCli(kit, ["run", "route-table-diff", "--before", fx.route.before, "--after", fx.route.afterChange, "--out-dir", join(outside, "out-route-home"), "--rewrite-homepage"]);
    assert.notEqual(home.status, 0);
    assert.match(home.stdout + home.stderr, /homepage_rewrite/i);
    expectOk("page-change-offline-job", ["--job", fx.page.jobChange], join(outside, "out-page-change"), /changed/i);
    const pageExample = runCli(kit, ["run", "page-change-offline-job", "--example", "--out-dir", join(outside, "out-page-example")]);
    assert.notEqual(pageExample.status, 0);
    assert.match(pageExample.stdout + pageExample.stderr, /sample_as_delivered_watch/i);
    expectOk("api-upgrade-brief", ["--before", fx.openapi.before, "--after", fx.openapi.afterChange, "--used", fx.openapi.used], join(outside, "out-openapi-change"));
    expectRefuse("api-upgrade-brief", ["--before", fx.openapi.before, "--after", fx.openapi.afterChange, "--out-dir", join(outside, "out-openapi-missing")], /missing-required-inputs/i);
    expectOk("vendor-budget-impact", ["--before", fx.pricing.before, "--after", fx.pricing.afterChange], join(outside, "out-budget-change"), /actionable/i);
    expectRefuse("vendor-budget-impact", ["--before", fx.pricing.before, "--out-dir", join(outside, "out-budget-missing")], /missing-required-inputs/i);
    expectOk("feed-agenda", ["--before", fx.feed.before, "--after", fx.feed.afterChange], join(outside, "out-feed-change"));
    expectRefuse("feed-agenda", ["--before", fx.feed.before, "--out-dir", join(outside, "out-feed-missing")], /missing-required-inputs/i);
    expectOk("evidence-ci-annotation", ["--input", fx.evidence.pass], join(outside, "out-evidence-pass"));
    expectRefuse("evidence-ci-annotation", ["--input", fx.evidence.foreign, "--out-dir", join(outside, "out-evidence-foreign")], /refus|schema|foreign|unrecognized|invalid/i);
    const listingChange = expectOk("listing-repair-packet", ["--input", fx.listing.change], join(outside, "out-listing-change"));
    assert.match(String(listingChange.status), /actionable|partial|informational/i);
    const listingPartial = expectOk("listing-repair-packet", ["--input", fx.listing.partial], join(outside, "out-listing-partial"), /partial/i);
    assert.equal(listingPartial.status, "partial");
    expectRefuse("listing-repair-packet", ["--out-dir", join(outside, "out-listing-missing")], /missing-required-inputs/i);
    expectOk("repeat-job-record", ["--next-run", fx.repeat.nextRun, "--input-root", fx.repeat.filesDir], join(outside, "out-repeat-ok"), /actionable/i);
    expectRefuse("repeat-job-record", ["--next-run", fx.repeat.nextRunMismatch, "--out-dir", join(outside, "out-repeat-mismatch")], /input-digest-mismatch/i);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
