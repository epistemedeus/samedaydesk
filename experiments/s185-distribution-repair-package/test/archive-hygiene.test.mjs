import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRIVATE_ABS_RE, SECRET_RE } from "../scripts/archive-hygiene.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const REPO = path.resolve(PKG, "../..");

function buildArchive() {
  return spawnSync(process.execPath, [path.join(PKG, "scripts/build-archive.mjs")], {
    encoding: "utf8",
    cwd: PKG,
    maxBuffer: 20 * 1024 * 1024,
  });
}

test("archive unpacks outside the repo and preserves caller diagnose outcomes", () => {
  const receiptPath = path.join(PKG, "dist/archive.sha256.json");
  if (!fs.existsSync(receiptPath)) {
    const built = buildArchive();
    assert.equal(built.status, 0, built.stderr || built.stdout);
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const archivePath = path.join(PKG, "dist", receipt.archive);
  assert.ok(fs.existsSync(archivePath));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s185-unpack-"));
  const tar = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  assert.equal(tar.status, 0, tar.stderr);
  const listing = tar.stdout;
  assert.match(listing, /^distribution-repair\/bin\/distribution-repair\.mjs$/m);
  assert.equal(listing.includes("native-cells"), false);
  assert.equal(listing.includes(".jsonl"), false);

  const unpacked = spawnSync("tar", ["-xzf", archivePath, "-C", tmp], { encoding: "utf8" });
  assert.equal(unpacked.status, 0, unpacked.stderr);
  const root = path.join(tmp, "distribution-repair");
  assert.ok(fs.existsSync(path.join(root, "bin/distribution-repair.mjs")));
  assert.ok(fs.existsSync(path.join(root, "vendor/record04/src/feed.mjs")));
  assert.ok(fs.existsSync(path.join(root, "vendor/05/src/index.mjs")));
  assert.ok(fs.existsSync(path.join(root, "vendor/08/src/diagnose.mjs")));

  const textHits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (/\.(mjs|js|json|md|txt)$/.test(name)) {
        const text = fs.readFileSync(p, "utf8");
        if (PRIVATE_ABS_RE.test(text)) textHits.push(path.relative(root, p));
        if (SECRET_RE.test(text)) textHits.push(`secret:${path.relative(root, p)}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(textHits, []);

  const a = path.join(tmp, "alpha.json");
  const b = path.join(tmp, "beta.json");
  fs.copyFileSync(path.join(root, "examples/caller/alpha.json"), a);
  fs.copyFileSync(path.join(root, "examples/caller/beta.json"), b);
  const ra = spawnSync(
    process.execPath,
    [path.join(root, "bin/distribution-repair.mjs"), "diagnose", a, "--clock", "2026-09-10T20:15:00.000Z"],
    { encoding: "utf8", cwd: tmp, maxBuffer: 10 * 1024 * 1024 },
  );
  const rb = spawnSync(
    process.execPath,
    [path.join(root, "bin/distribution-repair.mjs"), "diagnose", b, "--clock", "2026-09-10T20:15:00.000Z"],
    { encoding: "utf8", cwd: tmp, maxBuffer: 10 * 1024 * 1024 },
  );
  assert.equal(ra.status, 0, ra.stderr || ra.stdout);
  assert.equal(rb.status, 0, rb.stderr || rb.stdout);
  const oa = JSON.parse(ra.stdout);
  const ob = JSON.parse(rb.stdout);
  assert.equal(oa.status, "diagnosed");
  assert.equal(ob.status, "diagnosed");
  assert.equal(oa.repair.beforeAfter.routeKey, "/docs");
  assert.equal(ob.repair.beforeAfter.routeKey, "/api/v1");
  assert.equal(oa.productionAcquisition, false);

  const disc = JSON.parse(fs.readFileSync(path.join(PKG, "discovery/distribution-repair.json"), "utf8"));
  assert.equal(disc.archive.path, `/kit/${receipt.archive}`);
  assert.equal(disc.archive.sha256, receipt.sha256);
  assert.equal(disc.productionAcquisition, false);
  const publicKit = path.join(REPO, "client/public", disc.archive.path.replace(/^\//, ""));
  assert.ok(fs.existsSync(publicKit), publicKit);
});
