import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { persistResult, runRecipe } from "../lib/run.mjs";
import {
  exportLocalNeomorphicImport,
  previewLocalNeomorphicImport,
} from "../neomorphic-import/local.mjs";
import { exportReuse, previewReuse } from "../../result-reuse/src/export.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const cli = join(root, "cli.mjs");
const priors = (...parts) => join(root, "fixtures", "priors", ...parts);
const current = (...parts) => join(root, "fixtures", "current", ...parts);
const issues = (...parts) => join(root, "fixtures", "issues", ...parts);
const CLOCK = "2026-09-09T16:00:00.000Z";

const PAID_RECEIPT = "rcpt_fixture_do_not_replay";
const PAID_AUTH = "auth_fixture_do_not_replay";
const CANDIDATE_AUTH = "auth_should_not_auto_replay";

const PAYMENT_SECRETS = Object.freeze({
  stripeLive: "sk_live_51RecipeExportLeakAAAA",
  paySig: "PAYMENT-SIGNATURE: eyJhbGciOiJyZWNpcGUtZXhwb3J0In0",
  xpay: "X-PAYMENT: eyJ4NDAyIjoicmVjaXBlLWV4cG9ydCJ9",
  pem: "-----BEGIN EC PRIVATE KEY-----\nMIIRecipeExportLeak\n-----END EC PRIVATE KEY-----",
  webhook: "whsec_recipeExportLeakBBBB",
});

function neoOptions(taskId, extra = {}) {
  return {
    taskId,
    subject: `${taskId}-result`,
    sequence: 1,
    clock: CLOCK,
    ...extra,
  };
}

function assertNoSecretValues(value, secrets) {
  const blob = JSON.stringify(value);
  for (const secret of secrets) {
    assert.equal(blob.includes(secret), false, `leaked ${secret.slice(0, 24)}`);
  }
}

function assertExportBoundary(value) {
  const blob = JSON.stringify(value);
  assert.equal(blob.includes(PAID_RECEIPT), false);
  assert.equal(blob.includes(PAID_AUTH), false);
  assert.equal(blob.includes(CANDIDATE_AUTH), false);
  assert.equal(blob.includes("sk_live_"), false);
  assert.equal(blob.includes("whsec_"), false);
  assert.equal(blob.includes("BEGIN "), false);
  assert.equal(/PAYMENT-SIGNATURE/i.test(blob), false);
  assert.equal(/X-PAYMENT\s*:/i.test(blob), false);
  for (const secret of Object.values(PAYMENT_SECRETS)) {
    assert.equal(blob.includes(secret), false);
  }
}

test("Neomorphic preview of a recipe result is local, execute:false, and credential-free", async () => {
  const result = await runRecipe("issue-to-work-brief", {
    priorPath: priors("issue-brief.prior.json"),
    issueFixturePath: issues("samedaydesk-1.json"),
    clock: CLOCK,
  });
  const preview = previewLocalNeomorphicImport(result, neoOptions("owner-qa-issue-1"));
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.importMode, "local_filesystem");
  assert.equal(preview.sharedMode, "undeployed_not_fabricated");
  assert.equal(preview.observation.execute, false);
  assert.equal(preview.publicSafeCertified, false);
  assert.equal(preview.observation.payload.payment, undefined);
  assert.equal(preview.observation.payload.charged, undefined);
  assertExportBoundary(preview);
});

test("paid-prior recipe results and persistResult never copy receipt or authorization ids", async () => {
  const blocked = await runRecipe("source-change-alert", {
    priorPath: priors("source-change-paid.prior.json"),
    currentFixturePath: current("example-unchanged.json"),
    replayPayment: true,
    clock: CLOCK,
  });
  assert.equal(blocked.outcome, "error");
  assert.equal(blocked.evidence.code, "payment_replay_blocked");
  assertExportBoundary(blocked);

  const dir = mkdtempSync(join(tmpdir(), "s33-s06-persist-"));
  try {
    const persisted = persistResult(blocked, { outDir: dir, writeArtifact: true });
    assert.equal(persisted.ok, true);
    const report = JSON.parse(readFileSync(persisted.reportPath, "utf8"));
    assertExportBoundary(report);
    const artifact = JSON.parse(readFileSync(persisted.artifact.path, "utf8"));
    assert.deepEqual(artifact.payment, { attempted: false });
    assertExportBoundary(artifact);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const preview = previewLocalNeomorphicImport(blocked, neoOptions("paid-prior"));
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.observation.execute, false);
  assertExportBoundary(preview);

  const denied = exportLocalNeomorphicImport(blocked, neoOptions("paid-prior"));
  assert.equal(denied.ok, false);
  assert.match(denied.message, /opt-in/);

  const exported = exportLocalNeomorphicImport(blocked, neoOptions("paid-prior", { optIn: true }));
  assert.equal(exported.ok, true, exported.message);
  assert.equal(exported.mode, "export");
  assert.equal(exported.observation.execute, false);
  assertExportBoundary(exported.observation);
});

