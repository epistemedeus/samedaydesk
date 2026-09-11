import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ARCHIVE, JOB_IDS, kitPin, parseJson, py, pyAsync, serveBytes } from "./helpers.mjs";

test("journey: example SAMPLE then caller files copied from samples/pricing/a", () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-journey-"));
  try {
    const exampleOut = join(work, "example-out");
    const example = py(
      ["run", "vendor-budget-impact", "--example", "--out-dir", exampleOut],
      { cwd: work },
    );
    assert.equal(example.status, 0, example.stderr + example.stdout);
    const exampleBody = parseJson(example);
    assert.equal(exampleBody.ok, true);
    assert.equal(exampleBody.job, "vendor-budget-impact");
    assert.equal(exampleBody.sample, true);
    assert.equal(exampleBody.label, "SAMPLE");
    assert.equal(exampleBody.sold, false);
    assert.equal(exampleBody.purchaseAuthority, false);
    assert.equal(exampleBody.kind, "fixture");
    assert.equal(exampleBody.acceptanceClass, "fixture");
    assert.equal(exampleBody.source, "committed-file");
    assert.equal(existsSync(join(exampleOut, "budget-impact.json")), true);
    assert.equal(existsSync(join(exampleOut, "budget-impact.md")), true);
    assert.equal(exampleBody.outputsExist, true);
    const artifact = JSON.parse(readFileSync(join(exampleOut, "budget-impact.json"), "utf8"));
    assert.equal(artifact.caller.exampleMode, true);
    assert.equal(artifact.caller.sampleLabel, "explicit-example");
    assert.equal(artifact.purchaseAuthority, false);
    assert.equal(artifact.notMarketFact, true);

    const acquire = parseJson(py(["acquire"]));
    assert.equal(acquire.ok, true);
    const kitRoot = acquire.kitRoot;
    assert.equal(existsSync(join(kitRoot, "bin/useful-jobs.mjs")), true);
    const before = join(work, "before.json");
    const after = join(work, "after.json");
    copyFileSync(join(kitRoot, "samples/pricing/a/before.json"), before);
    copyFileSync(join(kitRoot, "samples/pricing/a/after.json"), after);
    const callerOut = join(work, "caller-out");
    const caller = py(
      [
        "run",
        "vendor-budget-impact",
        "--before",
        before,
        "--after",
        after,
        "--out-dir",
        callerOut,
      ],
      { cwd: work },
    );
    assert.equal(caller.status, 0, caller.stderr + caller.stdout);
    const callerBody = parseJson(caller);
    assert.equal(callerBody.ok, true);
    assert.equal(callerBody.sample, false);
    assert.equal(callerBody.label, "caller-input");
    assert.equal(callerBody.sold, false);
    assert.equal(callerBody.kind, "local-runtime");
    assert.equal(existsSync(join(callerOut, "budget-impact.json")), true);
    assert.equal(existsSync(join(callerOut, "budget-impact.md")), true);
    const callerArt = JSON.parse(readFileSync(join(callerOut, "budget-impact.json"), "utf8"));
    assert.equal(callerArt.caller.exampleMode, false);
    assert.equal(callerArt.caller.sampleLabel, "caller-input");
    assert.notEqual(exampleBody.engine.digest, callerBody.engine.digest);
    assert.ok(JOB_IDS.includes("vendor-budget-impact"));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("local HTTP origin with matching committed bytes acquires (not live public GET)", async () => {
  const work = mkdtempSync(join(tmpdir(), "uj-py-origin-ok-"));
  const good = readFileSync(ARCHIVE);
  const srv = await serveBytes(good);
  try {
    const r = await pyAsync(["acquire", "--origin", srv.origin], {
      cwd: work,
      env: { TMPDIR: work },
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = parseJson(r);
    assert.equal(body.ok, true);
    assert.equal(body.source, "origin-http");
    assert.equal(body.sha256, kitPin().sha256);
    assert.equal(existsSync(join(body.kitRoot, "bin/useful-jobs.mjs")), true);
    assert.equal(body.acceptanceClass, "local-runtime");
    assert.equal(body.sold, false);
  } finally {
    await srv.stop();
    rmSync(work, { recursive: true, force: true });
  }
});
