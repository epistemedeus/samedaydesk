#!/usr/bin/env node
/**
 * Replay the fixture round agent-opportunity-221400-v1 against disposable Postgres.
 * Creates an isolated schema, serves HTTP on an ephemeral port, drives the CLI,
 * restarts the process store, and drops the schema.
 * Refuses production provenance and productionAdmission. Does not transfer funds.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createApp } from "../src/app.ts";
import { hashToken } from "../src/crypto.ts";
import { quoteIdent } from "../src/config.ts";
import { createPostgresStore } from "../src/store/postgres.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "scripts/opportunity.mjs");
const roundPath = process.env.OPPORTUNITY_ROUND_FILE ?? path.join(root, "fixtures/opportunity/agent-opportunity-221400-v1.round.json");
const cohortPath = process.env.OPPORTUNITY_COHORT_FILE ?? path.join(root, "fixtures/opportunity/agent-opportunity-221400-v1.cohort.json");

function exitWith(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function assertReceivable(round) {
  if (!round || typeof round !== "object") exitWith("round file is empty", 2);
  if (round.provenance === "production" || round.productionAdmission === true) {
    exitWith("refusing production provenance or productionAdmission; this script does not admit a funded round", 2);
  }
  if (round.provenance !== "fixture" && round.provenance !== "test") {
    exitWith("round provenance must be fixture or test", 2);
  }
}

const roundFixture = JSON.parse(readFileSync(roundPath, "utf8"));
const cohortFixture = JSON.parse(readFileSync(cohortPath, "utf8"));
assertReceivable(roundFixture);

const databaseUrl = process.env.EARNED_WORK_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) exitWith("EARNED_WORK_DATABASE_URL is required");
const ownerToken = process.env.EARNED_WORK_OWNER_TOKEN ?? "dev-owner-token-s275";
if (ownerToken.length < 8) exitWith("EARNED_WORK_OWNER_TOKEN must be at least 8 characters");

const schema = `opprecv_${randomBytes(6).toString("hex")}`;
const scratch = mkdtempSync(path.join(tmpdir(), "opportunity-221400-"));
const provenance = roundFixture.provenance;

function writeBody(name, body) {
  const file = path.join(scratch, name);
  writeFileSync(file, JSON.stringify(body));
  return file;
}

function cliCall(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: {
        ...process.env,
        EARNED_WORK_BASE_URL: baseUrl,
        EARNED_WORK_OWNER_TOKEN: ownerToken,
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`cli ${args[0] ?? ""} failed (${code}): ${err}\n${out}`));
        return;
      }
      try {
        resolve(JSON.parse(out));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function discoveryEvidence() {
  return {
    kind: "discovery_trace",
    selfReport: {
      listingRef: null,
      encounterAt: null,
      encounterEstimated: false,
      route: "unknown",
      query: null,
      endpointOrFilter: null,
      upstreamPublicLink: null,
      snippetRef: null,
      pagesFollowed: [],
      decisionPoint: "existing inquiry",
      role: "operator",
      activeMinutes: null,
      confidence: "unknown",
      unknowns: ["query", "endpoint", "upstream"],
    },
  };
}

function packed(evidence) {
  const jsonText = JSON.stringify(evidence);
  return {
    provenance,
    artifact: {
      ref: "fixture:opportunity-evidence-not-fetched",
      digestSha256: createHash("sha256").update(jsonText, "utf8").digest("hex"),
      mediaType: "application/json",
      bytes: Buffer.byteLength(jsonText),
    },
    evidence,
  };
}

let baseUrl = "";
let server;
let store;

async function listen(nextStore) {
  const config = {
    port: 0,
    listenHost: "127.0.0.1",
    shutdownTimeoutMs: 8000,
    ownerToken,
    ownerTokenHash: hashToken(ownerToken),
    databaseUrl,
    bodyLimitBytes: 32 * 1024,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 10_000,
    corsOrigins: ["https://neomorphic.io"],
    trustProxyHops: 0,
    pgSchema: schema,
    poolMax: 4,
    verifierMode: "default",
    reproduction: null,
  };
  const app = createApp(nextStore, config);
  const httpServer = createServer(app);
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") fail("HTTP listen failed");
  return { httpServer, url: `http://127.0.0.1:${address.port}` };
}

async function closeHttp(httpServer) {
  await new Promise((resolve) => httpServer.close(() => resolve()));
}

async function count(sql) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`SET search_path TO ${quoteIdent(schema)}`);
    const result = await client.query(sql);
    return result.rows[0]?.n ?? "0";
  } finally {
    await client.end();
  }
}

async function drop() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  } finally {
    await client.end();
  }
}

try {
  store = await createPostgresStore(databaseUrl, { schema, poolMax: 4 });
  const started = await listen(store);
  server = started.httpServer;
  baseUrl = started.url;

  const created = await cliCall([
    "create-round",
    "--file",
    roundPath,
    "--idempotency-key",
    "recv-round",
    "--expect",
    "201",
  ]);
  const termsVersion = created.body.termsVersion;
  const imports = [];
  for (const row of cohortFixture.imports) {
    const file = writeBody(`import-${row.publicLabel}.json`, {
      provenance,
      offerKey: "discovery-trace",
      importKey: `personal:${row.credentialRef}`,
      ...row,
    });
    const imported = await cliCall([
      "import",
      "--round",
      roundFixture.roundKey,
      "--file",
      file,
      "--idempotency-key",
      `recv-import-${row.publicLabel}`,
      "--expect",
      "201",
    ]);
    imports.push({
      label: row.publicLabel,
      claimId: imported.body.claim.id,
      settlementKey: imported.body.claim.settlementKey,
      token: imported.body.token,
      credentialGrant: imported.body.credentialGrant,
      doNotStartWork: imported.body.doNotStartWork,
    });
  }
  const primary = imports.find((row) => row.label === "Synthetic01");
  const deferred = imports.find((row) => row.label === "Synthetic06");
  if (!primary?.token || !deferred?.token) fail("fixture import did not return a holder token");
  const primaryAgainFile = writeBody("import-primary-again.json", {
    provenance,
    offerKey: "discovery-trace",
    importKey: "personal:fixture:synthetic-01",
    publicLabel: "Synthetic01",
    credentialRef: "fixture:synthetic-01",
    deferStart: false,
  });
  const primaryAgain = await cliCall([
    "import",
    "--round",
    roundFixture.roundKey,
    "--file",
    primaryAgainFile,
    "--idempotency-key",
    "recv-import-primary-again",
    "--expect",
    "200",
  ]);
  if (primaryAgain.body.token) fail("duplicate import reissued a token");

  for (const row of cohortFixture.assignments) {
    const file = writeBody(`assign-${row.publicLabel}.json`, {
      provenance,
      offerKey: "workflow-witness",
      importKey: `assign:${row.credentialRef}`,
      ...row,
    });
    const assigned = await cliCall([
      "assign",
      "--round",
      roundFixture.roundKey,
      "--file",
      file,
      "--idempotency-key",
      `recv-assign-${row.publicLabel}`,
      "--expect",
      "201",
    ]);
    if (assigned.body.token) fail("assignment reissued a token");
    if (assigned.body.credentialGrant !== "already_issued") fail("assignment did not reuse the imported credential");
  }

  const listed = await cliCall([
    "read-round",
    "--round",
    roundFixture.roundKey,
    "--provenance",
    provenance,
    "--expect",
    "200",
  ]);
  const publicText = JSON.stringify(listed.body);
  if (publicText.includes("ew_ctr_") || publicText.includes("fixture:221400") || publicText.includes("SCOPE-PRIVATE") || publicText.includes("@")) {
    fail("public round read leaked a credential, scope, or personal marker");
  }

  const issued = await fetch(`${baseUrl}/v1/contributor-tokens`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({
      contributorPublicId: "recv-outsider",
      provenance,
    }),
  });
  const issuedBody = await issued.json();
  if (issued.status !== 201 || !issuedBody.token) fail(`outsider token failed: ${issued.status}`);

  const overflowFile = writeBody("overflow.json", {
    provenance,
    offerKey: "discovery-trace",
    termsVersion,
    publicLabel: "Outsider",
  });
  const overflow = await cliCall([
    "claim",
    "--round",
    roundFixture.roundKey,
    "--token",
    issuedBody.token,
    "--file",
    overflowFile,
    "--idempotency-key",
    "recv-overflow",
    "--expect",
    "409",
  ]);
  if (overflow.body.paidSlot !== false || overflow.body.doNotStartWork !== true || overflow.body.claimAuthority !== "none") {
    fail("full discovery did not return a non-paying waitlist");
  }
  const workflowFile = writeBody("workflow-grab.json", {
    provenance,
    offerKey: "workflow-witness",
    termsVersion,
    publicLabel: "Outsider",
  });
  const workflowGrab = await cliCall([
    "claim",
    "--round",
    roundFixture.roundKey,
    "--token",
    issuedBody.token,
    "--file",
    workflowFile,
    "--idempotency-key",
    "recv-workflow",
    "--expect",
    "409",
  ]);
  if (workflowGrab.body.error?.code !== "offer_mismatch" || workflowGrab.body.rewardPromised !== false) {
    fail("unassigned workflow slot was publicly claimable");
  }

  const deferredSubmit = await cliCall([
    "submit",
    "--round",
    roundFixture.roundKey,
    "--claim",
    deferred.claimId,
    "--token",
    deferred.token,
    "--file",
    writeBody("deferred-early.json", packed(discoveryEvidence())),
    "--idempotency-key",
    "recv-deferred-early",
    "--expect",
    "409",
  ]);
  if (deferredSubmit.body.doNotStartWork !== true || deferredSubmit.body.paid !== false) {
    fail("deferred start allowed work or a payment");
  }

  const submitted = await cliCall([
    "submit",
    "--round",
    roundFixture.roundKey,
    "--claim",
    primary.claimId,
    "--token",
    primary.token,
    "--file",
    writeBody("primary-submit.json", packed(discoveryEvidence())),
    "--idempotency-key",
    "recv-primary-submit",
    "--expect",
    "201",
  ]);
  const submittedAgain = await cliCall([
    "submit",
    "--round",
    roundFixture.roundKey,
    "--claim",
    primary.claimId,
    "--token",
    primary.token,
    "--file",
    writeBody("primary-submit.json", packed(discoveryEvidence())),
    "--idempotency-key",
    "recv-primary-submit",
    "--expect",
    "200",
  ]);
  const accepted = await cliCall([
    "accept",
    "--round",
    roundFixture.roundKey,
    "--claim",
    primary.claimId,
    "--file",
    writeBody("primary-accept.json", { provenance, requesterActiveMinutes: 2 }),
    "--idempotency-key",
    "recv-primary-accept",
    "--expect",
    "201",
  ]);
  const acceptedAgain = await cliCall([
    "accept",
    "--round",
    roundFixture.roundKey,
    "--claim",
    primary.claimId,
    "--file",
    writeBody("primary-accept-2.json", { provenance }),
    "--idempotency-key",
    "recv-primary-accept-2",
    "--expect",
    "200",
  ]);
  if (accepted.body.paid !== false || accepted.body.transfer !== null || accepted.body.obligation.adapter !== "null_nonpaying_v0") {
    fail("acceptance transferred or used a paying adapter");
  }
  if (acceptedAgain.body.obligation.id !== accepted.body.obligation.id) fail("duplicate accept minted a second obligation");

  const kernelObligations = await count("SELECT COUNT(*)::text AS n FROM earned_work_obligations");
  const opportunityObligations = await count("SELECT COUNT(*)::text AS n FROM opportunity_obligations");
  if (kernelObligations !== "0" || opportunityObligations !== "1") {
    fail(`obligation split kernel=${kernelObligations} opportunity=${opportunityObligations}`);
  }

  await closeHttp(server);
  await store.close();
  server = null;
  const reopened = await createPostgresStore(databaseUrl, { schema, poolMax: 4 });
  store = reopened;
  const again = await listen(reopened);
  server = again.httpServer;
  baseUrl = again.url;
  const reread = await cliCall([
    "read-claim",
    "--round",
    roundFixture.roundKey,
    "--claim",
    primary.claimId,
    "--provenance",
    provenance,
    "--expect",
    "200",
  ]);
  if (reread.body.claim.settlementKey !== primary.settlementKey || reread.body.paid !== false) {
    fail("restart readback changed the settlement key or marked the claim paid");
  }

  const preserved = {
    campaignKey: "CRT-100198",
    nextRoundKey: roundFixture.roundKey,
    preservedPromise: { reward: "0.10", asset: "USDC", allocation: "0.50", unchanged: true },
  };
  const notice = await cliCall([
    "notice",
    "--file",
    writeBody("notice.json", preserved),
    "--idempotency-key",
    "recv-notice",
    "--expect",
    "201",
  ]);
  const repriced = await cliCall([
    "notice",
    "--file",
    writeBody("notice-reprice.json", {
      ...preserved,
      preservedPromise: { reward: "0.05", asset: "USDC", allocation: "0.50", unchanged: true },
    }),
    "--idempotency-key",
    "recv-notice-reprice",
    "--expect",
    "409",
  ]);
  const noticeRead = await cliCall(["read-notice", "--campaign", "CRT-100198", "--expect", "200"]);

  const summary = {
    schema: "neomorphic.opportunity-receive.v1",
    roundKey: roundFixture.roundKey,
    provenance,
    productionAdmission: false,
    hostedClaimAutomation: false,
    paid: false,
    transfer: null,
    termsVersion,
    imports: imports.length,
    assignments: cohortFixture.assignments.length,
    duplicateImportStatus: primaryAgain.status,
    duplicateImportIssuedToken: false,
    committedAtomic: listed.body.committedAtomic,
    remainingAtomic: listed.body.remainingAtomic,
    discoveryRemaining: listed.body.offers.find((offer) => offer.offerKey === "discovery-trace")?.remainingSlots,
    workflowRemaining: listed.body.offers.find((offer) => offer.offerKey === "workflow-witness")?.remainingSlots,
    overflowStatus: overflow.status,
    overflowPaidSlot: overflow.body.paidSlot,
    overflowDoNotStartWork: overflow.body.doNotStartWork,
    workflowGrabStatus: workflowGrab.status,
    workflowGrabCode: workflowGrab.body.error.code,
    deferredEarlyStatus: deferredSubmit.status,
    deferredDoNotStartWork: deferredSubmit.body.doNotStartWork,
    submitStatus: submitted.status,
    duplicateSubmitStatus: submittedAgain.status,
    acceptStatus: accepted.status,
    acceptAdapter: accepted.body.obligation.adapter,
    acceptPaid: accepted.body.paid,
    duplicateAcceptStatus: acceptedAgain.status,
    kernelObligations,
    opportunityObligations,
    restartSettlementMatched: true,
    noticeStatus: notice.status,
    noticeReward: noticeRead.body.preservedPromise.reward,
    repricedStatus: repriced.status,
    repricedCode: repriced.body.error.code,
    publicRedaction: true,
    note: "Fixture replay only. Owed is not paid. Root hosts before any production admission.",
  };
  const rendered = JSON.stringify(summary);
  if (rendered.includes("ew_ctr_") || rendered.includes("fixture:221400") || rendered.includes("SCOPE-PRIVATE")) {
    fail("receive summary included a fixture credential or private scope");
  }
  process.stdout.write(`${rendered}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = error.exitCode ?? 1;
} finally {
  if (server) await closeHttp(server);
  if (store) await store.close().catch(() => {});
  await drop().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
}