test("page-change and extract-batch pass-through exports omit payment credentials", () => {
  const brief = JSON.parse(
    readFileSync(join(repoRoot, "tools/result-reuse/fixtures/accepted-page-change.json"), "utf8"),
  );
  brief.report.claims.payment = {
    receiptId: PAID_RECEIPT,
    authorizationId: PAID_AUTH,
    stripeKey: PAYMENT_SECRETS.stripeLive,
    "PAYMENT-SIGNATURE": PAYMENT_SECRETS.paySig,
  };
  brief.report.summary.note = PAYMENT_SECRETS.webhook;
  brief.report.verdict = PAYMENT_SECRETS.paySig;

  const preview = previewLocalNeomorphicImport(brief, neoOptions("hostile-brief"));
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.adapted, false);
  assert.equal(preview.observation.execute, false);
  assert.equal(preview.observation.payload.claims.payment, undefined);
  assert.equal(preview.observation.payload.claims.paymentImpliesUsefulOutput, false);
  assertExportBoundary(preview);

  const batch = JSON.parse(
    readFileSync(join(repoRoot, "tools/result-reuse/fixtures/accepted-extract-batch.json"), "utf8"),
  );
  batch.sources[0].data.title = `Offer ${PAYMENT_SECRETS.stripeLive}`;
  batch.sources[0].data.description = PAYMENT_SECRETS.pem;
  batch.authorizationId = CANDIDATE_AUTH;
  batch.payment = { receiptId: PAID_RECEIPT, charged: true };
  const batchPreview = previewLocalNeomorphicImport(batch, neoOptions("hostile-batch", { select: ["title", "description"] }));
  assert.equal(batchPreview.ok, true, batchPreview.message);
  assert.equal(batchPreview.observation.payload.sources[0].title, "[omitted]");
  assert.equal(batchPreview.observation.payload.payment, undefined);
  assertExportBoundary(batchPreview);

  const reuse = previewReuse(brief, neoOptions("reuse-brief"));
  assert.equal(reuse.ok, true, reuse.message);
  assertExportBoundary(reuse);
  const exported = exportReuse(batch, neoOptions("reuse-batch", { select: ["title", "description"], optIn: true }));
  assert.equal(exported.ok, true, exported.message);
  assertExportBoundary(exported.observation);
});

test("CLI neomorphic preview of payment-replay candidate does not echo credentials", () => {
  const proc = spawnSync(
    process.execPath,
    [
      cli,
      "--recipe",
      "verification-reconcile",
      "--prior",
      priors("verify.prior.json"),
      "--candidate",
      current("verify-candidate-payment-replay.json"),
      "--clock",
      CLOCK,
      "--neomorphic-preview",
      "--task-id",
      "verify-pay",
      "--subject",
      "verify-pay-result",
      "--sequence",
      "1",
    ],
    { encoding: "utf8", cwd: repoRoot },
  );
  assert.equal(proc.status, 1, proc.stderr || proc.stdout);
  const body = JSON.parse(proc.stdout);
  assert.equal(body.outcome, "error");
  assert.equal(body.evidence.kind, "payment_replay_blocked");
  assert.equal(body.neomorphic.ok, true, body.neomorphic?.message);
  assert.equal(body.neomorphic.observation.execute, false);
  assertExportBoundary(body);
  assertNoSecretValues(body, [CANDIDATE_AUTH, "autoReplayPayment"]);
});

test("buyer-setup neo export keeps hostile 402 payment headers out of the observation", async () => {
  const result = await runRecipe("buyer-setup-trace", {
    clock: CLOCK,
    scheduleHint: "once",
    gatewayOrigin: "https://agents.samedaydesk.com",
    fetchImpl: async () => ({
      ok: false,
      status: 402,
      headers: {
        get(name) {
          const key = String(name).toLowerCase();
          if (key === "www-authenticate") return `Payment ${PAYMENT_SECRETS.paySig}`;
          if (key === "payment-required") return PAYMENT_SECRETS.xpay;
          if (key === "content-type") return "application/json";
          return null;
        },
      },
      text: async () =>
        JSON.stringify({
          error: "Payment Required",
          authorization: `Bearer tok_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
          privateKey: PAYMENT_SECRETS.pem,
          stripeKey: PAYMENT_SECRETS.stripeLive,
        }),
    }),
  });
  assert.equal(result.payment.signed, false);
  assert.equal(result.evidence.claims.paymentSigned, false);

  const preview = previewLocalNeomorphicImport(result, neoOptions("buyer-setup"));
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.observation.execute, false);
  assertExportBoundary(preview);

  const dir = mkdtempSync(join(tmpdir(), "s33-s06-buyer-"));
  try {
    const out = join(dir, "observation.json");
    const exported = exportLocalNeomorphicImport(result, neoOptions("buyer-setup", { optIn: true }));
    assert.equal(exported.ok, true, exported.message);
    writeFileSync(out, `${JSON.stringify(exported.observation, null, 2)}\n`);
    assertExportBoundary(JSON.parse(readFileSync(out, "utf8")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("client for-agents copy does not embed payment credentials", () => {
  const files = [
    join(repoRoot, "client/src/pages/ForAgents.tsx"),
    join(repoRoot, "client/src/data/machineEntry.mjs"),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("sk_live_"), false, file);
    assert.equal(text.includes("sk_test_"), false, file);
    assert.equal(text.includes("whsec_"), false, file);
    assert.equal(text.includes("BEGIN PRIVATE KEY"), false, file);
    assert.equal(text.includes("CUSTOMER_X402_PRIVATE_KEY"), false, file);
    assert.doesNotMatch(text, /PAYMENT-SIGNATURE\s*:/);
    assert.doesNotMatch(text, /X-PAYMENT\s*:/);
    assert.match(text, /opt-in/);
  }
});
