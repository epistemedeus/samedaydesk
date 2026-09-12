#!/usr/bin/env node
// Immutable 1.4.3 base plus SDS wrapper/interrupt/publication overlay.
// Does not rewrite useful-jobs-1.4.3.tar.gz (a18ab918…). No network/install.
import { createHash } from "node:crypto";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const own = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(own, "../..");
const pub = join(repo, "client/public/for-agents/useful-jobs");
const mirror = join(repo, "client/public/kit");
const version = "1.4.4";
const prevVersion = "1.4.3";
const prevName = "useful-jobs-" + prevVersion;
const name = "useful-jobs-" + version;
const prevSha = "a18ab918b5a6f60a6981903694aeba41d7d30dd8ad3e336f1d7b8fd22cf62b09";
const prevBytes = 2615491;
const pin100Sha = "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
const pin100Bytes = 2522418;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

const immutable = [];
for (const v of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.4.1", "1.4.2", prevVersion]) {
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
if (previous.bytes !== prevBytes || previous.sha256 !== prevSha) throw new Error("1.4.3 base mismatch");

const work = mkdtempSync(join(repo, "tmp-useful-jobs-1.4.4-stage-"));
const cleanup = () => rmSync(work, { recursive: true, force: true });
process.once("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM"]) {
  const onSignal = () => {
    const applicationHandlesSignal = process.listeners(signal).some((listener) => listener !== onSignal);
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

const listing = exec("tar", ["-tzf", join(pub, prevName + ".tar.gz")]);
if (listing.split("\n").some((row) => /wrapper\.mjs$/.test(row))) {
  throw new Error("refusing to pack: 1.4.3 archive unexpectedly contains wrapper.mjs");
}

const sourceFiles = {};
function copyTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source).sort()) {
    if (entry === "node_modules" || entry === ".cache" || entry === ".git") continue;
    const src = join(source, entry);
    const dest = join(destination, entry);
    const st = lstatSync(src);
    if (st.isSymbolicLink()) throw new Error("overlay refuses symlinks: " + src);
    if (st.isDirectory()) copyTree(src, dest);
    else if (st.isFile()) {
      copyFileSync(src, dest);
      sourceFiles[src.slice(repo.length + 1)] = sha(readFileSync(src));
    } else throw new Error("overlay requires regular files: " + src);
  }
}
function copyFile(rel) {
  const source = join(repo, rel);
  const dest = join(stage, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  sourceFiles[rel] = sha(readFileSync(source));
}

const overlayDirs = [
  "server/paid-useful-jobs/lib",
  "server/paid-useful-jobs/bin",
  "server/paid-useful-jobs/fixtures",
  "experiments/wave5/m01/lib",
  "tools/managed-useful-jobs-order/lib",
  "tools/managed-useful-jobs-order/fixtures",
  "tools/managed-useful-jobs-order/sql",
  "tools/managed-useful-jobs-order/bin",
  "tools/job-input-preflight/lib",
  "tools/job-output-atomicity/lib",
  "tools/job-output-atomicity/vendor",
  "tools/result-mailbox/lib",
  "tools/result-mailbox/vendor",
];
const overlayFiles = [
  "server/paid-useful-jobs/index.mjs",
  "experiments/wave5/m01/catalog.json",
  "tools/job-output-atomicity/index.mjs",
  "tools/job-output-atomicity/PIN.json",
];
for (const rel of overlayDirs) copyTree(join(repo, rel), join(stage, rel));
for (const rel of overlayFiles) copyFile(rel);

const wrapperSrc = readFileSync(join(stage, "server/paid-useful-jobs/lib/wrapper.mjs"), "utf8");
if (!wrapperSrc.includes("export function publishCompleteOutputs") || !wrapperSrc.includes("rollback-incomplete")) {
  throw new Error("1.4.4 overlay missing publication rollback in wrapper.mjs");
}
const orderSrc = readFileSync(join(stage, "tools/managed-useful-jobs-order/lib/create-order.mjs"), "utf8");
if (!orderSrc.includes("interrupted-incomplete")) {
  throw new Error("1.4.4 overlay missing interrupted-run guard in create-order.mjs");
}

const pin100 = json(join(pub, "useful-jobs-1.0.0.sha256.json"));
const nestedArchive = readFileSync(join(pub, "useful-jobs-1.0.0.tar.gz"));
if (nestedArchive.length !== pin100Bytes || sha(nestedArchive) !== pin100Sha) {
  throw new Error("refusing to nest mutated 1.0.0 identity archive");
}
if (pin100.sha256 !== pin100Sha || pin100.bytes !== pin100Bytes) {
  throw new Error("1.0.0 sha256.json disagrees with archive bytes");
}
const nestedDir = join(stage, "client/public/for-agents/useful-jobs");
mkdirSync(nestedDir, { recursive: true });
copyFileSync(join(pub, "useful-jobs-1.0.0.tar.gz"), join(nestedDir, "useful-jobs-1.0.0.tar.gz"));
copyFileSync(join(pub, "useful-jobs-1.0.0.sha256.json"), join(nestedDir, "useful-jobs-1.0.0.sha256.json"));
sourceFiles["client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz"] = pin100Sha;
sourceFiles["client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json"] = sha(readFileSync(join(pub, "useful-jobs-1.0.0.sha256.json")));

const catalog = json(join(stage, "catalog.json"));
catalog.version = version;
writeJson(join(stage, "catalog.json"), catalog);
const outcomes = json(join(stage, "jobs-outcomes.json"));
outcomes.version = version;
writeJson(join(stage, "jobs-outcomes.json"), outcomes);
copyFileSync(join(stage, "catalog.json"), join(nestedDir, "catalog.json"));
copyFileSync(join(stage, "jobs-outcomes.json"), join(nestedDir, "jobs-outcomes.json"));
const pkg = json(join(stage, "package.json"));
pkg.version = version;
writeJson(join(stage, "package.json"), pkg);

let readme = readFileSync(join(stage, "README.md"), "utf8");
readme = readme.replaceAll(prevVersion, version);
readme += [
  "",
  "## 1.4.4 SDS wrapper overlay",
  "",
  "This archive keeps the 1.4.3 kit CLI, engines, and `lib/common.mjs` vendor scratch lifecycle.",
  "It also ships the in-tree SDS execution.v1 wrapper and managed-order interrupt path at their",
  "repo-relative locations (`server/paid-useful-jobs/lib/wrapper.mjs`, `tools/managed-useful-jobs-order/lib/create-order.mjs`).",
  "Those files include publication rollback (`rollback-incomplete`) and `interrupted-incomplete`.",
  "Vendor-budget-impact identity still extracts nested useful-jobs 1.0.0 (`6bf65039…`, 2522418 bytes).",
  "Do not re-nest useful-jobs-1.4.3.tar.gz. Version 1.4.3 remains byte-identical at",
  "`/for-agents/useful-jobs/useful-jobs-1.4.3.tar.gz` (2615491 bytes, sha256 `a18ab918…`).",
  "Extracted Postgres `import 'pg'` is a host driver; this package does not vendor `node_modules`.",
  "No live fetch or purchase authority.",
  "",
].join("\n");
writeFileSync(join(stage, "README.md"), readme);
writeFileSync(
  join(stage, "NOTICE"),
  readFileSync(join(stage, "NOTICE"), "utf8") +
    "\n1.4.4 SDS wrapper/interrupt overlay. 1.4.3 archive a18ab918 remains unchanged and does not contain wrapper.mjs. Nested 1.0.0 is identity extract only. No live fetch or purchase authority.\n",
);
writeFileSync(
  join(stage, "PACKAGING-ALLOWLIST.txt"),
  readFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), "utf8") +
    "\n1.4.4 overlay: SDS execution.v1 wrapper, managed-order interrupt, m01 adapter, job-input-preflight/atomicity/mailbox import graph, nested useful-jobs-1.0.0 identity archive. Do not re-nest 1.4.3. Prior archives remain unchanged.\n",
);

