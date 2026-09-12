import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const PIN_110_SHA = "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534";
const PIN_110_BYTES = 2577606;
const publicArchive = join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz");
const kitArchive = join(root, "client/public/kit/useful-jobs-1.1.0.tar.gz");
const ROOT_NAME = "useful-jobs-1.1.0";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function extractOutside() {
  const outside = mkdtempSync(join(tmpdir(), "uj-110-cold-"));
  copyFileSync(publicArchive, join(outside, `${ROOT_NAME}.tar.gz`));
  const tar = spawnSync("tar", ["-xzf", join(outside, `${ROOT_NAME}.tar.gz`), "-C", outside], {
    encoding: "utf8",
  });
  assert.equal(tar.status, 0, tar.stderr);
  const kit = join(outside, ROOT_NAME);
  assert.equal(kit.startsWith(root), false);
  assert.equal(existsSync(join(kit, "bin/useful-jobs.mjs")), true);
  return { outside, kit };
}

function runCli(kit, args) {
  return spawnSync(process.execPath, [join(kit, "bin/useful-jobs.mjs"), ...args], {
    encoding: "utf8",
    cwd: kit,
  });
}

test("1.1.0 archive bytes stay pinned and are not the current catalog", () => {
  const buf = readFileSync(publicArchive);
  assert.equal(buf.length, PIN_110_BYTES);
  assert.equal(sha256(buf), PIN_110_SHA);
  assert.equal(sha256(readFileSync(kitArchive)), PIN_110_SHA);
  const pin = JSON.parse(
    readFileSync(join(root, "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.sha256.json"), "utf8"),
  );
  assert.equal(pin.sha256, PIN_110_SHA);
  assert.equal(pin.bytes, PIN_110_BYTES);
  const liveCatalog = JSON.parse(
    readFileSync(join(root, "client/public/for-agents/useful-jobs/catalog.json"), "utf8"),
  );
  assert.notEqual(liveCatalog.version, "1.1.0");
});

test("cold extract 1.1.0: H04 public inputs for all four new engines", () => {
  const { outside, kit } = extractOutside();
  try {
    const catalog = JSON.parse(readFileSync(join(kit, "catalog.json"), "utf8"));
    assert.equal(catalog.version, "1.1.0");
    assert.equal(catalog.jobs.length, 10);
    assert.equal(catalog.jobs[0].id, "lockfile-pin-delta");

    const lock = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
      "--after",
      join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      join(outside, "out-h04-lock"),
    ]);
    assert.equal(lock.status, 0, lock.stderr + lock.stdout);
    const lockBody = JSON.parse(lock.stdout);
    assert.equal(lockBody.ok, true);
    assert.equal(existsSync(join(outside, "out-h04-lock/pin-delta.json")), true);
    assert.equal(existsSync(join(outside, "out-h04-lock/pin-delta.md")), true);

    const schema = runCli(kit, [
      "run",
      "json-schema-webhook-drift",
      "--before",
      join(kit, "samples/schema/h04-schema-01/before.json"),
      "--after",
      join(kit, "samples/schema/h04-schema-01/after.json"),
      "--used",
      join(kit, "samples/schema/h04-schema-01/used.json"),
      "--out-dir",
      join(outside, "out-h04-schema"),
    ]);
    assert.equal(schema.status, 0, schema.stderr + schema.stdout);
    assert.equal(JSON.parse(schema.stdout).ok, true);
    assert.equal(existsSync(join(outside, "out-h04-schema/drift-brief.json")), true);

    const route = runCli(kit, [
      "run",
      "route-table-diff",
      "--before",
      join(kit, "samples/routes/h04-route-01/before.json"),
      "--after",
      join(kit, "samples/routes/h04-route-01/after.json"),
      "--out-dir",
      join(outside, "out-h04-route"),
    ]);
    assert.equal(route.status, 0, route.stderr + route.stdout);
    assert.equal(JSON.parse(route.stdout).ok, true);
    assert.equal(existsSync(join(outside, "out-h04-route/route-diff.md")), true);

    const page = runCli(kit, [
      "run",
      "page-change-offline-job",
      "--job",
      join(kit, "samples/page/h04-page-01/job.json"),
      "--out-dir",
      join(outside, "out-h04-page"),
    ]);
    assert.equal(page.status, 0, page.stderr + page.stdout);
    assert.equal(JSON.parse(page.stdout).ok, true);
    assert.equal(existsSync(join(outside, "out-h04-page/page-change.json")), true);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("cold extract 1.1.0: malformed JSON, HTML lockfile, missing inputs, missing advertised output", () => {
  const { outside, kit } = extractOutside();
  try {
    const bad = join(outside, "malformed.json");
    writeFileSync(bad, "{ not json");
    const malformed = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      bad,
      "--after",
      join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      join(outside, "out-malformed"),
    ]);
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stdout + malformed.stderr, /json|parse|invalid/i);

    const html = join(outside, "not-a-lock.html");
    writeFileSync(html, "<html><body>not a lockfile</body></html>");
    const htmlRun = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      html,
      "--after",
      join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      join(outside, "out-html"),
    ]);
    assert.notEqual(htmlRun.status, 0);
    assert.match(htmlRun.stdout + htmlRun.stderr, /html-input/);

    const missing = runCli(kit, ["run", "lockfile-pin-delta", "--before", html]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stdout + missing.stderr, /missing-required-inputs|required/i);

    const ok = runCli(kit, [
      "run",
      "lockfile-pin-delta",
      "--before",
      join(kit, "samples/lockfile/h04-pub-lock-01/before.json"),
      "--after",
      join(kit, "samples/lockfile/h04-pub-lock-01/after.json"),
      "--out-dir",
      join(outside, "out-missing-md"),
    ]);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    unlinkSync(join(outside, "out-missing-md/pin-delta.md"));
    assert.equal(existsSync(join(outside, "out-missing-md/pin-delta.json")), true);
    assert.equal(existsSync(join(outside, "out-missing-md/pin-delta.md")), false);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
