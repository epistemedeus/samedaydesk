import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectContributorPayoutKey, inspectDeskAuthority } from "./authority.mjs";
import { missingKernelAcceptance } from "../../contributor-session-grant/src/missing-acceptance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");
const TERMS_ROOT = join(REPO_ROOT, "packs/terms-lifecycle");
const DISPUTE_ROOT = join(REPO_ROOT, "packs/dispute-experience");
const SESSION_ROOT = join(REPO_ROOT, "packs/contributor-session-grant");

export const CALLER_SCHEMA = "neomorphic.contributor-lifecycle.caller.v1";
export const RECEIPT_SCHEMA = "neomorphic.contributor-lifecycle.receipt.v1";

export const DECISION_LIBRARY = Object.freeze({
  repo: "epistemedeus/neomorphic-io",
  pr: 57,
  pin: "0c1440fe46f8fe1fa744b9e67c82b26d702728b7",
  path: "packs/requester-decision",
  onMain: false,
  copiedIntoProductTree: false,
  openHead: "7449e676925ae834c4a7d2dd4d6d724b87cbd42b",
  openHeadMatchesPin: false,
  observedAt: "2026-09-22T16:24:21Z",
});

const TOP_KEYS = new Set([
  "schema",
  "synthetic",
  "provenance",
  "termsFixture",
  "disputeFixture",
  "disputeResolution",
  "now",
  "grant",
  "result",
  "submitAs",
  "submitTermsVersion",
  "probe",
  "decisionRoot",
  "kernelOrigin",
  "followRedirects",
  "payoutKey",
  "holdsPayoutKey",
  "paymentAuthority",
  "entitlement",
  "paid",
  "settled",
  "transfer",
  "deploy",
]);

const DIGEST_RE = /^[0-9a-f]{64}$/;
const TERMS_RE = /^sha256:[0-9a-f]{64}$/;

export class LifecycleCallerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LifecycleCallerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new LifecycleCallerError(code, message, details);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("malformed_input", `${label} has unexpected field ${key}`);
  }
}

function resolveRepoPath(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("malformed_input", `${label} is required`);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    fail("malformed_input", `refusing to fetch a URL for ${label}`, { requests: 0 });
  }
  if (value.startsWith("/") || /^[A-Za-z]:\\/.test(value)) return value;
  return join(REPO_ROOT, value);
}

function authorityKeys(hits) {
  return hits.map((hit) => hit.key).filter((key) => typeof key === "string");
}

function assertCallerMayStart(env) {
  const authority = inspectDeskAuthority({ env });
  if (!authority.ok) {
    fail(
      authority.code,
      "This caller is the contributor journey and refuses to start while the process holds an EARNED_WORK secret.",
      { keys: authorityKeys(authority.hits), requests: 0 },
    );
  }
  const payoutEnv = inspectContributorPayoutKey({ env });
  if (!payoutEnv.ok) {
    fail(payoutEnv.code, "A payout key in the environment kills the session. Nothing was written.", {
      keys: authorityKeys(payoutEnv.hits),
      requests: 0,
    });
  }
}

function assertNoPaymentRequest(input) {
  if (input.paymentAuthority === true || input.entitlement === true || input.paid === true || input.deploy === true) {
    fail(
      "no_payment_authority",
      "This caller cannot grant entitlement, payment, payout, or deployment.",
      { paymentAuthority: false, entitlement: false, paid: false, settled: false, payout: null, deployment: false },
    );
  }
  const fields = ["paid", "settled", "transfer"].filter((key) => Object.hasOwn(input, key));
  if (fields.length > 0) {
    fail(
      "forged_settlement_evidence",
      "Forged settlement evidence is rejected. paid=false, settled=false, and transfer=null are not accepted as proof and are not written into a receipt.",
      { fields, persisted: false, requests: 0, paymentAuthority: false, entitlement: false },
    );
  }
}

async function assertKernelNotContacted(input) {
  if (input.followRedirects === true) {
    fail("redirect_refused", "The caller does not follow redirects toward a kernel.", { requests: 0 });
  }
  if (input.kernelOrigin == null || input.kernelOrigin === "") return;
  if (typeof input.kernelOrigin !== "string") fail("malformed_input", "kernelOrigin must be a string");
  const { trustedKernelOrigin } = await import("../../dispute-experience/src/adapters/kernel.ts");
  let origin;
  try {
    origin = trustedKernelOrigin(input.kernelOrigin);
  } catch (error) {
    fail("untrusted_origin", error instanceof Error ? error.message : "kernel origin is not trusted", {
      requests: 0,
    });
  }
  fail(
    "missing_kernel_acceptance",
    "The kernel origin was not contacted. PR 109 is not accepted on this checkout.",
    { requests: 0, origin, ...missingKernelAcceptance(REPO_ROOT) },
  );
}

