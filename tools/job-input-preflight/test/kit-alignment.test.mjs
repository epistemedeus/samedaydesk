import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DIGEST_RE, MAX_LOCAL_INPUT_BYTES } from "../lib/constants.mjs";
import { formatDigest } from "../lib/digest.mjs";
import { DEFAULT_ARCHIVE, DEFAULT_CATALOG, DEFAULT_KIT_JSON, FIXTURES } from "../lib/roots.mjs";
import { JOURNEY_ARGS, runCli, runCliAsync } from "./helpers.mjs";

const pin = JSON.parse(readFileSync(path.join(FIXTURES, "catalog-pin.json"), "utf8"));
const kit = JSON.parse(readFileSync(DEFAULT_KIT_JSON, "utf8"));

test("local-runtime: published archive bytes/sha256 match kit pin and catalog-pin", () => {
  const buf = readFileSync(DEFAULT_ARCHIVE);
  assert.equal(buf.length, kit.bytes);
  assert.equal(buf.length, pin.archive.bytes);
  assert.equal(createHash("sha256").update(buf).digest("hex"), kit.sha256);
  assert.equal(kit.sha256, pin.archive.sha256);
  assert.equal(kit.purchaseAuthority, false);
});

test("extracted kit: MAX_LOCAL_INPUT_BYTES via node --eval (not a copied kernel)", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-kit-"));
  const untar = spawnSync("tar", ["-xzf", DEFAULT_ARCHIVE, "-C", work], { encoding: "utf8" });
  assert.equal(untar.status, 0, untar.stderr);
  const validate = path.join(work, "useful-jobs-1.0.0/lib/validate-next-run.mjs");
  const evalJs = `
    import { pathToFileURL } from "node:url";
    const m = await import(pathToFileURL(${JSON.stringify(validate)}).href);
    process.stdout.write(String(m.MAX_LOCAL_INPUT_BYTES));
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "--eval", evalJs], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(Number(r.stdout), MAX_LOCAL_INPUT_BYTES);
  assert.equal(MAX_LOCAL_INPUT_BYTES, 8 * 1024 * 1024);
});

test("not F08: a 1MiB+1 file under the 8MiB kit cap is accepted", () => {
  const work = mkdtempSync(path.join(tmpdir(), "jip-1mib-"));
  const before = path.join(work, "before.json");
  const after = path.join(work, "after.json");
  const f08Cap = 1_048_576;
  writeFileSync(before, `${JSON.stringify({ rows: [{ field: "a", value: 1, unit: "u" }] })}\n`);
  writeFileSync(after, `${JSON.stringify({ rows: [{ field: "a", value: 2, unit: "u" }] })}\n`);
  // Pad after.json as raw bytes over F08's 1 MiB without exceeding 8MiB.
  const pad = Buffer.alloc(f08Cap + 1 - 2, 0x20);
  writeFileSync(after, Buffer.concat([Buffer.from("{"), pad, Buffer.from("}")]));
  const r = runCli([
    "vendor-budget-impact",
    "--before",
    before,
    "--after",
    after,
    "--input-root",
    work,
  ]);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.inputs.after.bytes > f08Cap);
  assert.ok(r.json.inputs.after.bytes <= MAX_LOCAL_INPUT_BYTES);
});

test("local HTTP: real catalog.json served on 127.0.0.1", async () => {
  const body = readFileSync(DEFAULT_CATALOG);
  const server = await new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      if (req.url === "/catalog.json") {
        res.writeHead(200, { "content-type": "application/json", "content-length": body.length });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end("no");
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/catalog.json`;
    const r = await runCliAsync([...JOURNEY_ARGS, "--catalog", url]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.catalogSchema, pin.schema);
    assert.equal(r.json.engineInvoked, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("I01 digest form is the emitted identity (sha256: + 64 hex)", () => {
  const r = runCli(JOURNEY_ARGS);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.json.inputs.before.digest, DIGEST_RE);
  assert.equal(r.json.inputs.before.digest, formatDigest(r.json.inputs.before.sha256));
});

test("fixture catalog-pin matches the real catalog job contract", async () => {
  const catalog = JSON.parse(readFileSync(DEFAULT_CATALOG, "utf8"));
  const job = catalog.jobs.find((j) => j.id === "vendor-budget-impact");
  assert.deepEqual(job.requiredInputs, pin.vendorBudgetImpact.requiredInputs);
  assert.deepEqual(job.outputs, pin.vendorBudgetImpact.outputs);
  assert.equal(catalog.schema, pin.schema);
});
