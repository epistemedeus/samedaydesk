#!/usr/bin/env node
/**
 * Build useful-jobs 1.1.0 from the published 1.0.0 archive plus in-tree
 * engine runtimes. Does not overwrite useful-jobs-1.0.0.tar.gz.
 * No network. No node_modules. Does not pack the Pilot repo or research trees.
 */
import { createHash } from "node:crypto";
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const OWNED = join(HERE, "..");
const REPO_ROOT = join(OWNED, "../..");
const VERSION = "1.1.0";
const STAGE_NAME = `useful-jobs-${VERSION}`;
const PREV = "useful-jobs-1.0.0";
const PREV_ARCHIVE = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz");
const PREV_PIN = join(REPO_ROOT, "client/public/for-agents/useful-jobs/useful-jobs-1.0.0.sha256.json");
const RELEASE = join(OWNED, "release");
const PUBLIC_DIR = join(REPO_ROOT, "client/public/for-agents/useful-jobs");
const KIT_DIR = join(REPO_ROOT, "client/public/kit");

const PREV_SHA = "6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51";
const PREV_BYTES = 2522418;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function mustCopy(src, dest) {
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function filterSkip(p) {
  const base = p.split("/").pop();
  if (base === "node_modules" || base === ".git" || base === "out" || base === "test") return false;
  if (base === "RECEIPT.md" || base === "FEATURE-MAP.md" || base === "RESULT.md") return false;
  return true;
}

const prevPin = JSON.parse(readFileSync(PREV_PIN, "utf8"));
const prevBuf = readFileSync(PREV_ARCHIVE);
if (prevBuf.length !== PREV_BYTES || sha256(prevBuf) !== PREV_SHA) {
  throw new Error("refusing to pack: useful-jobs-1.0.0 archive pin mismatch");
}
if (prevPin.sha256 !== PREV_SHA || prevPin.bytes !== PREV_BYTES) {
  throw new Error("1.0.0 sha256.json disagrees with archive bytes");
}

const work = join(REPO_ROOT, "tmp-useful-jobs-1.1.0-stage");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const extract = spawnSync("tar", ["-xzf", PREV_ARCHIVE, "-C", work], { encoding: "utf8" });
if (extract.status !== 0) throw new Error(extract.stderr || "tar extract 1.0.0 failed");

const prevRoot = join(work, PREV);
const stage = join(work, STAGE_NAME);
if (!existsSync(join(prevRoot, "bin/useful-jobs.mjs"))) {
  throw new Error("1.0.0 extract missing bin/useful-jobs.mjs");
}
cpSync(prevRoot, stage, { recursive: true });

const engines = [
  {
    id: "lockfile-pin-delta",
    files: [
      "bin/lockfile-delta.mjs",
      "package.json",
      "lib",
      "fixtures/journey/before.json",
      "fixtures/journey/after.json",
    ],
  },
  {
    id: "json-schema-webhook-drift",
    files: [
      "bin/webhook-drift.mjs",
      "package.json",
      "lib",
      "vendor/i01-hash-terms/canonical.mjs",
      "vendor/i01-hash-terms/hash.mjs",
      "vendor/i01-hash-terms/LICENSE",
      "vendor/i01-hash-terms/PIN.json",
      "fixtures/example/before.json",
      "fixtures/example/after.json",
      "fixtures/example/used.json",
      "fixtures/example/SAMPLE.txt",
    ],
  },
  {
    id: "route-table-diff",
    files: ["bin/route-diff.mjs", "lib", "fixtures/SAMPLE", "fixtures/journey", "fixtures/comparison", "fixtures/public-shells-snapshot.json"],
  },
  {
    id: "page-change-offline-job",
    files: ["bin/page-change.mjs", "package.json", "NOTICE.md", "lib"],
  },
];

for (const engine of engines) {
  const srcRoot = join(REPO_ROOT, "tools", engine.id);
  for (const rel of engine.files) {
    const src = join(srcRoot, rel);
    const dest = join(stage, "engines", engine.id, rel);
    if (!existsSync(src)) throw new Error(`engine path missing ${relative(REPO_ROOT, src)}`);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, {
      recursive: true,
      filter: (p) => filterSkip(p.replaceAll("\\", "/")),
    });
  }
}

