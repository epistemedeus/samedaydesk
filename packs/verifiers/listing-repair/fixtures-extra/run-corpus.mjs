#!/usr/bin/env node
/**
 * W0-X76 fixtures-extra corpus runner.
 * Invokes sibling ../bin/listing-repair-verifier.mjs over every MANIFEST case.
 * Reads only fixtures-extra/** (+ sibling verifier). Never publishes.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);
const bin = join(pack, "bin/listing-repair-verifier.mjs");
const manifest = JSON.parse(readFileSync(join(here, "MANIFEST.json"), "utf8"));

function runCase(c) {
  const args = ["verify", "--packet", c.packet];
  if (c.source) args.push("--source", c.source);
  const r = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: pack,
  });
  let body;
  try {
    body = JSON.parse(String(r.stdout || "").trim() || "{}");
  } catch {
    body = { ok: false, parseError: true, stdout: r.stdout, stderr: r.stderr };
  }
  return { status: r.status ?? 1, body, stderr: r.stderr };
}

let failed = 0;
const rows = [];

console.log(`fixtures-extra corpus: ${manifest.cases.length} cases`);
console.log(`verifier: ${bin}`);
console.log("---");

for (const c of manifest.cases) {
  // Guard: never accept publish/purchaseAuthority as ok
  if (c.expect === "ok") {
    const pkt = JSON.parse(readFileSync(join(pack, c.packet), "utf8"));
    assert.notEqual(pkt.publish, true, `${c.id}: ok case must not set publish true`);
    assert.notEqual(pkt.purchaseAuthority, true, `${c.id}: ok case must not set purchaseAuthority true`);
  }

  const { status, body } = runCase(c);
  const okExit = status === c.expectedExit;
  const okFlag =
    c.expect === "ok" ? body.ok === true : body.ok === false;
  const pass = okExit && okFlag;

  // Hard invariant from oracle
  if (body.checks) assert.equal(body.checks.publish, false);
  if (body.provenance) assert.equal(body.provenance.purchaseAuthority, false);

  const line = {
    id: c.id,
    expect: c.expect,
    expectedExit: c.expectedExit,
    status,
    ok: body.ok,
    reasons: body.reasons || [],
    pass,
  };
  rows.push(line);
  console.log(
    `${pass ? "PASS" : "FAIL"} ${c.id} exit=${status} expected=${c.expectedExit} ok=${body.ok} reasons=${JSON.stringify(body.reasons || [])}`,
  );
  if (!pass) failed += 1;
}

console.log("---");
console.log(
  JSON.stringify(
    {
      ok: failed === 0,
      failed,
      total: rows.length,
      counts: manifest.counts,
      rows,
    },
    null,
    2,
  ),
);

process.exitCode = failed === 0 ? 0 : 1;