function validateShape(input) {
  if (!isPlainObject(input)) fail("malformed_input", "caller input must be a JSON object");
  assertExactKeys(input, TOP_KEYS, "caller input");
  if (input.schema !== CALLER_SCHEMA) fail("malformed_input", `schema must be ${CALLER_SCHEMA}`);
  if (input.synthetic !== true) fail("malformed_input", "synthetic must be true. This caller has no real-work mode.");
  if (input.provenance !== "fixture") fail("malformed_input", "provenance must be fixture");
  if (input.probe != null && input.probe !== "double-earn") fail("malformed_input", "unknown probe");
  if (input.disputeResolution != null && input.disputeResolution !== "affirmed" && input.disputeResolution !== "overturned") {
    fail("malformed_input", "disputeResolution must be affirmed or overturned");
  }
  if (input.now != null && Number.isNaN(Date.parse(input.now))) fail("malformed_input", "now is not a timestamp");
  if (!isPlainObject(input.grant)) fail("malformed_input", "grant object is required");
  assertExactKeys(input.grant, new Set(["ttlSeconds", "revoked"]), "grant");
  if (!Number.isInteger(input.grant.ttlSeconds) || input.grant.ttlSeconds < 0 || input.grant.ttlSeconds > 86400 * 30) {
    fail("malformed_input", "grant.ttlSeconds must be an integer from 0 through 2592000");
  }
  if (typeof input.grant.revoked !== "boolean") fail("malformed_input", "grant.revoked must be boolean");
  if (!isPlainObject(input.result)) fail("malformed_input", "result object is required");
  assertExactKeys(input.result, new Set(["artifactDigest", "note"]), "result");
  if (typeof input.result.artifactDigest !== "string" || !DIGEST_RE.test(input.result.artifactDigest)) {
    fail("malformed_input", "result.artifactDigest must be 64 lowercase hex characters");
  }
  if (typeof input.result.note !== "string" || input.result.note.trim().length < 8 || input.result.note.length > 500) {
    fail("malformed_input", "result.note must be 8 to 500 characters");
  }
  if (input.submitAs != null && (typeof input.submitAs !== "string" || input.submitAs.trim() === "")) {
    fail("malformed_input", "submitAs must be a non-empty string");
  }
  if (input.submitTermsVersion != null) {
    if (typeof input.submitTermsVersion === "number" || (typeof input.submitTermsVersion === "string" && /^\d+$/.test(input.submitTermsVersion))) {
      fail("malformed_input", "integer termsVersion is rejected");
    }
    if (typeof input.submitTermsVersion !== "string" || !TERMS_RE.test(input.submitTermsVersion)) {
      fail("malformed_input", "submitTermsVersion must be sha256: plus 64 lowercase hex characters");
    }
  }
  if (input.decisionRoot != null && input.decisionRoot !== null && typeof input.decisionRoot !== "string") {
    fail("malformed_input", "decisionRoot must be a path or null");
  }
  const payout = inspectContributorPayoutKey({
    contributor: {
      payoutKey: input.payoutKey,
      holdsPayoutKey: input.holdsPayoutKey === true,
    },
  });
  if (!payout.ok) {
    fail(payout.code, "A contributor payout key kills the session. Nothing was written.", {
      keys: authorityKeys(payout.hits),
      requests: 0,
    });
  }
}

function grantWindow(input) {
  const issuedAt = input.now ?? "2026-09-22T16:30:00.000Z";
  const issuedMs = Date.parse(issuedAt);
  const expiresAt = new Date(issuedMs + input.grant.ttlSeconds * 1000).toISOString();
  return { issuedAt, expiresAt, nowMs: issuedMs };
}

function refuseGrantPolicy(input, window) {
  if (input.grant.revoked) {
    fail("grant_revoked", "The local grant is revoked. No result was submitted and no receipt was written.", {
      paymentAuthority: false,
      entitlement: false,
    });
  }
  if (window.nowMs >= Date.parse(window.expiresAt)) {
    fail("grant_expired", "The local grant is expired. Expiry is caller policy, not a kernel lease.", {
      issuedAt: window.issuedAt,
      expiresAt: window.expiresAt,
      paymentAuthority: false,
    });
  }
}

