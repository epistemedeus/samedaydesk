import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARCHIVE,
  CATALOG,
  JOB_IDS,
  importClient,
  kitPin,
  parseJson,
  py,
} from "./helpers.mjs";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

test("importable JOB_IDS and hash terms bind the current kit and archive", () => {
  const kit = kitPin();
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const buf = readFileSync(ARCHIVE);
  assert.equal(buf.length, kit.bytes);
  assert.equal(sha256(buf), kit.sha256);
  assert.equal(kit.purchaseAuthority, false);
  assert.deepEqual(kit.jobs, JOB_IDS);
  assert.deepEqual(
    catalog.jobs.map((j) => j.id),
    JOB_IDS,
  );

  const r = importClient(
    "from samedaydesk_useful_jobs import JOB_IDS, HASH_TERMS; import json; print(json.dumps({'jobs': list(JOB_IDS), 'sha256': HASH_TERMS.sha256, 'bytes': HASH_TERMS.bytes, 'purchaseAuthority': HASH_TERMS.purchase_authority}))",
  );
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.deepEqual(body.jobs, JOB_IDS);
  assert.equal(body.sha256, kit.sha256);
  assert.equal(body.bytes, kit.bytes);
  assert.equal(body.purchaseAuthority, false);
});

test("catalog and version commands expose the published job ids", () => {
  const catalog = parseJson(py(["catalog"]));
  assert.equal(catalog.ok, true);
  assert.deepEqual(catalog.jobs, JOB_IDS);
  assert.equal(catalog.purchaseAuthority, false);
  assert.deepEqual(catalog.outputs["vendor-budget-impact"], [
    "budget-impact.json",
    "budget-impact.md",
  ]);

  const version = parseJson(py(["version"]));
  assert.equal(version.ok, true);
  assert.equal(version.sha256, kitPin().sha256);
  assert.equal(version.bytes, kitPin().bytes);
});

test("list and help run via subprocess Node after verifying the committed tarball", () => {
  const list = py(["list"]);
  assert.equal(list.status, 0, list.stderr + list.stdout);
  const listBody = parseJson(list);
  assert.equal(listBody.ok, true);
  assert.equal(listBody.command, "list");
  assert.deepEqual(listBody.jobs, JOB_IDS);
  assert.equal(listBody.source, "committed-file");
  assert.equal(listBody.sold, false);
  for (const id of JOB_IDS) {
    assert.equal(listBody.jobs.includes(id), true);
  }

  const help = py(["help", "vendor-budget-impact"]);
  assert.equal(help.status, 0, help.stderr + help.stdout);
  const helpBody = parseJson(help);
  assert.equal(helpBody.ok, true);
  assert.match(helpBody.engineStdout, /vendor-budget-impact/);
  assert.match(helpBody.engineStdout, /--before/);
  assert.match(helpBody.engineStdout, /--after/);
  assert.match(helpBody.engineStdout, /--example/);
});

test("unknown job is refused before claiming a sale", () => {
  const r = py(["run", "not-a-real-job", "--example"]);
  assert.notEqual(r.status, 0);
  const body = parseJson(r);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "unknown-job");
  assert.equal(body.sold, false);
  assert.equal(body.payment, false);
});
