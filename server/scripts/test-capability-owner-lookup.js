import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  CAPABILITY_OWNER_LOOKUP_CANNOT_ESTABLISH,
  MAINTAINED_CAPABILITY,
  bindCapabilityCall,
  lookupCapabilityOwner,
  maintainedCapabilityFromDocument,
} from "../lib/observatory/maintained-capability.js";

const discovery = JSON.parse(readFileSync(new URL("../../client/public/discovery/useful-jobs.json", import.meta.url), "utf8"));
const NEWLY_REVIEWED = "lockfile-pin-delta";
const INHERITED = "api-upgrade-brief";
const REMOVED = "repeat-job-record";
const LIBRARY = readFileSync(new URL("../lib/observatory/maintained-capability.js", import.meta.url), "utf8");

function withoutJob(doc, jobId) {
  const next = structuredClone(doc);
  next.jobs = next.jobs.filter((id) => id !== jobId);
  next.releaseScope.newlyReviewedJobIds = next.releaseScope.newlyReviewedJobIds.filter((id) => id !== jobId);
  next.releaseScope.inheritedJobIds = next.releaseScope.inheritedJobIds.filter((id) => id !== jobId);
  return next;
}

test("the live discovery document names an owned job and its call recipe", () => {
  const owned = lookupCapabilityOwner(NEWLY_REVIEWED);
  assert.equal(owned.outcome, "owned");
  assert.equal(owned.reason, null);
  assert.equal(owned.jobId, NEWLY_REVIEWED);
  assert.deepEqual(owned.owner, {
    package: "useful-jobs",
    repo: "epistemedeus/samedaydesk",
  });
  assert.equal(owned.version, discovery.version);
  assert.equal(owned.version, discovery.releaseScope.approvedVersion);
  assert.equal(owned.review, "newly_reviewed");
  assert.equal(owned.execution, MAINTAINED_CAPABILITY.execution);
  assert.equal(owned.purchaseAuthority, false);
  assert.equal(owned.hostedAcquisition, false);
  assert.equal(owned.discovery, "client/public/discovery/useful-jobs.json");
  assert.equal(owned.callRecipe.acquire, discovery.coldStart);
  assert.equal(discovery.coldStart, discovery.install[0]);
  assert.equal(owned.callRecipe.cwdFromAcquireStdout, true);
  assert.deepEqual(owned.callRecipe.requiredInputs, ["--before", "--after"]);
  assert.deepEqual(owned.callRecipe.argv, [
    "node",
    "bin/useful-jobs.mjs",
    "run",
    NEWLY_REVIEWED,
    "--before",
    "<before>",
    "--after",
    "<after>",
  ]);
  assert.equal(owned.cannotEstablish, CAPABILITY_OWNER_LOOKUP_CANNOT_ESTABLISH);
  assert.equal("metric" in owned, false);
  assert.equal("effortSaved" in owned, false);
  assert.deepEqual(MAINTAINED_CAPABILITY.jobIds, discovery.jobs);

  const bySkill = lookupCapabilityOwner({ skill: NEWLY_REVIEWED });
  assert.equal(bySkill.outcome, "owned");
  assert.equal(bySkill.jobId, NEWLY_REVIEWED);
  assert.deepEqual(bySkill.callRecipe.argv, owned.callRecipe.argv);
});

test("an inherited job and a newly reviewed job share owner and version", () => {
  const reviewed = lookupCapabilityOwner({ jobId: NEWLY_REVIEWED });
  const inherited = lookupCapabilityOwner({ need: INHERITED });
  assert.equal(reviewed.outcome, "owned");
  assert.equal(inherited.outcome, "owned");
  assert.equal(reviewed.review, "newly_reviewed");
  assert.equal(inherited.review, "inherited");
  assert.deepEqual(inherited.owner, reviewed.owner);
  assert.equal(inherited.version, reviewed.version);
  assert.equal(inherited.execution, reviewed.execution);
  assert.equal(inherited.callRecipe.acquire, reviewed.callRecipe.acquire);
  assert.deepEqual(inherited.callRecipe.requiredInputs, ["--before", "--after", "--used"]);
  assert.deepEqual(inherited.callRecipe.argv, [
    "node",
    "bin/useful-jobs.mjs",
    "run",
    INHERITED,
    "--before",
    "<before>",
    "--after",
    "<after>",
    "--used",
    "<used>",
  ]);
  assert.notEqual(inherited.jobId, reviewed.jobId);
  assert.equal(discovery.releaseScope.newlyReviewedJobIds.includes(NEWLY_REVIEWED), true);
  assert.equal(discovery.releaseScope.inheritedJobIds.includes(INHERITED), true);
});