copyFile(
  join(REPO_ROOT, "tools/json-schema-webhook-drift/vendor/i01-hash-terms/LICENSE"),
  join(stage, "licenses/vendor/i01-hash-terms/LICENSE"),
);
copyFile(
  join(REPO_ROOT, "tools/page-change-offline-job/NOTICE.md"),
  join(stage, "licenses/vendor/page-change-offline-job/NOTICE.md"),
);

for (const id of engines.map((e) => e.id)) {
  mustCopy(join(RELEASE, "apps", id), join(stage, "apps", id));
}

mustCopy(join(RELEASE, "public-samples/lockfile"), join(stage, "samples/lockfile"));
mustCopy(join(RELEASE, "public-samples/schema"), join(stage, "samples/schema"));
mustCopy(join(RELEASE, "public-samples/routes"), join(stage, "samples/routes"));
mustCopy(join(RELEASE, "public-samples/page"), join(stage, "samples/page"));
copyFile(join(RELEASE, "public-samples/SOURCE.txt"), join(stage, "samples/H04-SOURCE.txt"));

copyFile(join(RELEASE, "catalog-1.1.0.json"), join(stage, "catalog.json"));
copyFile(join(RELEASE, "jobs-outcomes-1.1.0.json"), join(stage, "jobs-outcomes.json"));

const pkg = JSON.parse(readFileSync(join(stage, "package.json"), "utf8"));
pkg.version = VERSION;
pkg.description =
  "Offline useful-job wrappers: four engine sources plus six PR51 compatibility jobs. Node >= 22. No purchase authority.";