function scanTree(dir, secrets) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(dir);
  for (const path of files) {
    if (path.endsWith(`${join("grant", "contributor.token")}`) || path.endsWith("/contributor.token")) continue;
    const text = readFileSync(path, "utf8");
    for (const secret of secrets) {
      if (secret && text.includes(secret)) {
        fail("secret_leak", "refusing to write a receipt that contains a credential", { file: relative(dir, path) });
      }
    }
  }
}

function publicDispute(receipt) {
  return {
    separateFromSubmission: true,
    reviewsSubmittedResult: false,
    ok: receipt.ok,
    taskId: receipt.taskId,
    termsVersion: receipt.termsVersion,
    appealId: receipt.appealId,
    resolver: receipt.resolver,
    writerResolved: receipt.writerResolved,
    finalDecision: receipt.finalDecision,
    appealStatus: receipt.appealStatus,
    owedInferred: false,
    nextAction: receipt.nextAction,
    kernelClass: receipt.kernelClass,
    provenance: receipt.provenance,
    townSquare: false,
    nonpaying: true,
    financials: {
      payoutState: "none",
      transfer: null,
      paid: false,
      settled: false,
    },
    paymentAuthority: false,
    entitlement: false,
    meansPayout: false,
    decisionPin: DECISION_LIBRARY.pin,
    decisionCopiedIntoProductTree: false,
  };
}

async function loadTermsApi() {
  return import("../../terms-lifecycle/src/index.ts");
}

async function loadSessionApi() {
  const owner = await import("../../contributor-session-grant/src/owner.mjs");
  const contributor = await import("../../contributor-session-grant/src/contributor.mjs");
  const adapter = await import("../../contributor-session-grant/src/adapters/earned-work.mjs");
  const fixture = await import("../../contributor-session-grant/tests/fixture-http.mjs");
  return { owner, contributor, adapter, fixture };
}

async function loadDecision(input) {
  if (input.decisionRoot === null) {
    fail("missing_dependency", "W3-01 requester-decision is not on this checkout. The dispute state was not invented.", {
      ...DECISION_LIBRARY,
      requests: 0,
    });
  }
  const { loadDecisionAdapter } = await import("../../dispute-experience/src/adapters/decision.ts");
  const root = typeof input.decisionRoot === "string" ? resolveRepoPath(input.decisionRoot, "decisionRoot") : undefined;
  try {
    return await loadDecisionAdapter(root);
  } catch (error) {
    fail("missing_dependency", "The pinned requester-decision library did not load. No dispute outcome was invented.", {
      ...DECISION_LIBRARY,
      libraryCode: error && typeof error === "object" && "code" in error ? error.code : "load_failed",
      requests: 0,
    });
  }
}

function refuseDoubleEarn(api, bundle, agreement) {
  const reservation = agreement.reservations[0];
  if (!reservation?.id || typeof reservation.amount !== "string") {
    fail("malformed_input", "fixture has no reserved amount to probe");
  }
  const once = api.recordEarnedAward(agreement, {
    amount: reservation.amount,
    actor: bundle.contributor,
    reservationId: reservation.id,
  });
  try {
    api.recordEarnedAward(once, {
      amount: reservation.amount,
      actor: bundle.contributor,
      reservationId: reservation.id,
    });
  } catch (error) {
    fail("double_earn", "A second award against the same reservation is refused. The in-memory first award was discarded and is not entitlement, earned money, or a payout.", {
      libraryCode: error && typeof error === "object" && "code" in error ? error.code : "invalid_input",
      persisted: false,
      entitlement: false,
      paymentAuthority: false,
      paid: false,
      settled: false,
      payout: null,
    });
  }
  fail("double_earn", "The terms library accepted a second award. Nothing was written.", {
    persisted: false,
    paymentAuthority: false,
  });
}