test("a version bump that disagrees with releaseScope.approvedVersion is no-fit", () => {
  const bumped = structuredClone(discovery);
  bumped.version = "1.4.8";
  const refused = lookupCapabilityOwner(NEWLY_REVIEWED, bumped);
  assert.equal(refused.outcome, "no-fit");
  assert.equal(refused.reason, "version_not_approved");
  assert.equal(refused.version, null);
  assert.equal(refused.owner, null);
  assert.equal(refused.callRecipe, null);
  assert.equal(JSON.stringify(refused).includes("1.4.8"), false);
  assert.equal(bumped.version, "1.4.8");
  assert.equal(bumped.releaseScope.approvedVersion, "1.4.7");
  assert.throws(() => maintainedCapabilityFromDocument(bumped), /useful_jobs_discovery_invalid/);

  const approvedOnly = structuredClone(discovery);
  approvedOnly.releaseScope.approvedVersion = "1.4.8";
  const approvedRefused = lookupCapabilityOwner(NEWLY_REVIEWED, approvedOnly);
  assert.equal(approvedRefused.outcome, "no-fit");
  assert.equal(approvedRefused.reason, "version_not_approved");
  assert.equal(approvedRefused.version, null);

  const aligned = structuredClone(discovery);
  aligned.version = "1.4.8";
  aligned.releaseScope.approvedVersion = "1.4.8";
  const owned = lookupCapabilityOwner(NEWLY_REVIEWED, aligned);
  assert.equal(owned.outcome, "owned");
  assert.equal(owned.version, "1.4.8");
  assert.equal(owned.review, "newly_reviewed");
  assert.equal(lookupCapabilityOwner(NEWLY_REVIEWED).version, "1.4.7");
});

test("a removed job is no longer owned and a remaining job still is", () => {
  const removed = withoutJob(discovery, REMOVED);
  const missing = lookupCapabilityOwner(REMOVED, removed);
  const stillReviewed = lookupCapabilityOwner(NEWLY_REVIEWED, removed);
  const stillInherited = lookupCapabilityOwner(INHERITED, removed);
  assert.equal(missing.outcome, "no-fit");
  assert.equal(missing.reason, "unknown_need");
  assert.equal(missing.jobId, null);
  assert.equal(missing.callRecipe, null);
  assert.equal(stillReviewed.outcome, "owned");
  assert.equal(stillReviewed.review, "newly_reviewed");
  assert.equal(stillReviewed.jobId, NEWLY_REVIEWED);
  assert.equal(stillInherited.outcome, "owned");
  assert.equal(stillInherited.review, "inherited");
  assert.equal(JSON.stringify(stillReviewed).includes(REMOVED), false);
  assert.equal(maintainedCapabilityFromDocument(removed).jobIds.includes(REMOVED), false);
  assert.equal(MAINTAINED_CAPABILITY.jobIds.includes(REMOVED), true);
  assert.equal(lookupCapabilityOwner(REMOVED).outcome, "owned");
});

test("an unknown need is no-fit and does not prefix-match a job", () => {
  for (const need of ["not-a-maintained-job", "lockfile", "useful-jobs", "", null, 1, { jobId: "" }]) {
    const result = lookupCapabilityOwner(need);
    assert.equal(result.outcome, "no-fit", JSON.stringify(need));
    assert.equal(result.reason, "unknown_need");
    assert.equal(result.owner, null);
    assert.equal(result.version, null);
    assert.equal(result.callRecipe, null);
  }
  const conflict = lookupCapabilityOwner({ jobId: NEWLY_REVIEWED, skill: INHERITED });
  assert.equal(conflict.outcome, "no-fit");
  assert.equal(conflict.reason, "unknown_need");
});

