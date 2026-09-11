#!/usr/bin/env node
/**
 * Pack seeded fixture origins. Tests call this; no live DNS.
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  mkdtempSync,
  cpSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FIXTURES_ROOT } from "../src/paths.mjs";
import { targetById, USEFUL_JOB_IDS } from "../src/catalog.mjs";

const CAP_ARCHIVE_URL = targetById("capability-preflight").live.archive;
const JOBS_ARCHIVE_URL = targetById("useful-jobs").live.archive;
const CAP_LIVE = targetById("capability-preflight").live;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function write(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function tarDir(srcDir, archiveRoot, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const tar = spawnSync("tar", ["-czf", dest, "-C", srcDir, archiveRoot], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(tar.stderr || `tar failed for ${dest}`);
  }
}

const CAP_OK_CLI = `#!/usr/bin/env node
const argv = process.argv.slice(2);
const cmd = argv[0];
function send(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\\n");
  process.exit(code);
}
if (cmd === "status") {
  send({
    schema: "pilot.r2.capabilities.consumer_kit_s180.v1",
    readyForRelease: false,
    paidCalls: false,
    liveNetwork: false,
    purchaseAuthority: false,
    actualCompletion: false,
  });
}
if (cmd === "cold-start") {
  send({
    schema: "pilot.r2.capabilities.cold_start_receipt.v1",
    firstUseStatus: "utility_ok_not_release",
    artifact: "portable-out/cold-start-artifact.json",
    probeInvoked: argv.includes("--probe"),
    mode: "demo",
    readyForRelease: false,
    purchaseAuthority: false,
    actualCompletion: false,
  });
}
if (cmd === "journey") {
  send({
    status: "utility_ok_not_release",
    out: "portable-out/last-journey.json",
    input: "fixtures/journey-input.json",
    mode: "demo",
    readyForRelease: false,
    purchaseAuthority: false,
    actualCompletion: false,
  });
}
process.stderr.write("unknown command\\n");
process.exit(2);
`;

const CAP_PAID_CLI = `#!/usr/bin/env node
const argv = process.argv.slice(2);
const cmd = argv[0];
function send(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\\n");
}
if (cmd === "status") {
  send({
    schema: "pilot.r2.capabilities.consumer_kit_s180.v1",
    readyForRelease: false,
    paidCalls: false,
    liveNetwork: false,
    mode: "demo",
  });
  process.exit(0);
}
send({
  schema: "pilot.r2.capabilities.cold_start_receipt.v1",
  firstUseStatus: "paid_completion",
  mode: "demo",
  sampleLabel: "SAMPLE",
  completionLabel: "actual_completion",
  actualCompletion: true,
  paid: true,
  purchaseAuthority: true,
  sold: true,
});
process.exit(0);
`;

const JOBS_CLI = `#!/usr/bin/env node
const argv = process.argv.slice(2);
const cmd = argv[0];
if (cmd === "list" || cmd === "help") {
  process.stdout.write("api-upgrade-brief vendor-budget-impact feed-agenda evidence-ci-annotation listing-repair-packet repeat-job-record\\n");
  process.exit(0);
}
if (cmd === "run" && argv.includes("--example")) {
  process.stdout.write(JSON.stringify({
    ok: true,
    job: "api-upgrade-brief",
    sampleLabel: "SAMPLE",
    exampleMode: "example",
    purchaseAuthority: false,
    actualCompletion: false,
    notes: "Fixture/sample OpenAPI only; not a runtime compatibility proof.",
  }, null, 2) + "\\n");
  process.exit(0);
}
process.exit(2);
`;

function jobsCatalog() {
  return `${JSON.stringify(
    {
      schema: "useful-jobs.catalog.v1",
      package: "useful-jobs",
      version: "1.0.0",
      runtime: { node: ">=22", purchaseAuthority: false },
      jobs: USEFUL_JOB_IDS.map((id) => ({ id })),
    },
    null,
    2,
  )}\n`;
}

function packKit({ archiveRoot, files, dest }) {
  const work = mkdtempSync(join(tmpdir(), "sds-csa-pack-"));
  const root = join(work, archiveRoot);
  for (const [rel, body] of Object.entries(files)) {
    write(join(root, rel), body);
  }
  tarDir(work, archiveRoot, dest);
  rmSync(work, { recursive: true, force: true });
}

function originDoc(routes) {
  return `${JSON.stringify(
    {
      schema: "samedaydesk.cold-start-assessment.fixture-origin.v1",
      routes,
    },
    null,
    2,
  )}\n`;
}

function gzipHeaders() {
  return { "content-type": "application/gzip" };
}

function capRoute(file, { expectedBytes, expectedSha256, bytes, digest, status = 200 } = {}) {
  return {
    file,
    status,
    headers: gzipHeaders(),
    bytes,
    sha256: digest,
    expectedBytes,
    expectedSha256,
  };
}

export function packFixtures() {
  rmSync(FIXTURES_ROOT, { recursive: true, force: true });
  const okDir = join(FIXTURES_ROOT, "ok");
  const failDigest = join(FIXTURES_ROOT, "fail-digest");
  const failSize = join(FIXTURES_ROOT, "fail-size");
  const failPaid = join(FIXTURES_ROOT, "fail-sample-paid");

  const capOk = join(okDir, "archives/capability-preflight.tar.gz");
  const jobsOk = join(okDir, "archives/useful-jobs-1.0.0.tar.gz");
  packKit({
    archiveRoot: "capability-preflight",
    files: { "bin/capability-consumer-kit.mjs": CAP_OK_CLI },
    dest: capOk,
  });
  packKit({
    archiveRoot: "useful-jobs-1.0.0",
    files: {
      "bin/useful-jobs.mjs": JOBS_CLI,
      "catalog.json": jobsCatalog(),
    },
    dest: jobsOk,
  });

  const capBuf = readFileSync(capOk);
  const jobsBuf = readFileSync(jobsOk);
  const capDigest = sha256(capBuf);
  const jobsDigest = sha256(jobsBuf);

  write(
    join(okDir, "origin.json"),
    originDoc({
      [CAP_ARCHIVE_URL]: capRoute("archives/capability-preflight.tar.gz", {
        bytes: capBuf.length,
        digest: capDigest,
        expectedBytes: capBuf.length,
        expectedSha256: capDigest,
      }),
      [JOBS_ARCHIVE_URL]: capRoute("archives/useful-jobs-1.0.0.tar.gz", {
        bytes: jobsBuf.length,
        digest: jobsDigest,
        expectedBytes: jobsBuf.length,
        expectedSha256: jobsDigest,
      }),
    }),
  );

  mkdirSync(join(failDigest, "archives"), { recursive: true });
  cpSync(capOk, join(failDigest, "archives/capability-preflight.tar.gz"));
  write(
    join(failDigest, "origin.json"),
    originDoc({
      [CAP_ARCHIVE_URL]: capRoute("archives/capability-preflight.tar.gz", {
        bytes: capBuf.length,
        digest: capDigest,
        expectedBytes: capBuf.length,
        expectedSha256: CAP_LIVE.sha256,
      }),
    }),
  );

  mkdirSync(join(failSize, "archives"), { recursive: true });
  cpSync(capOk, join(failSize, "archives/capability-preflight.tar.gz"));
  write(
    join(failSize, "origin.json"),
    originDoc({
      [CAP_ARCHIVE_URL]: capRoute("archives/capability-preflight.tar.gz", {
        bytes: capBuf.length,
        digest: capDigest,
        expectedBytes: CAP_LIVE.bytes,
        expectedSha256: capDigest,
      }),
    }),
  );

  const capPaid = join(failPaid, "archives/capability-preflight.tar.gz");
  packKit({
    archiveRoot: "capability-preflight",
    files: { "bin/capability-consumer-kit.mjs": CAP_PAID_CLI },
    dest: capPaid,
  });
  const paidBuf = readFileSync(capPaid);
  const paidDigest = sha256(paidBuf);
  write(
    join(failPaid, "origin.json"),
    originDoc({
      [CAP_ARCHIVE_URL]: capRoute("archives/capability-preflight.tar.gz", {
        bytes: paidBuf.length,
        digest: paidDigest,
        expectedBytes: paidBuf.length,
        expectedSha256: paidDigest,
      }),
    }),
  );

  return {
    ok: { bytes: capBuf.length, sha256: capDigest },
    usefulJobs: { bytes: jobsBuf.length, sha256: jobsDigest },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  packFixtures();
}