export async function runLifecycle(input, { outDir, env = process.env } = {}) {
  if (typeof outDir !== "string" || outDir.trim() === "") fail("malformed_input", "--out is required");
  assertCallerMayStart(env);
  validateShape(input);
  assertNoPaymentRequest(input);
  await assertKernelNotContacted(input);

  const termsPath = resolveRepoPath(
    input.termsFixture ?? "packs/terms-lifecycle/fixtures/ok-agreement.json",
    "termsFixture",
  );
  const disputePath = resolveRepoPath(
    input.disputeFixture ?? "packs/dispute-experience/fixtures/ok.json",
    "disputeFixture",
  );
  const terms = await loadTermsApi();
  const bundle = terms.readAgreementFixture(termsPath, TERMS_ROOT);
  const agreement = terms.createAgreement(bundle.terms, {
    requester: bundle.requester,
    contributor: bundle.contributor,
    labelling: bundle.labelling,
  });
  if (bundle.labelling !== "fixture" || agreement.provenance !== "fixture") {
    fail("malformed_input", "terms fixture must stay labelled fixture");
  }
  const reward = agreement.currentTerms?.reward;
  if (!reward || typeof reward.amount !== "string") fail("malformed_input", "reward amount must be a decimal string");
  const principal = bundle.contributor.id;
  const submitAs = input.submitAs ?? principal;
  if (submitAs !== principal) {
    fail("different_principal", "The submitting principal is not the principal on the task terms. No grant was issued.", {
      termsPrincipal: principal,
      submitAs,
      paymentAuthority: false,
    });
  }
  if (input.submitTermsVersion && input.submitTermsVersion !== agreement.termsVersion) {
    fail("terms_changed", "The submitted terms version is not the inspected terms version. The old hash still binds. No grant was issued.", {
      inspected: agreement.termsVersion,
      submitted: input.submitTermsVersion,
      paymentAuthority: false,
    });
  }
  const window = grantWindow(input);
  refuseGrantPolicy(input, window);
  if (input.probe === "double-earn") refuseDoubleEarn(terms, bundle, agreement);

  const decision = await loadDecision(input);
  const { runJourney } = await import("../../dispute-experience/src/journey.ts");

  try {
    statSync(outDir);
    fail("malformed_input", "--out already exists");
  } catch (error) {
    if (error instanceof LifecycleCallerError) throw error;
    if (error?.code !== "ENOENT") throw error;
  }

  const ownerToken = `fixture_owner_${randomBytes(18).toString("base64url")}`;
  const session = await loadSessionApi();
  const http = session.fixture.createFixtureEarnedWorkServer({ ownerToken });
  let listening;
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  try {
    listening = await http.listen();
    const adapter = session.adapter.createEarnedWorkHttpAdapter({
      baseUrl: listening.baseUrl,
      evidenceClass: "fixture",
    });
    const cleanEnv = {};
    const taskDir = join(outDir, "session", "task");
    mkdirSync(taskDir, { recursive: true, mode: 0o700 });
    const prepared = await session.owner.prepareReservedTask({
      adapter,
      ownerToken,
      outDir: taskDir,
      taskBody: {
        title: "fixture lifecycle task",
        provenance: "fixture",
        terms: { note: "caller binds the inspected hash; this fixture task is not the terms document" },
      },
    });
    const grantDir = join(outDir, "session", "grant");
    const issued = await session.owner.issueContributorSession({
      adapter,
      ownerToken,
      outDir: grantDir,
      contributorPublicId: principal,
      taskId: prepared.taskId,
      provenance: "fixture",
    });
    const claimed = await session.contributor.claimWithSessionFile({
      adapter,
      tokenFile: issued.tokenFile,
      stateDir: join(outDir, "session", "claim"),
      taskId: prepared.taskId,
      termsVersion: agreement.termsVersion,
      env: cleanEnv,
      extraSecrets: [ownerToken],
    });
    const libraryJourney = terms.runJourney(termsPath, TERMS_ROOT);
    const dispute = await runJourney(disputePath, DISPUTE_ROOT, {
      decision,
      resolution: input.disputeResolution ?? "affirmed",
    });
    const disputeView = publicDispute(dispute);
    if (disputeView.financials.paid !== false || disputeView.owedInferred !== false) {
      fail("no_payment_authority", "dispute view claimed payment");
    }
    const receipt = {
      schema: RECEIPT_SCHEMA,
      ok: true,
      synthetic: true,
      provenance: "fixture",
      labelledDemo: true,
      paymentAuthority: false,
      deskPaymentAuthority: "none",
      entitlement: false,
      earnedMoney: false,
      paid: false,
      settled: false,
      payout: null,
      deployment: false,
      kernelContacted: false,
      kernel: missingKernelAcceptance(REPO_ROOT),
      decisionLibrary: DECISION_LIBRARY,
      terms: {
        taskId: agreement.currentTerms.taskId,
        termsVersion: agreement.termsVersion,
        hash: agreement.hash,
        provenance: agreement.provenance,
        fundingState: agreement.currentTerms.fundingState,
        execute: agreement.currentTerms.execute,
        reward: { amount: reward.amount, asset: reward.asset },
        artifactRef: agreement.currentTerms.artifact?.ref ?? null,
        artifactFetched: false,
        entitlement: false,
        paymentAuthority: false,
      },
      termsLifecycle: {
        ...libraryJourney,
        meansEntitlement: false,
        meansEarnedMoney: false,
        meansPayout: false,
        note: "earned-survives-cancel is the fixture state machine. It is not an entitlement, a balance, or a payout.",
      },
      grant: {
        evidenceClass: "fixture",
        kernelExpiresAt: issued.expiresAt ?? null,
        callerIssuedAt: window.issuedAt,
        callerExpiresAt: window.expiresAt,
        revoked: false,
        expirySource: "caller-policy",
        principal,
        tokenHash: issued.tokenHash,
        tokenFingerprint: issued.tokenFingerprint,
        tokenFile: "session/grant/contributor.token",
        plaintextInReceipt: false,
      },
      claim: {
        taskId: prepared.taskId,
        fixtureTaskTermsVersion: prepared.termsVersion,
        claimedTermsVersion: agreement.termsVersion,
        reservationStatus: claimed.reservationStatus,
        lifecycle: claimed.lifecycle,
        evidenceClass: "fixture",
        usedOwnerToken: false,
      },
      submission: {
        kind: "fixture-result",
        termsVersion: agreement.termsVersion,
        principal,
        artifactDigest: input.result.artifactDigest,
        note: input.result.note,
        grantFingerprint: issued.tokenFingerprint,
        earned: false,
        accepted: false,
        entitlement: false,
        paymentAuthority: false,
        paid: false,
        settled: false,
        payout: null,
        deployment: false,
      },
      dispute: disputeView,
    };
    const secrets = [ownerToken, listening.plantedContributorToken];
    const receiptPath = join(outDir, "receipt.json");
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 });
    scanTree(outDir, secrets);
    const tokenStat = statSync(join(outDir, "session/grant/contributor.token"));
    if ((tokenStat.mode & 0o077) !== 0) fail("secret_leak", "contributor token file is not private");
    return receipt;
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  } finally {
    if (listening) await listening.close();
  }
}

