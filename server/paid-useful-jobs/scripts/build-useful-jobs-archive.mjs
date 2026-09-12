#!/usr/bin/env node
/**
 * Build useful-jobs 1.4.0 from the published 1.3.0 archive plus schema
 * overlay. Does not overwrite 1.0.0, 1.1.0, 1.2.0, or 1.3.0 archives.
 * No network. No node_modules. Does not pack the Pilot repo or research trees.
 */
import { createHash } from "node:crypto";
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const OWNED = join(HERE, "..");
const REPO_ROOT = join(OWNED, "../..");
const VERSION = "1.4.0";
const STAGE_NAME = `useful-jobs-${VERSION}`;
const PREV = "useful-jobs-1.3.0";
const PREV_ARCHIVE = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.3.0.tar.gz");
const PREV_PIN = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.3.0.sha256.json");
const PIN_120_ARCHIVE = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz");
const PIN_120_JSON = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.2.0.sha256.json");
const PIN_110_ARCHIVE = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz");
const PIN_110_JSON = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.1.0.sha256.json");
const PIN_100_ARCHIVE = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz");
const PIN_100_JSON = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json");
const RELEASE = join(OWNED, "release");
const PUBLIC_DIR = join(REPO_ROOT, "client/public/for-agents/useful-jobs");
const KIT_DIR = join(REPO_ROOT, "client/public/kit");
const TOOLS = join(REPO_ROOT, "tools");

