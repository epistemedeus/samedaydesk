#!/usr/bin/env node
// Immutable 1.4.0 base plus the vendor-row wrapper overlay. No network/install.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const own = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(own, "../..");
const pub = join(repo, "client/public/for-agents/useful-jobs");
const mirror = join(repo, "client/public/kit");
const version = "1.4.1";
const prevVersion = "1.4.0";
const prevName = "useful-jobs-" + prevVersion;
const name = "useful-jobs-" + version;
const prevSha = "2b1949189f0ad2e3c1bd5f7a43f7eda800fd5f0dc3a395415689feee0419ff4f";
const prevBytes = 2575215;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const immutable = [];
for (const v of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", prevVersion]) {
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
if (previous.bytes !== prevBytes || previous.sha256 !== prevSha) throw new Error("1.4.0 base mismatch");
const work = mkdtempSync(join(repo, "tmp-useful-jobs-1.4.1-stage-"));
function exec(command, args) {
  const r = spawnSync(command, args, { cwd: repo, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || command + " failed");
  return r.stdout.trim();
}
exec("tar", ["-xzf", join(pub, prevName + ".tar.gz"), "-C", work]);
const stage = join(work, name);
renameSync(join(work, prevName), stage);
const overlays = ["apps/vendor-budget-impact/cli.mjs", "apps/vendor-budget-impact/CALLER.md"];
const sourceFiles = {};
for (const relative of overlays) {
  const source = join(own, "release", relative);
  copyFileSync(source, join(stage, relative));
  sourceFiles["server/paid-useful-jobs/release/" + relative] = sha(readFileSync(source));
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
readme = readme.replaceAll(prevName, name).replaceAll("useful-jobs " + prevVersion, "useful-jobs " + version);
readme += "\n## 1.4.1 pricing-row qualification\n\n" + summary + " " + notes + "\n\nPrevious 1.4.0 remains byte-identical at /for-agents/useful-jobs/useful-jobs-1.4.0.tar.gz.\n";
writeFileSync(join(stage, "README.md"), readme);
writeFileSync(join(stage, "NOTICE"), readFileSync(join(stage, "NOTICE"), "utf8") + "\n1.4.1 vendor-row overlay: expose added/removed fields and comparable list-price values. No live fetch, bill estimate, tariff engine, or purchase authority.\n");
writeFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), readFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), "utf8") + "\n1.4.1 overlay: apps/vendor-budget-impact/{cli.mjs,CALLER.md}; catalog/outcomes metadata only. Previous archives remain unchanged.\n");
const archivePath = join(work, name + ".tar.gz");
exec("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-czf", archivePath, "-C", work, name]);
const bytes = readFileSync(archivePath);
const pin = {
  schema: "useful-jobs.release-archive.v1", name, archive: name + ".tar.gz",
  bytes: bytes.length, sha256: sha(bytes), node: ">=22",
  builtAt: new Date().toISOString(), sourceRepo: "epistemedeus/samedaydesk",
  sourceCommit: exec("git", ["rev-parse", "HEAD"]), sourceFiles,
  nestedPinsVerified: true,
  previous: { name: prevName, archive: prevName + ".tar.gz", bytes: prevBytes, sha256: prevSha },
  immutable: ["1.0.0", "1.1.0", "1.2.0", "1.3.0", prevVersion].map((v) => {
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
  const replaced = readFileSync(file, "utf8").replaceAll(prevVersion, version).replaceAll(prevSha, pin.sha256).replaceAll(String(prevBytes), String(pin.bytes));
  const value = JSON.parse(replaced);
  if (relative.includes("/discovery/")) {
    value.description = summary;
    value.vendorPricingScope = { billCalculation: false, unitsConverted: false, liveQuote: false, sourceCoverageVerified: false };
  }
  writeJson(file, value);
}
for (const old of immutable) if (sha(readFileSync(old.path)) !== old.sha256) throw new Error("Old archive changed: " + old.path);
console.log(JSON.stringify({ ok: true, ...pin, stage, immutableFilesVerified: immutable.length }, null, 2));