if (!pkg.files.includes("engines/")) pkg.files.push("engines/");
writeFileSync(join(stage, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

const allowlist = `${readFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), "utf8").trim()}

1.1.0 additions (this version only):
- engines/   (lockfile-pin-delta, json-schema-webhook-drift, route-table-diff, page-change-offline-job runtimes)
- apps/<new-id>/ cli.mjs + CALLER.md
- samples/lockfile, samples/schema, samples/routes, samples/page (H04 public inputs)

Do not re-nest useful-jobs-1.0.0.tar.gz. Keep 1.0.0 URLs unchanged.
`;
writeFileSync(join(stage, "PACKAGING-ALLOWLIST.txt"), allowlist);

const notice = `${readFileSync(join(stage, "NOTICE"), "utf8").trim()}

1.1.0 engine sources
---------------------
- tools/lockfile-pin-delta, json-schema-webhook-drift, route-table-diff, page-change-offline-job
  (runtime lib/bin/fixtures only; tests, RECEIPT.md, FEATURE-MAP.md omitted)
- vendor/i01-hash-terms MIT LICENSE is preserved under engines/json-schema-webhook-drift/vendor/i01-hash-terms/LICENSE
  and licenses/vendor/i01-hash-terms/LICENSE
- page-change-offline-job NOTICE.md is UNLICENSED SDS; merchant compare.mjs is not vendored

Previous version 1.0.0 remains at /for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz
`;
writeFileSync(join(stage, "NOTICE"), `${notice}\n`);

const readme = `# useful-jobs ${VERSION}

Offline wrappers. Four engine sources (lockfile, JSON Schema webhook drift, route-table
diff, page-change) plus the original six PR51 jobs. Run locally on your own files.
No purchase authority, no hosted extract, no scheduler daemon, no paid HTTP endpoint.

## Requirements

- Node.js 22 or newer
- Offline local filesystem access to your inputs
- Acquire tools (download/verify/extract only): bash, curl, python3, tar, mktemp

## Install (offline)

From the 1.1.0 release archive (after you unpack it):

\`\`\`bash
cd useful-jobs-1.1.0
node -v   # expect v22+
node bin/useful-jobs.mjs list
node bin/useful-jobs.mjs version
\`\`\`

Download path: \`/for-agents/useful-jobs/useful-jobs-1.1.0.tar.gz\`
(kit mirror \`/kit/useful-jobs-1.1.0.tar.gz\`). Verify size and sha256 from
\`useful-jobs-1.1.0.sha256.json\` before extract.

Previous version 1.0.0 remains at \`/for-agents/useful-jobs/useful-jobs-1.0.0.tar.gz\`
(2522418 bytes, sha256 \`6bf650391fad4fa658a7959e9717fc5499faf4caffa0a39f67c6c2ee033bdb51\`).

Pinned nested archives under \`vendor-pins/\` are verified by sha256/size before
the six PR51 jobs run. Exact pins are in \`vendor-pins/PIN.json\`.

## List jobs

\`\`\`bash
node bin/useful-jobs.mjs list
node bin/useful-jobs.mjs list --json
node bin/useful-jobs.mjs help lockfile-pin-delta
\`\`\`

## Run a job

Caller mode requires semantic inputs. Missing inputs refuse closed. Labeled
samples require an explicit \`--example\` flag except page-change, which refuses
\`--example\` (\`sample_as_delivered_watch\`).

\`\`\`bash
# Labeled sample (not a customer run)
node bin/useful-jobs.mjs run lockfile-pin-delta --example
node bin/useful-jobs.mjs run json-schema-webhook-drift --example
node bin/useful-jobs.mjs run route-table-diff --example --out-dir ./out/route-example

# H04 public lockfile excerpt (caller files, not --example)
node bin/useful-jobs.mjs run lockfile-pin-delta \\
  --before ./samples/lockfile/h04-pub-lock-01/before.json \\
  --after ./samples/lockfile/h04-pub-lock-01/after.json \\
  --out-dir ./out/h04-lock

# Held page-change job (no --example)
node bin/useful-jobs.mjs run page-change-offline-job \\
  --job ./samples/page/h04-page-01/job.json \\
  --out-dir ./out/h04-page

# Original six (unchanged)
node bin/useful-jobs.mjs run api-upgrade-brief --example
\`\`\`

Default outputs for the six PR51 jobs land in \`out/<job>/\` when \`--out-dir\`
is omitted. \`route-table-diff\` and \`page-change-offline-job\` require \`--out-dir\`.

## The ten jobs

| Job id | Required inputs | Outputs | --example |
| --- | --- | --- | --- |
| \`lockfile-pin-delta\` | \`--before --after\` | \`pin-delta.{json,md}\` | labeled SAMPLE |
| \`json-schema-webhook-drift\` | \`--before --after --used\` | \`drift-brief.{json,md}\` | labeled SAMPLE |
| \`route-table-diff\` | \`--before --after --out-dir\` | \`route-diff.{json,md}\` | labeled SAMPLE |
| \`page-change-offline-job\` | \`--job --out-dir\` | \`page-change.{json,md}\` | refused |
| \`api-upgrade-brief\` | \`--before --after --used\` | \`upgrade-brief.{json,md}\` | labeled SAMPLE |
| \`vendor-budget-impact\` | \`--before --after\` | \`budget-impact.{json,md}\` | labeled SAMPLE |
| \`feed-agenda\` | \`--before --after\` | \`agenda.{json,ics}\` | labeled SAMPLE |
| \`evidence-ci-annotation\` | \`--input\` | \`annotations.{json,md}\` | labeled SAMPLE |
| \`listing-repair-packet\` | \`--input\` | \`repair-packet.{json,md}\` | labeled SAMPLE |
| \`repeat-job-record\` | \`--next-run\` | \`repeat-job.{json,md}\` | labeled SAMPLE |

Machine catalog: \`catalog.json\`. Concrete job outcomes: \`jobs-outcomes.json\`.
Per-job caller guides: \`apps/<job>/CALLER.md\`.

H04 public inputs (pin \`37dd4b42cf21dc2031715971971bb2426a7beb80\`) are copied
under \`samples/\`. This archive does not require a sibling H04 tree or a private Git clone.

## Honesty rules

- Samples under \`samples/\` and \`--example\` are labeled fixtures, not customers.
- \`page-change-offline-job --example\` is refused. Use a held extract-batch job document.
- Evidence CI annotations from caller-supplied packets stay **unattested**.
- Vendor conflicting/unknown evidence stays **partial**.
- Lockfile equality is npm \`package-lock.json\` fields only.
- This package is a local execution kit. It does not publish a paid HTTP merchant route.
- No purchase, network, or background scheduler authority.

## Tests

The packaged \`npm test\` suite is the 1.0.0 regression for the six PR51 jobs.
Public 1.1.0 cold-prefix checks live in the SameDayDesk tree
(\`npm run test:useful-jobs-public\`).

## License

Pilot-authored wrappers and samples: MIT (\`LICENSE\`). Nested vendor archives
keep their original licenses (\`NOTICE\`, \`licenses/vendor/\`). Engine
\`page-change-offline-job\` is UNLICENSED SDS (\`NOTICE.md\`); I01 hash-terms
hasher is MIT.
`;
writeFileSync(join(stage, "README.md"), readme);

const dispatcher = readFileSync(join(stage, "bin/useful-jobs.mjs"), "utf8")
  .replace(
    " * useful-jobs - standalone offline entry for the six useful-job wrappers.",
    " * useful-jobs - standalone offline entry for ten useful-job wrappers.",
  )
  .replace(
    "  list                         List the six jobs (machine-readable with --json)",
    "  list                         List the ten jobs (machine-readable with --json)",
  )
  .replace(
    "  node bin/useful-jobs.mjs run vendor-budget-impact --before a.json --after b.json --out-dir ./out/budget",
    "  node bin/useful-jobs.mjs run lockfile-pin-delta --before a-lock.json --after b-lock.json --out-dir ./out/lock\n  node bin/useful-jobs.mjs run vendor-budget-impact --before a.json --after b.json --out-dir ./out/budget",
  );
writeFileSync(join(stage, "bin/useful-jobs.mjs"), dispatcher);

const buildArchive = readFileSync(join(stage, "scripts/build-archive.mjs"), "utf8");
if (!buildArchive.includes('"engines"')) {
  writeFileSync(
    join(stage, "scripts/build-archive.mjs"),
    buildArchive.replace(
      `  "apps",
  "lib",`,
      `  "apps",
  "engines",
  "lib",`,
    ),
  );
}

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
    archive: "useful-jobs-1.0.0.tar.gz",
    bytes: PREV_BYTES,
    sha256: PREV_SHA,
  },
  h04Examples: "37dd4b42cf21dc2031715971971bb2426a7beb80",
};

copyFile(archivePath, join(PUBLIC_DIR, `${STAGE_NAME}.tar.gz`));
writeFileSync(join(PUBLIC_DIR, `${STAGE_NAME}.sha256.json`), `${JSON.stringify(pin, null, 2)}\n`);
copyFile(archivePath, join(KIT_DIR, `${STAGE_NAME}.tar.gz`));
writeFileSync(join(KIT_DIR, `${STAGE_NAME}.sha256.json`), `${JSON.stringify(pin, null, 2)}\n`);
copyFile(join(RELEASE, "catalog-1.1.0.json"), join(PUBLIC_DIR, "catalog.json"));
copyFile(join(RELEASE, "jobs-outcomes-1.1.0.json"), join(PUBLIC_DIR, "jobs-outcomes.json"));

const stillPrev = readFileSync(join(PUBLIC_DIR, "useful-jobs-1.0.0.tar.gz"));
if (stillPrev.length !== PREV_BYTES || sha256(stillPrev) !== PREV_SHA) {
  throw new Error("1.0.0 public archive was mutated");
}

process.stdout.write(`${JSON.stringify({ ok: true, ...pin, publicPath: join(PUBLIC_DIR, `${STAGE_NAME}.tar.gz`) }, null, 2)}\n`);