const PIN_100_SHA = "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
const PIN_100_BYTES = 2522418;
const PIN_110_SHA = "de8ebee19ffd5d9019fa7988291fe37d861e7bf3f5ee7dd341c9d2f0f0065534";
const PIN_110_BYTES = 2577606;
const PIN_120_SHA = "dec31ea66f1605fb9578c7d15c9583b130c6e2c0b82b5e6b93422381a04461eb";
const PIN_120_BYTES = 2579117;
const PREV_SHA = "bc4db0ec83109852b8fdbd542d10d515c0053a30dd9b93836c9ad7c738510b6c";
const PREV_BYTES = 2574904;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function copyFile(src, dest) {
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function assertPin(path, bytes, digest, label) {
  const buf = readFileSync(path);
  if (buf.length !== bytes || sha256(buf) !== digest) {
    throw new Error(`refusing to pack: ${label} archive pin mismatch`);
  }
  return buf;
}

const pin100 = JSON.parse(readFileSync(PIN_100_JSON, "utf8"));
assertPin(PIN_100_ARCHIVE, PIN_100_BYTES, PIN_100_SHA, "useful-jobs-1.0.0");
if (pin100.sha256 !== PIN_100_SHA || pin100.bytes !== PIN_100_BYTES) {
  throw new Error("1.0.0 sha256.json disagrees with archive bytes");
}
const pin110 = JSON.parse(readFileSync(PIN_110_JSON, "utf8"));
assertPin(PIN_110_ARCHIVE, PIN_110_BYTES, PIN_110_SHA, "useful-jobs-1.1.0");
if (pin110.sha256 !== PIN_110_SHA || pin110.bytes !== PIN_110_BYTES) {
  throw new Error("1.1.0 sha256.json disagrees with archive bytes");
}
const pin120 = JSON.parse(readFileSync(PIN_120_JSON, "utf8"));
assertPin(PIN_120_ARCHIVE, PIN_120_BYTES, PIN_120_SHA, "useful-jobs-1.2.0");
if (pin120.sha256 !== PIN_120_SHA || pin120.bytes !== PIN_120_BYTES) {
  throw new Error("1.2.0 sha256.json disagrees with archive bytes");
}
const prevPin = JSON.parse(readFileSync(PREV_PIN, "utf8"));
assertPin(PREV_ARCHIVE, PREV_BYTES, PREV_SHA, "useful-jobs-1.3.0");
if (prevPin.sha256 !== PREV_SHA || prevPin.bytes !== PREV_BYTES) {
  throw new Error("1.3.0 sha256.json disagrees with archive bytes");
}

const work = join(REPO_ROOT, "tmp-useful-jobs-1.4.0-stage");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const extract = spawnSync("tar", ["-xzf", PREV_ARCHIVE, "-C", work], { encoding: "utf8" });
if (extract.status !== 0) throw new Error(extract.stderr || "tar extract 1.3.0 failed");

const prevRoot = join(work, PREV);
const stage = join(work, STAGE_NAME);
if (!existsSync(join(prevRoot, "bin/useful-jobs.mjs"))) {
  throw new Error("1.3.0 extract missing bin/useful-jobs.mjs");
}
cpSync(prevRoot, stage, { recursive: true });

copyFile(
  join(TOOLS, "json-schema-webhook-drift/lib/compare.mjs"),
  join(stage, "engines/json-schema-webhook-drift/lib/compare.mjs"),
);
copyFile(
  join(TOOLS, "json-schema-webhook-drift/lib/contract.mjs"),
  join(stage, "engines/json-schema-webhook-drift/lib/contract.mjs"),
);
copyFile(join(RELEASE, "catalog-1.4.0.json"), join(stage, "catalog.json"));
copyFile(join(RELEASE, "jobs-outcomes-1.4.0.json"), join(stage, "jobs-outcomes.json"));

const pkg = JSON.parse(readFileSync(join(stage, "package.json"), "utf8"));
pkg.version = VERSION;
writeFileSync(join(stage, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

const allowlist = `${readFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), "utf8").trim()}

1.4.0 overlay (this version only):
- engines/json-schema-webhook-drift/lib/compare.mjs + contract.mjs
  (used-path pattern add/remove/change)

Do not re-nest useful-jobs-1.3.0.tar.gz, useful-jobs-1.2.0.tar.gz,
useful-jobs-1.1.0.tar.gz, or useful-jobs-1.0.0.tar.gz.
Keep 1.0.0, 1.1.0, 1.2.0, and 1.3.0 URLs byte-identical.
`;
writeFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), allowlist);

const notice = `${readFileSync(join(stage, "NOTICE"), "utf8").trim()}

1.4.0 delivery closeout
-----------------------
- JSON Schema used-path fingerprints include pattern. Adding a pattern on a
  used path is breaking, not silent unchanged. Pattern removal is compatible.
  A changed pattern is unknown rather than a guessed instance-set proof.

Previous version 1.3.0 remains at /for-agents/useful-jobs/useful-jobs-1.3.0.tar.gz
Previous version 1.2.0 remains at /for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz
Previous version 1.1.0 remains at /for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz
Previous version 1.0.0 remains at /for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz
`;
writeFileSync(join(stage, "NOTICE"), `${notice}\n`);

let readme = readFileSync(join(stage, "README.md"), "utf8");
readme = readme.replaceAll("useful-jobs 1.3.0", `useful-jobs ${VERSION}`);
readme = readme.replaceAll("useful-jobs-1.3.0", STAGE_NAME);
readme = readme.replace(
  "From the 1.3.0 release archive (after you unpack it):",
  "From the 1.4.0 release archive (after you unpack it):",
);
readme = readme.replace(
  "Public 1.3.0 cold-prefix checks live in the SameDayDesk tree",
  "Public 1.4.0 cold-prefix checks live in the SameDayDesk tree",
);
if (!readme.includes("useful-jobs-1.3.0.tar.gz")) {
  readme = readme.replace(
    "Previous version 1.2.0 remains at `/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz`",
    `Previous version 1.3.0 remains at \`/for-agents/useful-jobs/useful-jobs-1.3.0.tar.gz\`
(${PREV_BYTES} bytes, sha256 \`${PREV_SHA}\`).
Previous version 1.2.0 remains at \`/for-agents/useful-jobs/useful-jobs-1.2.0.tar.gz\``,
  );
}
writeFileSync(join(stage, "README.md"), readme);

const sourceCommit = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
}).stdout.trim();

