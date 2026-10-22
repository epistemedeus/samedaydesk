import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ARCHIVE,
  assertNoPaymentStory,
  kitPin,
  parseJson,
  py,
  pyAsync,
  serveBytes,
} from "./helpers.mjs";

test("wrong sha256 refuses before extract or Node", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-digest-"));
  try {
    const bad = join(work, "useful-jobs-1.0.0.tar.gz");
    const buf = Buffer.from(readFileSync(ARCHIVE));
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;
    writeFileSync(bad, buf);
    assert.equal(buf.length, kitPin().bytes);

    const r = py(["acquire", "--archive", bad], { env: { TMPDIR: work } });
    assert.notEqual(r.status, 0);
    const body = parseJson(r);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "wrong-digest");
    assert.equal(body.extracted, false);
    assert.equal(body.executed, false);
    assert.equal(body.payment, false);
    const extracted = readdirSync(work).filter((n) => n.startsWith("useful-jobs."));
    for (const name of extracted) {
      assert.equal(existsSync(join(work, name, "useful-jobs-1.0.0", "bin/useful-jobs.mjs")), false);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("treating --example as sold is refused as sample-as-sale", () => {
  const r = py(["run", "vendor-budget-impact", "--example", "--sold"]);
  assert.notEqual(r.status, 0);
  const body = parseJson(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "sample-as-sale");
  assert.equal(body.sample, true);
  assert.equal(body.label, "SAMPLE");
  assert.equal(body.sold, false);
  assert.equal(body.purchaseAuthority, false);
  assert.match(body.error, /SAMPLE|--example|fixture/i);
  assertNoPaymentStory(body);
  assert.equal(body.extracted, false);
  assert.equal(body.executed, false);
});

test("missing node binary is labelled missing-node, not a payment error", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-node-"));
  try {
    const bin = join(work, "bin");
    mkdirSync(bin);
    const r = py(["run", "vendor-budget-impact", "--example", "--out-dir", join(work, "out")], {
      env: { PATH: bin, USEFUL_JOBS_NODE: "" },
    });
    assert.notEqual(r.status, 0);
    const body = parseJson(r);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "missing-node");
    assert.equal(body.missing, "node");
    assert.equal(body.label, "missing-node-binary");
    assert.match(body.error, /node/i);
    assert.match(body.error, /binary|PATH|not found/i);
    assertNoPaymentStory(body);
    assert.doesNotMatch(body.code, /payment|402|sold/i);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("empty engine job list is catalog-mismatch, not a constant catalog", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-empty-list-"));
  try {
    const fake = join(work, "empty-list-node");
    writeFileSync(
      fake,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ ok: true, jobs: [] }) + "\\n");
`,
    );
    chmodSync(fake, 0o755);
    const r = py(["list"], { env: { USEFUL_JOBS_NODE: fake } });
    assert.notEqual(r.status, 0);
    const body = parseJson(r);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "catalog-mismatch");
    assert.deepEqual(body.listed, []);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("optional --origin with mismatched bytes refuses before extract", async () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-origin-bad-"));
  const pin = kitPin();
  const wrong = Buffer.alloc(pin.bytes, 0x5a);
  const srv = await serveBytes(wrong);
  try {
    const r = await pyAsync(["acquire", "--origin", srv.origin], {
      env: { TMPDIR: work },
    });
    assert.notEqual(r.status, 0);
    const body = parseJson(r);
    assert.equal(body.ok, false);
    assert.equal(body.refused, true);
    assert.equal(body.code, "wrong-digest");
    assert.equal(body.extracted, false);
    assert.equal(body.executed, false);
    const leftover = readdirSync(work).filter((n) => n.startsWith("useful-jobs."));
    assert.equal(leftover.length, 0);
  } finally {
    await srv.stop();
    rmSync(work, { recursive: true, force: true });
  }
});