const archivePath = join(work, name + ".tar.gz");
exec("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", archivePath, "-C", work, name]);
const bytes = readFileSync(archivePath);
const pin = {
  schema: "useful-jobs.release-archive.v1",
  name,
  archive: name + ".tar.gz",
  bytes: bytes.length,
  sha256: sha(bytes),
  node: ">=22",
  builtAt: new Date().toISOString(),
  sourceRepo: "epistemedeus/samedaydesk",
  sourceCommit: exec("git", ["rev-parse", "HEAD"]),
  sourceFiles,
  nestedPinsVerified: true,
  nestedIdentityArchive: {
    name: "useful-jobs-1.0.0",
    archive: "useful-jobs-1.0.0.tar.gz",
    bytes: pin100Bytes,
    sha256: pin100Sha,
    reason: "SDS wrapper vendor-budget-impact extract identity; not the current public download",
  },
  overlayContains: {
    wrapper: "server/paid-useful-jobs/lib/wrapper.mjs",
    publicationRollback: true,
    interruptGuard: "tools/managed-useful-jobs-order/lib/create-order.mjs",
  },
  previous: { name: prevName, archive: prevName + ".tar.gz", bytes: prevBytes, sha256: prevSha },
  immutable: ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.4.1", "1.4.2", prevVersion].map((v) => {
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
  const replaced = readFileSync(file, "utf8")
    .replaceAll(current.version, version)
    .replaceAll(current.sha256, pin.sha256)
    .replaceAll(String(current.bytes), String(pin.bytes));
  const value = JSON.parse(replaced);
  value.sourceRepo = pin.sourceRepo;
  value.sourceCommit = pin.sourceCommit;
  value.archiveFreeze = pin.sourceCommit;
  value.overlaySourceFiles = sourceFiles;
  value.purchaseAuthority = false;
  const old143 = {
    version: prevVersion,
    archive: "/for-agents/useful-jobs/" + prevName + ".tar.gz",
    kitArchive: "/kit/" + prevName + ".tar.gz",
    sha256: prevSha,
    bytes: prevBytes,
    rootName: prevName,
  };
  value.previous = old143;
  if (Array.isArray(value.immutableArchives)) {
    value.immutableArchives = value.immutableArchives.filter((a) => a.version !== prevVersion && a.version !== version);
    value.immutableArchives.push(old143);
  }
  if (relative.includes("/discovery/")) {
    value.vendorPricingScope = { billCalculation: false, unitsConverted: false, liveQuote: false, sourceCoverageVerified: false };
  }
  writeJson(file, value);
}
for (const old of immutable) if (sha(readFileSync(old.path)) !== old.sha256) throw new Error("Old archive changed: " + old.path);
const still143 = readFileSync(join(pub, prevName + ".tar.gz"));
if (still143.length !== prevBytes || sha(still143) !== prevSha) throw new Error("1.4.3 public archive was mutated");
const still143Kit = readFileSync(join(mirror, prevName + ".tar.gz"));
if (still143Kit.length !== prevBytes || sha(still143Kit) !== prevSha) throw new Error("1.4.3 kit archive was mutated");

console.log(JSON.stringify({ ok: true, ...pin, stageRemovedOnExit: true, immutableFilesVerified: immutable.length }, null, 2));
