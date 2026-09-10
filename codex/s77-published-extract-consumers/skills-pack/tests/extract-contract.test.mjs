#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(root, "fixtures", "extract-contract");

function interpretSingle(envelope) {
  const useful =
    envelope.ok === true &&
    envelope.sourceOk === true &&
    envelope.status === 200 &&
    envelope.error == null;
  return {
    ok: envelope.ok,
    sourceOk: envelope.sourceOk,
    status: envelope.status,
    useful_source: useful,
    requestedUrl: envelope.requestedUrl,
    finalUrl: envelope.finalUrl,
    url_equals_final: envelope.url === envelope.finalUrl,
    textTruncated: envelope.capture?.textTruncated === true,
    bodyTruncated: envelope.capture?.bodyTruncated === true,
    charset: envelope.capture?.charset,
    charsetSource: envelope.capture?.charsetSource,
    not_full_page:
      envelope.capture?.textTruncated === true ||
      envelope.capture?.bodyTruncated === true,
    error_code: envelope.error?.code ?? null,
    stale_rule: "ok_is_not_sourceOk",
  };
}

function interpretBatch(envelope) {
  return {
    ok: envelope.ok,
    partial: envelope.partial === true,
    do_not_autocharge_repair: envelope.partial === true,
    unknown_body_honest: (envelope.sources || []).some((s) => s.status === "unknown"),
  };
}

for (const name of fs.readdirSync(fixtureDir).filter((f) => f.endsWith(".json"))) {
  test(`fixture ${name}`, () => {
    const c = JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
    const got = Array.isArray(c.envelope.sources)
      ? interpretBatch(c.envelope)
      : interpretSingle(c.envelope);
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal(got[k], v, `${c.name}.${k}`);
    }
    if (!Array.isArray(c.envelope.sources)) {
      assert.equal(typeof c.envelope.ok, "boolean");
      assert.equal(typeof c.envelope.sourceOk, "boolean");
      for (const k of ["requestedUrl", "finalUrl", "capture"]) {
        assert.ok(k in c.envelope, k);
      }
      if (c.envelope.ok === true && c.envelope.sourceOk === false) {
        assert.equal(got.useful_source, false);
      }
    }
  });
}

test("catalog skill remains credential-free and non-spending", () => {
  const md = fs.readFileSync(
    path.join(root, "skills", "samedaydesk-machine-commerce", "SKILL.md"),
    "utf8",
  );
  assert.match(md, /non-spending|Do not access a wallet|credential-free|before payment/i);
  assert.doesNotMatch(md, /create a wallet|sign a transaction|retry payment/i);
  assert.match(md, /extract\/batch/);
  assert.match(md, /sourceOk/);
});

test("web-extract documents batch and sourceOk contract", () => {
  const md = fs.readFileSync(path.join(root, "skills", "web-extract", "SKILL.md"), "utf8");
  assert.match(md, /extract\/batch/);
  assert.match(md, /sourceOk/);
  assert.match(md, /requestedUrl/);
  assert.match(md, /finalUrl/);
  assert.match(md, /capture/);
  assert.match(md, /partial/);
  assert.match(md, /no-JS HTTP|without JavaScript|no-JS/i);
  assert.match(md, /GitHub REST|gh issue|full public issue/i);
  assert.doesNotMatch(md, /free extract route|unpaid extract success/i);
});