const dist = join(work, "dist");
mkdirSync(dist, { recursive: true });
const archivePath = join(dist, `${STAGE_NAME}.tar.gz`);
const tar = spawnSync("tar", ["-czf", archivePath, "-C", work, STAGE_NAME], { encoding: "utf8" });
if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);

const buf = readFileSync(archivePath);
const pin = {
  schema: "useful-jobs.release-archive.v1",
  name: STAGE_NAME,
  archive: `${STAGE_NAME}.tar.gz`,
  bytes: buf.length,
  sha256: sha256(buf),
  node: ">=22",
  builtAt: new Date().toISOString(),
  nestedPinsVerified: true,
  sourceRepo: "epistemedeus/samedaydesk",
  sourceCommit,
  previous: {
    name: PREV,
    archive: "useful-jobs-1.3.0.tar.gz",
    bytes: PREV_BYTES,
    sha256: PREV_SHA,
  },
  immutable: [
    {
      name: "useful-jobs-1.0.0",
      archive: "useful-jobs-1.0.0.tar.gz",
      bytes: PIN_100_BYTES,
      sha256: PIN_100_SHA,
    },
    {
      name: "useful-jobs-1.1.0",
      archive: "useful-jobs-1.1.0.tar.gz",
      bytes: PIN_110_BYTES,
      sha256: PIN_110_SHA,
    },
    {
      name: "useful-jobs-1.2.0",
      archive: "useful-jobs-1.2.0.tar.gz",
      bytes: PIN_120_BYTES,
      sha256: PIN_120_SHA,
    },
    {
      name: PREV,
      archive: "useful-jobs-1.3.0.tar.gz",
      bytes: PREV_BYTES,
      sha256: PREV_SHA,
    },
  ],
  h04Examples: "37dd4b42cf21dc2031715971971bb2426a7beb80",
};

copyFile(archivePath, join(PUBLIC_DIR, `${STAGE_NAME}.tar.gz`));
writeFileSync(join(PUBLIC_DIR, `${STAGE_NAME}.sha256.json`), `${JSON.stringify(pin, null, 2)}\n`);
copyFile(archivePath, join(KIT_DIR, `${STAGE_NAME}.tar.gz`));
writeFileSync(join(KIT_DIR, `${STAGE_NAME}.sha256.json`), `${JSON.stringify(pin, null, 2)}\n`);
copyFile(join(RELEASE, "catalog-1.4.0.json"), join(PUBLIC_DIR, "catalog.json"));
copyFile(join(RELEASE, "jobs-outcomes-1.4.0.json"), join(PUBLIC_DIR, "jobs-outcomes.json"));

const still100 = readFileSync(join(PUBLIC_DIR, "useful-jobs-1.0.0.tar.gz"));
if (still100.length !== PIN_100_BYTES || sha256(still100) !== PIN_100_SHA) {
  throw new Error("1.0.0 public archive was mutated");
}
const still110 = readFileSync(join(PUBLIC_DIR, "useful-jobs-1.1.0.tar.gz"));
if (still110.length !== PIN_110_BYTES || sha256(still110) !== PIN_110_SHA) {
  throw new Error("1.1.0 public archive was mutated");
}
const still120 = readFileSync(join(PUBLIC_DIR, "useful-jobs-1.2.0.tar.gz"));
if (still120.length !== PIN_120_BYTES || sha256(still120) !== PIN_120_SHA) {
  throw new Error("1.2.0 public archive was mutated");
}
const still130 = readFileSync(join(PUBLIC_DIR, "useful-jobs-1.3.0.tar.gz"));
if (still130.length !== PREV_BYTES || sha256(still130) !== PREV_SHA) {
  throw new Error("1.3.0 public archive was mutated");
}

process.stdout.write(`${JSON.stringify({ ok: true, ...pin, publicPath: join(PUBLIC_DIR, `${STAGE_NAME}.tar.gz`) }, null, 2)}\n`);
