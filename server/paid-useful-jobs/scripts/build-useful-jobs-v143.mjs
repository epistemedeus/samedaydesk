#!/usr/bin/env node
// Immutable 1.4.2 base plus owned vendor scratch lifecycle. No network/install.
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const own = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(own, "../..");
const pub = join(repo, "client/public/for-agents/useful-jobs");
const mirror = join(repo, "client/public/kit");
const version = "1.4.3";
const prevVersion = "1.4.2";
const prevName = "useful-jobs-" + prevVersion;
const name = "useful-jobs-" + version;
const prevSha = "10a1da783a7037908d6a4ec63c9f5479762f3bbf4cc0226ae7ff09c1a0ee1cc1";
const prevBytes = 2614866;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const immutable = [];
for (const v of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.4.1", prevVersion]) {
  const archive = "useful-jobs-" + v + ".tar.gz";
  const pin = json(join(pub, "useful-jobs-" + v + ".sha256.json"));
  for (const dir of [pub, mirror]) {
    const bytes = readFileSync(join(dir, archive));
    if (bytes.length !== pin.bytes || sha(bytes) !== pin.sha256) throw new Error("Old archive pin mismatch: " + archive);
    immutable.push({ path: join(dir, archive), sha256: sha(bytes) });
    const pinPath = join(dir, "useful-jobs-" + v + ".sha256.json");
    immutable.push({ path: pinPath, sha256: sha(readFileSync(pinPath)) });
  }
}
const previous = json(join(pub, prevName + ".sha256.json"));
if (previous.bytes !== prevBytes || previous.sha256 !== prevSha) throw new Error("1.4.2 base mismatch");
const work = mkdtempSync(join(repo, "tmp-useful-jobs-1.4.3-stage-"));
const cleanup = () => rmSync(work, { recursive: true, force: true });
process.once("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) {
  const onSignal = () => {
    const applicationHandlesSignal = process.listeners(signal).some(listener => listener !== onSignal);
    cleanup();
    if (!applicationHandlesSignal) {
      process.removeListener(signal, onSignal);
      process.kill(process.pid, signal);
    }
  };
  process.prependListener(signal, onSignal);
}
function exec(command, args) {
  const r = spawnSync(command, args, { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || command + " failed");
  return r.stdout.trim();
}
exec("tar", ["-xzf", join(pub, prevName + ".tar.gz"), "-C", work]);
const stage = join(work, name);
renameSync(join(work, prevName), stage);
const overlays = ["apps/vendor-budget-impact/cli.mjs", "apps/vendor-budget-impact/CALLER.md", "lib/common.mjs"];
const sourceFiles = {};
for (const relative of overlays) {
  const source = join(own, "release", relative);
  copyFileSync(source, join(stage, relative));
  sourceFiles["server/paid-useful-jobs/release/" + relative] = sha(readFileSync(source));
}
const engineIds = ["lockfile-pin-delta", "json-schema-webhook-drift", "route-table-diff", "page-change-offline-job"];
const engineCatalog = json(join(repo, "experiments/wave5/m01/catalog.json"));
const engineSourceCommits = {};
function copyTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source).sort()) {
    const src = join(source, name), dest = join(destination, name), st = lstatSync(src);
    if (st.isSymbolicLink()) throw new Error("Engine packaging refuses symlinks: " + src);
    if (st.isDirectory()) copyTree(src, dest);
    else if (st.isFile()) {
      copyFileSync(src, dest);
      sourceFiles[src.slice(repo.length + 1)] = sha(readFileSync(src));
    } else throw new Error("Engine packaging requires regular files: " + src);
  }
}
for (const id of engineIds) {
  const engine = engineCatalog.engines.find((row) => row.id === id);
  if (!engine?.selected || !/^[0-9a-f]{40}$/.test(engine.pin.sha)) throw new Error("Missing settled engine pin: " + id);
  exec("git", ["diff", "--exit-code", engine.pin.sha, "--", "tools/" + id]);
  engineSourceCommits[id] = engine.pin.sha;
  const destination = join(stage, "engines", id);
  // Only the freshly extracted, task-owned engine subtree is replaced.
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination);
  for (const part of ["bin", "lib", "vendor", "fixtures"]) {
    const source = join(repo, "tools", id, part);
    try { lstatSync(source); } catch { continue; }
    copyTree(source, join(destination, part));
  }
  for (const part of ["package.json", "LICENSE", "README.md", "CONTRACT.md", "FEATURE-MAP.md"]) {
    const source = join(repo, "tools", id, part);
    try { lstatSync(source); } catch { continue; }
    copyFileSync(source, join(destination, part));
    sourceFiles["tools/" + id + "/" + part] = sha(readFileSync(source));
  }
}
const summary = "Compare caller-supplied pricing snapshots for added, removed, changed and incomparable-unit rows. Not a bill calculator or live quote.";
const notes = "Supply dated snapshots with stable field identity and matching units. Added/removed rows describe snapshot coverage, not confirmed SKU launches/retirements. Same-unit numeric deltas are per listed unit, not savings. No usage, free-tier, tax, tariff or currency conversion.";
const catalog = json(join(stage, "catalog.json"));
catalog.version = version;
Object.assign(catalog.jobs.find((j) => j.id === "vendor-budget-impact"), { summary, notes });
writeJson(join(stage, "catalog.json"), catalog);
const outcomes = json(join(stage, "jobs-outcomes.json"));
outcomes.version = version;
outcomes.jobs.find((j) => j.id === "vendor-budget-impact").outcome = summary + " Conflicting/unknown evidence stays partial. No purchase authority.";
writeJson(join(stage, "jobs-outcomes.json"), outcomes);
const pkg = json(join(stage, "package.json"));
pkg.version = version;
writeJson(join(stage, "package.json"), pkg);
let readme = readFileSync(join(stage, "README.md"), "utf8");
readme = readme.replaceAll(prevVersion, version);
readme += "\n## 1.4.3 temporary vendor lifecycle\n\nVendor extracts are reused within the calling process and removed on normal exit, extraction failure, SIGINT, and SIGTERM. Explicit cleanup is idempotent. Existing engines and pricing scope are unchanged. A SIGKILL or host failure can still leave scratch for an owner-verified cleanup. Versions 1.0.0 through 1.4.2 remain byte-identical.\n";
writeFileSync(join(stage, "README.md"), readme);
writeFileSync(join(stage, "NOTICE"), readFileSync(join(stage, "NOTICE"), "utf8") + "\n1.4.3 vendor scratch lifecycle repair. Existing job semantics and vendor-row qualification remain unchanged. No live fetch or purchase authority.\n");
writeFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), readFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), "utf8") + "\n1.4.3 overlay: maintained lib/common.mjs with owned scratch cleanup; prior engine source pins retained. Prior archives remain unchanged.\n");
const archivePath = join(work, name + ".tar.gz");
exec("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", archivePath, "-C", work, name]);
const bytes = readFileSync(archivePath);
const pin = {
  schema: "useful-jobs.release-archive.v1", name, archive: name + ".tar.gz",
  bytes: bytes.length, sha256: sha(bytes), node: ">=22",
  builtAt: new Date().toISOString(), sourceRepo: "epistemedeus/samedaydesk",
  sourceCommit: exec("git", ["rev-parse", "HEAD"]), sourceFiles, engineSourceCommits,
  nestedPinsVerified: true,
  previous: { name: prevName, archive: prevName + ".tar.gz", bytes: prevBytes, sha256: prevSha },
  immutable: ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.4.1", prevVersion].map((v) => {
    const p = json(join(pub, "useful-jobs-" + v + ".sha256.json"));
    return { name: p.name, archive: "useful-jobs-" + v + ".tar.gz", bytes: p.bytes, sha256: p.sha256 };
  }),
};
for (const dir of [pub, mirror]) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(archivePath, join(dir, pin.archive));
  writeJson(join(dir, name + ".sha256.json"), pin);
}
writeJson(join(pub, "catalog.json"), catalog);
writeJson(join(pub, "jobs-outcomes.json"), outcomes);
for (const relative of ["client/public/discovery/useful-jobs.json", "client/src/data/usefulJobsKit.json"]) {
  const file = join(repo, relative);
  const current = json(file);
  const replaced = readFileSync(file, "utf8").replaceAll(current.version, version).replaceAll(current.sha256, pin.sha256).replaceAll(String(current.bytes), String(pin.bytes));
  const value = JSON.parse(replaced);
  if (value.description === summary) delete value.description;
  value.sourceRepo = pin.sourceRepo;
  value.sourceCommit = pin.sourceCommit;
  value.archiveFreeze = pin.sourceCommit;
  value.overlaySourceFiles = sourceFiles;
  const old140 = {
    version: prevVersion, archive: "/for-agents/useful-jobs/" + prevName + ".tar.gz",
    kitArchive: "/kit/" + prevName + ".tar.gz", sha256: prevSha, bytes: prevBytes, rootName: prevName,
  };
  value.previous = old140;
  if (Array.isArray(value.immutableArchives)) {
    value.immutableArchives = value.immutableArchives.filter((a) => a.version !== prevVersion && a.version !== version);
    value.immutableArchives.push(old140);
  }
  if (relative.includes("/discovery/")) {
    value.vendorPricingScope = { billCalculation: false, unitsConverted: false, liveQuote: false, sourceCoverageVerified: false };
  }
  writeJson(file, value);
}
for (const old of immutable) if (sha(readFileSync(old.path)) !== old.sha256) throw new Error("Old archive changed: " + old.path);
console.log(JSON.stringify({ ok: true, ...pin, stageRemovedOnExit: true, immutableFilesVerified: immutable.length }, null, 2));