test("a malformed discovery document is no-fit and the existing reader still throws", () => {
  const drifted = structuredClone(discovery);
  drifted.jobs = discovery.jobs.filter((id) => id !== REMOVED);
  const wrongSchema = structuredClone(discovery);
  wrongSchema.schema = "samedaydesk.for-agents.useful-jobs.v0";
  const bumpedAndDrifted = structuredClone(discovery);
  bumpedAndDrifted.version = "1.4.8";
  bumpedAndDrifted.jobs = discovery.jobs.slice(0, -1);
  const hosted = structuredClone(discovery);
  hosted.releaseScope.hostedAcquisition = true;
  const cases = [null, [], {}, "useful-jobs", wrongSchema, drifted, bumpedAndDrifted, hosted];
  for (const doc of cases) {
    const result = lookupCapabilityOwner(NEWLY_REVIEWED, doc);
    assert.equal(result.outcome, "no-fit");
    assert.equal(result.reason, "malformed_discovery");
    assert.equal(result.owner, null);
    assert.equal(result.version, null);
    assert.equal(result.callRecipe, null);
    assert.throws(() => maintainedCapabilityFromDocument(doc), /useful_jobs_discovery_invalid/);
  }
  assert.equal(lookupCapabilityOwner(NEWLY_REVIEWED).outcome, "owned");
});

test("a valid document without the acquire command does not invent a call", () => {
  const stripped = structuredClone(discovery);
  delete stripped.coldStart;
  const result = lookupCapabilityOwner(NEWLY_REVIEWED, stripped);
  assert.equal(result.outcome, "no-fit");
  assert.equal(result.reason, "call_recipe_unavailable");
  assert.equal(result.callRecipe, null);
  const capability = maintainedCapabilityFromDocument(stripped);
  assert.equal(capability.version, discovery.version);
  assert.deepEqual(capability.jobIds, discovery.jobs);
});

