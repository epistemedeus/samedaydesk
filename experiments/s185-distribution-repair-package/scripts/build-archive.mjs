#!/usr/bin/env node
import {
  cpSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  symlinkSync,
  lstatSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { sanitizeTree, shouldSkipName } from "./archive-hygiene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const REPO = join(PKG, "../..");
const pinPath = join(PKG, "PIN.json");
const pin = JSON.parse(readFileSync(pinPath, "utf8"));
const tip =
  spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout.trim() ||
  "uncommitted";
pin.semanticsTip = tip;
writeFileSync(pinPath, `${JSON.stringify(pin, null, 2)}\n`);

const stagingRoot = join(PKG, ".staging");
const staging = join(stagingRoot, "distribution-repair");
const outDir = join(PKG, "dist");
const archiveName = `distribution-repair-${tip.slice(0, 12)}.tar.gz`;
const archivePath = join(outDir, archiveName);

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(outDir, { recursive: true });

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

function copyDir(src, dest, { excludeNames = [] } = {}) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (excludeNames.includes(name) || shouldSkipName(name)) continue;
    const s = join(src, name);
    const d = join(dest, name);
    const st = lstatSync(s);
    if (st.isSymbolicLink()) {
      const target = spawnSync("readlink", [s], { encoding: "utf8" }).stdout.trim();
      symlinkSync(target, d);
    } else if (st.isDirectory()) copyDir(s, d, { excludeNames });
    else copyFile(s, d);
  }
}

copyDir(join(PKG, "vendor"), join(staging, "vendor"), {
  excludeNames: ["firstuse-boundaries"],
});
copyDir(join(PKG, "src"), join(staging, "src"));
copyDir(join(PKG, "bin"), join(staging, "bin"));
copyDir(join(PKG, "examples"), join(staging, "examples"));
copyDir(join(PKG, "docs"), join(staging, "docs"));
copyDir(join(PKG, "test"), join(staging, "test"), {
  excludeNames: ["archive-hygiene.test.mjs", "pin-suites.test.mjs"],
});
if (existsSync(join(PKG, "discovery"))) {
  copyDir(join(PKG, "discovery"), join(staging, "discovery"));
}

for (const rel of [
  "PIN.json",
  "MANIFEST.json",
  "LICENSE",
  "SOURCE.txt",
  "INSTALL.txt",
  "SKILL.md",
]) {
  const src = join(PKG, rel);
  if (!existsSync(src)) throw new Error(`missing ${rel}`);
  copyFile(src, join(staging, rel));
}

const leaks = sanitizeTree(staging);
if (leaks.length) {
  throw new Error(
    `archive hygiene failed (private paths/secrets/transcripts):\n${leaks
      .map((h) => `${h.kind} ${h.file}`)
      .join("\n")}`,
  );
}

const archivePkg = {
  name: "@samedaydesk/distribution-repair",
  version: "0.1.0",
  private: true,
  type: "module",
  engines: { node: ">=20" },
  description:
    "Portable distribution-repair kit: caller snapshots in, Record04/DIST08/NL06 diagnosis and owner repair guidance out. Free offline; not a production acquisition.",
  bin: { "distribution-repair": "./bin/distribution-repair.mjs" },
  scripts: {
    test: "node --test test/*.test.mjs",
    sample: "node bin/distribution-repair.mjs sample --positive",
  },
};
writeFileSync(join(staging, "package.json"), `${JSON.stringify(archivePkg, null, 2)}\n`);

const packed = spawnSync("tar", ["-czf", archivePath, "-C", stagingRoot, "distribution-repair"], {
  encoding: "utf8",
});
if (packed.status !== 0) throw new Error(packed.stderr || "tar failed");

const bytes = readFileSync(archivePath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const receipt = {
  schema: "samedaydesk.lean-archive-receipt.v1",
  packageId: "distribution-repair",
  archive: archiveName,
  bytes: bytes.length,
  sha256,
  semanticsTip: tip,
  pins: pin.pins || {
    record04: pin.record04,
    record05: pin.record05,
    dist08: pin.dist08,
    nl06: pin.nl06,
  },
  builtAt: new Date().toISOString(),
  productionAcquisition: false,
};
writeFileSync(join(outDir, "archive.sha256.json"), `${JSON.stringify(receipt, null, 2)}\n`);
writeFileSync(join(outDir, "archive.sha256"), `${sha256}  ${archiveName}\n`);

const publicKit = join(REPO, "client/public/kit");
mkdirSync(publicKit, { recursive: true });
cpSync(archivePath, join(publicKit, archiveName));
cpSync(join(outDir, "archive.sha256.json"), join(publicKit, "distribution-repair-archive.sha256.json"));

const discovery = {
  schema: "samedaydesk.acquisition-discovery.v1",
  packageId: "distribution-repair",
  title: "Distribution-repair diagnosis package",
  session: "s185",
  page: "https://samedaydesk.com/for-agents/distribution-repair",
  productionAcquisition: false,
  archive: {
    path: `/kit/${archiveName}`,
    url: `https://samedaydesk.com/kit/${archiveName}`,
    sha256,
    bytes: bytes.length,
  },
  pins: {
    record04: "0e703bd4682894df4e1d25c61b594cac49f2463c",
    record05: "a7e2cd7a2223e2aa7e7e09eebf3695aba4731205",
    dist08: "ea000772cdbd6d5df7174369dcef9aa2270e5723",
    nl06: "76c0732b241beaa569f05a7394fdbf49604ffb66",
    firstUseHeld: "ea2938cfa68dadbe20a9d5ec096f315e59f4cdbe",
    semanticsTip: tip,
  },
  freeOffline: true,
  paidValueClaim: false,
  coldStart: [
    `curl -fsSL -o distribution-repair.tar.gz https://samedaydesk.com/kit/${archiveName}`,
    "mkdir -p /tmp && tar -xzf distribution-repair.tar.gz -C /tmp",
    "cd /tmp/distribution-repair",
    "node bin/distribution-repair.mjs sample --positive",
  ],
};
mkdirSync(join(REPO, "client/public/discovery"), { recursive: true });
writeFileSync(
  join(REPO, "client/public/discovery/distribution-repair.json"),
  `${JSON.stringify(discovery, null, 2)}\n`,
);
mkdirSync(join(PKG, "discovery"), { recursive: true });
writeFileSync(join(PKG, "discovery/distribution-repair.json"), `${JSON.stringify(discovery, null, 2)}\n`);

const kitMeta = {
  archive: `/kit/${archiveName}`,
  sha256,
  bytes: bytes.length,
  discovery: "/discovery/distribution-repair.json",
  record04: "0e703bd4682894df4e1d25c61b594cac49f2463c",
  record05: "a7e2cd7a2223e2aa7e7e09eebf3695aba4731205",
  dist08: "ea000772cdbd6d5df7174369dcef9aa2270e5723",
  nl06: "76c0732b241beaa569f05a7394fdbf49604ffb66",
};
writeFileSync(
  join(REPO, "client/src/data/distributionRepairKit.json"),
  `${JSON.stringify(kitMeta, null, 2)}\n`,
);

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
