#!/usr/bin/env node
// One objective task over the existing w821 unpaid-matrix contract.
// Terms are frozen before claim. The contract checker is the verifier.
// A naive "unpaid, so accept" reading is not acceptance. No cash moves.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRecord } from "../../tools/verify-sds/w821-402-matrix/lib.mjs";

const CONTRACT = "samedaydesk.w821-402-matrix.unpaid.v1";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EVIDENCE = path.resolve(
  HERE,
  "../../tools/verify-sds/w821-402-matrix/fixtures/invalid/forged-settle.json",
);
const REWARD = { amount: "0.10", asset: "USDC", network: "base" };

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return "";
  return process.argv[index + 1];
}

async function json(baseUrl, route, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { status: response.status, body };
}

function contributorChild(baseUrl, tokenFile, taskId, evidencePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(HERE, "ordinary-contributor.mjs"),
      "--base-url", baseUrl,
      "--token-file", tokenFile,
      "--task", taskId,
      "--evidence-file", evidencePath,
      "--mode", "submit",
    ], {
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function runObjectiveTask({
  baseUrl,
  ownerToken,
  evidencePath = DEFAULT_EVIDENCE,
} = {}) {
  if (!baseUrl || !ownerToken) throw new Error("objective task requires baseUrl and ownerToken");
  const evidence = readFileSync(evidencePath);
  const contract = evaluateRecord(JSON.parse(evidence.toString("utf8")));
  const digest = createHash("sha256").update(evidence).digest("hex");
  const stamp = randomBytes(3).toString("hex");
  const summary = [
    `Objective check of ${CONTRACT}.`,
    "Verifier is evaluateRecord.honestVerdict.",
    "A naive unpaid label is not acceptance and is not the desired business outcome.",
    "Reward hypothesis 0.10 USDC is not cash and is not a funded claim.",
  ].join(" ");
  const created = await json(baseUrl, "/v1/tasks", {
    method: "POST",
    token: ownerToken,
    idempotencyKey: `objective-create-${stamp}`,
    body: JSON.stringify({
      title: `w821 forged-settle check ${stamp}`,
      summary,
      provenance: "test",
      reward: REWARD,
      budget: REWARD,
      terms: {
        summary,
        claimTtlSeconds: 3600,
        maxArtifactBytes: 8192,
        allowedMediaTypes: ["application/json"],
        slotLimit: 1,
      },
    }),
  });
  if (created.status !== 201) {
    throw new Error(`objective task create failed: ${created.status}`);
  }
  const frozenTermsVersion = created.body.task.termsVersion;
  const taskId = created.body.task.id;
  const reserved = await json(baseUrl, `/v1/tasks/${taskId}/funding/reserve`, {
    method: "POST",
    token: ownerToken,
    idempotencyKey: `objective-reserve-${stamp}`,
    body: "{}",
  });
  if (reserved.status !== 200) throw new Error(`objective reserve failed: ${reserved.status}`);
  const grant = await json(baseUrl, "/v1/contributor-tokens", {
    method: "POST",
    token: ownerToken,
    body: JSON.stringify({
      contributorPublicId: `cold-${stamp}`,
      provenance: "test",
      taskId,
    }),
  });
  if (grant.status !== 201) throw new Error(`objective grant failed: ${grant.status}`);
  const dir = mkdtempSync(path.join(tmpdir(), "earned-objective-"));
  const tokenFile = path.join(dir, "grant.txt");
  try {
    writeFileSync(tokenFile, `${grant.body.token}\n`, { mode: 0o600 });
    const child = await contributorChild(baseUrl, tokenFile, taskId, evidencePath);
    if (child.code !== 0) {
      throw new Error(`cold contributor exit ${child.code}: ${child.stderr.trim()}`);
    }
    const submitted = JSON.parse(child.stdout.trim());
    const viewed = await json(baseUrl, `/v1/tasks/${taskId}`, { token: ownerToken });
    if (viewed.status !== 200) throw new Error(`objective readback failed: ${viewed.status}`);
    const artifact = viewed.body?.task?.submission?.artifact;
    if (viewed.body.task.payoutState !== "none") {
      throw new Error("objective task payout state changed without an accept");
    }
    return {
      schema: "samedaydesk.earned-receiving.objective-task.v1",
      contract: CONTRACT,
      termsFrozenBeforeClaim: submitted.termsVersion === frozenTermsVersion,
      termsVersion: frozenTermsVersion,
      taskId,
      submissionId: submitted.submissionId,
      digestMatchesRetrievedArtifact: artifact?.digestSha256 === digest,
      naiveVerdict: contract.naiveVerdict,
      contractVerdict: contract.honestVerdict,
      contractCodes: contract.codes,
      desiredBusinessOutcomeIsVerifier: false,
      rewardHypothesis: REWARD,
      fundingState: viewed.body.task.fundingState,
      fundingIsCash: false,
      payoutState: viewed.body?.task?.payoutState ?? null,
      paid: false,
      settled: false,
      transfer: null,
      cashMoved: false,
      fundedRewardClaim: false,
      authorizedSpendUsdc: "0.00",
      contributorHadDatabaseUrl: false,
      contributorHadOwnerToken: false,
      publicReachability: false,
      sourceCheckEstablishesPublicReachability: false,
      submittedOk: submitted.ok === true && submitted.paid === false && submitted.transfer === null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const baseUrl = arg("--base-url");
  const ownerToken = process.env.EARNED_WORK_OWNER_TOKEN || "";
  if (!baseUrl || !ownerToken) {
    console.error("usage: EARNED_WORK_OWNER_TOKEN=… node server/earned-work/objective-task.mjs --base-url URL");
    process.exit(2);
  }
  const receipt = await runObjectiveTask({
    baseUrl,
    ownerToken,
    evidencePath: arg("--evidence-file") || DEFAULT_EVIDENCE,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exit(receipt.contractVerdict === "reject" && receipt.submittedOk ? 0 : 3);
}