test("the lookup does not keep a second job list, route, or network call", () => {
  assert.equal(LIBRARY.includes("\u2014"), false);
  assert.equal(/\bfetch\s*\(/.test(LIBRARY), false);
  assert.equal(LIBRARY.includes("createServer"), false);
  assert.equal(LIBRARY.includes("Router"), false);
  for (const id of discovery.jobs) assert.equal(LIBRARY.includes(id), false, id);
  assert.equal(LIBRARY.includes("1.4.7"), false);
  const frozen = Object.freeze(structuredClone(discovery));
  Object.freeze(frozen.jobs);
  Object.freeze(frozen.releaseScope);
  Object.freeze(frozen.releaseScope.newlyReviewedJobIds);
  Object.freeze(frozen.releaseScope.inheritedJobIds);
  const owned = lookupCapabilityOwner(INHERITED, frozen);
  assert.equal(owned.outcome, "owned");
  assert.equal(owned.review, "inherited");
  assert.deepEqual(Object.keys(MAINTAINED_CAPABILITY), [
    "schema",
    "package",
    "version",
    "execution",
    "purchaseAuthority",
    "hostedAcquisition",
    "jobIds",
    "discovery",
  ]);
});

const REQUIRED_FLAGS = Object.freeze({
  "lockfile-pin-delta": ["--before", "--after"],
  "json-schema-webhook-drift": ["--before", "--after", "--used"],
  "route-table-diff": ["--before", "--after", "--out-dir"],
  "page-change-offline-job": ["--job", "--out-dir"],
  "api-upgrade-brief": ["--before", "--after", "--used"],
  "vendor-budget-impact": ["--before", "--after"],
  "feed-agenda": ["--before", "--after"],
  "evidence-ci-annotation": ["--input"],
  "listing-repair-packet": ["--input"],
  "repeat-job-record": ["--next-run"],
});

test("every current job id gets the kit flags, and a missing id stays unknown_need", () => {
  assert.deepEqual(Object.keys(REQUIRED_FLAGS).sort(), discovery.jobs.slice().sort());
  for (const [id, flags] of Object.entries(REQUIRED_FLAGS)) {
    const owned = lookupCapabilityOwner(id);
    assert.equal(owned.outcome, "owned", id);
    assert.deepEqual(owned.callRecipe.requiredInputs, flags, id);
    const argv = ["node", "bin/useful-jobs.mjs", "run", id];
    for (const flag of flags) argv.push(flag, `<${flag.slice(2)}>`);
    assert.deepEqual(owned.callRecipe.argv, argv, id);
    assert.equal(bindCapabilityCall(owned.callRecipe, {}), null, id);
  }
  for (const id of discovery.releaseScope.inheritedJobIds) {
    const owned = lookupCapabilityOwner(id);
    assert.equal(owned.outcome, "owned", id);
    assert.equal(owned.review, "inherited", id);
  }
  const removed = withoutJob(discovery, REMOVED);
  assert.equal(lookupCapabilityOwner(REMOVED, removed).reason, "unknown_need");
  assert.equal(lookupCapabilityOwner("not-a-maintained-job").reason, "unknown_need");
});

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function listenForArchive(urlPath, body) {
  const server = http.createServer((req, res) => {
    if (req.url !== urlPath) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": "application/gzip",
      "content-length": String(body.length),
    });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        stop() {
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}

test("the exported recipe runs a fresh snapshot and an unknown need runs nothing", async () => {
  const unknown = lookupCapabilityOwner("not-a-maintained-job");
  assert.equal(unknown.outcome, "no-fit");
  assert.equal(unknown.reason, "unknown_need");
  assert.equal(unknown.callRecipe, null);

  const jobId = "vendor-budget-impact";
  const owned = lookupCapabilityOwner(jobId);
  assert.equal(owned.outcome, "owned");
  assert.equal(owned.review, "newly_reviewed");
  const archive = readFileSync(new URL(`../../client/public${discovery.archive.path}`, import.meta.url));
  const server = await listenForArchive(discovery.archive.path, archive);
  const work = mkdtempSync(join(tmpdir(), "capability-owner-"));
  let kitParent = null;
  try {
    const acquired = await runProcess("bash", ["-c", owned.callRecipe.acquire], {
      encoding: "utf8",
      env: {
        ...process.env,
        USEFUL_JOBS_ORIGIN: server.origin,
        TMPDIR: work,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        http_proxy: "",
        https_proxy: "",
        ALL_PROXY: "",
        all_proxy: "",
        NO_PROXY: "*",
        no_proxy: "*",
      },
    });
    assert.equal(acquired.status, 0, acquired.stderr);
    const kit = acquired.stdout.trim().split("\n").pop();
    kitParent = dirname(kit);
    const beforePath = join(work, "before.json");
    const afterPath = join(work, "after.json");
    writeFileSync(beforePath, `${JSON.stringify({
      rows: [
        { field: "desk-seat-month", value: 40, unit: "USD/seat-month" },
        { field: "desk-archive-gb", value: 0.02, unit: "USD/GB-month" },
      ],
    }, null, 2)}\n`);
    writeFileSync(afterPath, `${JSON.stringify({
      rows: [
        { field: "desk-seat-month", value: 45, unit: "USD/seat-month" },
        { field: "desk-archive-gb", value: 0.02, unit: "USD/GB-month" },
      ],
    }, null, 2)}\n`);
    const argv = bindCapabilityCall(owned.callRecipe, {
      "--before": beforePath,
      "--after": afterPath,
    });
    assert.ok(argv);
    assert.equal(argv[0], "node");
    assert.deepEqual(argv.slice(1, 4), ["bin/useful-jobs.mjs", "run", jobId]);
    const ran = spawnSync(process.execPath, argv.slice(1), {
      cwd: kit,
      encoding: "utf8",
    });
    assert.equal(ran.status, 0, `${ran.stdout}\n${ran.stderr}`);
    const envelope = JSON.parse(ran.stdout.trim());
    assert.equal(envelope.ok, true);
    assert.equal(envelope.appId, jobId);
    assert.equal(envelope.purchaseAuthority, false);
    const impact = JSON.parse(readFileSync(join(envelope.outDir, "budget-impact.json"), "utf8"));
    assert.equal(impact.appId, jobId);
    assert.equal(impact.status, "actionable");
    assert.equal(impact.purchaseAuthority, false);
    const change = impact.actions.find((item) => item.kind === "review-price-field" && item.fieldKey === "desk-seat-month");
    assert.ok(change, JSON.stringify(impact.actions));
    assert.equal(change.beforeValue, 40);
    assert.equal(change.afterValue, 45);
    assert.equal(change.delta, 5);
    assert.equal(change.unit, "USD/seat-month");
    assert.match(impact.summary, /fieldChanges=1/);
    console.log(`RECIPE ${argv.join(" ")}`);
    console.log(`OUTPUT ${JSON.stringify({
      appId: impact.appId,
      status: impact.status,
      summary: impact.summary,
      fieldKey: change.fieldKey,
      beforeValue: change.beforeValue,
      afterValue: change.afterValue,
      delta: change.delta,
      unit: change.unit,
      purchaseAuthority: impact.purchaseAuthority,
    })}`);
  } finally {
    await server.stop();
    rmSync(work, { recursive: true, force: true });
    if (kitParent) rmSync(kitParent, { recursive: true, force: true });
  }
});