export function errorBody(error) {
  const body = {
    ok: false,
    schema: RECEIPT_SCHEMA,
    code: error instanceof LifecycleCallerError ? error.code : "malformed_input",
    message: error instanceof Error ? error.message : "caller failed",
    paymentAuthority: false,
    entitlement: false,
    paid: false,
    settled: false,
    payout: null,
    deployment: false,
  };
  if (error instanceof LifecycleCallerError && error.details && typeof error.details === "object") {
    body.details = error.details;
  }
  return body;
}

function helpText() {
  return [
    "contributor lifecycle caller",
    "Inspect fixture terms, obtain a local fixture grant, submit one fixture result,",
    "and read a separate dispute fixture. Completion is not entitlement, payment, or deployment.",
    "",
    "node packs/contributor-desk/bin/lifecycle.mjs --input packs/contributor-desk/fixtures/lifecycle-caller.json --out DIR",
    "",
    "Exit 0 writes DIR/receipt.json. Exit 2 writes nothing.",
  ].join("\n");
}

export async function runLifecycleCli(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = argv.slice(2);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    stdout.write(`${helpText()}\n`);
    return 0;
  }
  let inputPath;
  let outDir;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--input") inputPath = args[++i];
    else if (arg === "--out") outDir = args[++i];
    else {
      stderr.write(`${JSON.stringify(errorBody(new LifecycleCallerError("malformed_input", `unknown argument ${arg}`)))}\n`);
      return 2;
    }
    if (args[i] == null) {
      stderr.write(`${JSON.stringify(errorBody(new LifecycleCallerError("malformed_input", `${arg} needs a value`)))}\n`);
      return 2;
    }
  }
  if (!inputPath || !outDir) {
    stderr.write(`${JSON.stringify(errorBody(new LifecycleCallerError("malformed_input", "--input and --out are required")))}\n`);
    return 2;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(inputPath)) {
    stderr.write(`${JSON.stringify(errorBody(new LifecycleCallerError("malformed_input", "refusing to fetch a URL", { requests: 0 })))}\n`);
    return 2;
  }
  let input;
  try {
    input = JSON.parse(readFileSync(inputPath, "utf8"));
  } catch {
    stderr.write(`${JSON.stringify(errorBody(new LifecycleCallerError("malformed_input", "input is not JSON")))}\n`);
    return 2;
  }
  try {
    const receipt = await runLifecycle(input, { outDir, env });
    stdout.write(`${JSON.stringify(receipt)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify(errorBody(error))}\n`);
    return 2;
  }
}

export const PATHS = Object.freeze({ REPO_ROOT, TERMS_ROOT, DISPUTE_ROOT, SESSION_ROOT });
