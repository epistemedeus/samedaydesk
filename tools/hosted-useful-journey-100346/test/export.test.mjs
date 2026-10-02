import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fixture } from "./support.mjs";
import { Budget, readFileBounded } from "../lib/budget.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

test("licensed exact-byte client export runs two stripped cold tasks and a useful negative with no repo modules", { timeout: 20_000 }, async t => {
  const release = JSON.parse(await readFile(new URL("../successors/0.1.1/release.json", import.meta.url), "utf8"));
  const archivePath = fileURLToPath(new URL(`../successors/0.1.1/${release.archive}`, import.meta.url));
  const bytes = await readFileBounded(archivePath, new Budget(), 65_536);
  assert.equal(bytes.length, release.bytes); assert.equal(digest(bytes), release.sha256);
  assert.equal(release.publicationVerified, false); assert.equal(release.productionReady, false);
  const corrupted = Buffer.from(bytes); corrupted[corrupted.length - 3] ^= 1;
  assert.notEqual(digest(corrupted), release.sha256);
  const dir = await mkdtemp(join(tmpdir(), "sds-useful-acquired-client-")); t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync("tar", ["-xzf", archivePath, "-C", dir], { timeout: 2000 });
  const kit = join(dir, "hosted-useful-journey-0.1.1");
  const inventory = JSON.parse(await readFile(join(kit, "inventory.json"), "utf8"));
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  let nativePinPresent = false;
  try { execFileSync("git", ["cat-file", "-e", `${release.sourceHead}^{commit}`], { cwd: repo, timeout: 2000, stdio: "ignore" }); nativePinPresent = true; } catch {}
  for (const entry of inventory.files) {
    const acquired = await readFile(join(kit, entry.path));
    assert.equal(digest(acquired), entry.sha256);
    assert.equal(entry.license, "MIT");
    if (entry.path !== "COLD-CLIENT.md") {
      const owning = await readFile(join(repo, "tools/hosted-useful-journey-100346", entry.path));
      assert.deepEqual(acquired, owning);
      if (nativePinPresent) assert.deepEqual(acquired, execFileSync("git", ["show", `${release.sourceHead}:tools/hosted-useful-journey-100346/${entry.path}`], { cwd: repo, timeout: 2000 }));
    }
  }
  assert.match(await readFile(join(kit, "LICENSE"), "utf8"), /MIT License/);
  await assert.rejects(stat(join(kit, "node_modules")), { code: "ENOENT" });
  const f = await fixture(); t.after(() => f.close());
  const catalog = await fetch(`${f.origin}/api/hosted-useful/recipes`).then(r => r.json());
  const acquiredEntry = await fetch(`${f.origin}${catalog.clientEntry}`).then(r => r.json());
  assert.equal(acquiredEntry.sha256, release.sha256);
  assert.equal(acquiredEntry.publicationVerified, false);
  const acquired = await fetch(`${f.origin}${acquiredEntry.archiveUrl}`);
  assert.equal(acquired.status, 200);
  assert.deepEqual(Buffer.from(await acquired.arrayBuffer()), bytes);
  const frozen = execFileSync("git", ["show", "685f90f6:tools/hosted-useful-journey-100346/successors/0.1.0/hosted-useful-journey-0.1.0.tar.gz"], { cwd: repo, timeout: 2000 });
  assert.deepEqual(await readFile(new URL("../successors/0.1.0/hosted-useful-journey-0.1.0.tar.gz", import.meta.url)), frozen);
  async function cold(name) {
    return await new Promise(resolve => {
      const child = spawn(process.execPath, [join(kit, "cold-client.mjs"), "run", "--origin", f.origin, "--project", f.a.projectId,
        "--input", join(kit, "examples", `${name}.json`), "--operation-key", `acquired-${name}-operation`, "--journal", join(dir, `${name}-journal.json`)], {
        cwd: dir, env: { USEFUL_JOURNEY_TOKEN: f.a.token }, stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      child.stdout.on("data", bytes => { stdout += bytes; if (stdout.length > 65_536) child.kill("SIGKILL"); });
      child.stderr.on("data", bytes => { stderr = (stderr + bytes).slice(-1024); });
      child.once("close", code => { clearTimeout(timer); resolve({ code, stdout, stderr, result: JSON.parse(stdout) }); });
    });
  }
  const page = await cold("page-watch");
  assert.equal(page.code, 0, page.stdout); assert.equal(page.result.result.recipe.evidence.changed[0].after, "SDK 2.0");
  const issue = await cold("issue-brief");
  assert.equal(issue.code, 0, issue.stdout); assert.equal(issue.result.result.recipe.evidence.brief.actions.length, 2);
  const negative = await cold("useful-negative");
  assert.equal(negative.code, 0, negative.stdout); assert.equal(negative.result.result.recipe.evidence.rows[0].error.code, "empty_extract");
  assert.equal(page.stdout.includes(f.a.token), false); assert.equal(issue.stderr, "");
  await f.restart();
  const restarted = execFileSync(process.execPath, [join(kit, "cold-client.mjs"), "recover", "--origin", f.origin, "--project", f.a.projectId,
    "--journal", join(dir, "page-watch-journal.json")], { cwd: dir, env: { USEFUL_JOURNEY_TOKEN: f.a.token }, timeout: 10_000, maxBuffer: 65_536 });
  assert.equal(JSON.parse(restarted).resultDigest, page.result.resultDigest);
});
