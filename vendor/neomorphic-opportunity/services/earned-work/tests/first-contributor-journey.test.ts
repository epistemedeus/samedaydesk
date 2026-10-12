import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { REPRODUCTION_VERIFIER_VERSION } from "../src/reproduction-verifier.js";
import { hashTermsVersion } from "@neomorphic/funded-task-terms/hash";
import {
  OWNER_TOKEN,
  createReservedTask,
  databaseUrl,
  dropSchema,
  json,
  key,
  uniqueSchema,
} from "./helpers.js";

const kernelRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(kernelRoot, "../..");
const e18Root = path.join(repoRoot, "experiments/wave5/e18");
const e06Bin = path.join(repoRoot, "packs/contributor-walletless-job/bin/first-job.mjs");
const e09Bin = path.join(repoRoot, "packs/requester-decision-desk/bin/requester-decision-desk.mjs");
const e09Root = path.join(repoRoot, "packs/requester-decision-desk");
const e07Bin = path.join(repoRoot, "packs/contributor-session-grant/bin/contributor-session-grant.mjs");
const e03Cli = path.join(repoRoot, "packs/job-resume/bin/job-resume.mjs");
const e03SubmitDrop = path.join(repoRoot, "packs/job-resume/scripts/submit-drop-response.mjs");
const submissions = path.join(e18Root, "fixtures/submissions");
const f17Fixture = path.join(repoRoot, "packs/requester-terms-assent/fixtures/ok-terms.json");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function spawnCompiled(port: number, schema: string): ChildProcess {
  return spawn(process.execPath, ["dist/index.js"], {
    cwd: kernelRoot,
    env: {
      ...process.env,
      PORT: String(port),
      EARNED_WORK_PG_SCHEMA: schema,
      EARNED_WORK_DATABASE_URL: databaseUrl(),
      EARNED_WORK_OWNER_TOKEN: OWNER_TOKEN,
      EARNED_WORK_POOL_MAX: "4",
      EARNED_WORK_RATE_LIMIT_MAX: "10000",
      EARNED_WORK_VERIFIER: "reproduction",
      EARNED_WORK_REPRODUCTION_ROOT: e18Root,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitListening(child: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`compiled kernel exited ${child.exitCode}: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        const body = (await response.json()) as { ok: boolean; store: string };
        if (body.ok === true && body.store === "postgres") return;
      }
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`compiled kernel did not reach healthz: ${stderr}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function evidenceFrom(buf: Buffer, ref: string) {
  return {
    buf,
    evidenceBase64: buf.toString("base64"),
    artifact: {
      ref,
      digestSha256: createHash("sha256").update(buf).digest("hex"),
      mediaType: "application/json",
      bytes: buf.byteLength,
    },
  };
}

function fileEvidence(name: string) {
  const filePath = path.join(submissions, name);
  return { filePath, ...evidenceFrom(readFileSync(filePath), `inline:reproduction-evidence:${name}`) };
}

function freshEvidence() {
  const template = JSON.parse(readFileSync(path.join(submissions, "valid-reproduction.json"), "utf8")) as {
    id: string;
    cases: Array<{ engine: string; input: { preexistingOutputs: Array<{ name: string; body: string }> } }>;
  };
  template.id = `fresh-${randomBytes(8).toString("hex")}`;
  const preexisting = template.cases[0]?.input.preexistingOutputs[0];
  if (preexisting) {
    preexisting.body = `fresh-contributor-${randomBytes(4).toString("hex")} preexisting notes.md\n`;
  }
  const buf = Buffer.from(`${JSON.stringify(template, null, 2)}\n`);
  const dir = mkdtempSync(path.join(tmpdir(), "e01-evidence-"));
  const filePath = path.join(dir, "fresh-reproduction.json");
  writeFileSync(filePath, buf);
  return { filePath, ...evidenceFrom(buf, "inline:reproduction-evidence") };
}

function spawnCli(
  argv: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      let payload: unknown = stdout;
      try {
        payload = JSON.parse(stdout);
      } catch {
        payload = stdout;
      }
      resolve({ code: code ?? 1, stdout, stderr, payload });
    });
  });
}

function contributorEnv(baseUrl: string): NodeJS.ProcessEnv {
  const env = { ...process.env, EARNED_WORK_BASE_URL: baseUrl };
  delete env.EARNED_WORK_OWNER_TOKEN;
  delete env.EARNED_WORK_OWNER_BEARER;
  return env;
}

test(
  "compiled first-contributor journey: discover→assent→reserve→useful case→verify→accepted→owed",
  { timeout: 240_000 },
  async () => {
    rmSync(path.join(kernelRoot, "dist"), { recursive: true, force: true });
    execFileSync("npm", ["run", "build"], { cwd: kernelRoot, stdio: "inherit" });
    assert.equal(existsSync(path.join(kernelRoot, "dist/index.js")), true);
    if (!existsSync(path.join(e09Root, "node_modules/tsx"))) {
      execFileSync("npm", ["ci"], { cwd: e09Root, stdio: "inherit" });
    }

    const {
      assent,
      createAssentStore,
      claimWithAssent,
      createF01HttpClient,
      mapDisclosureToKernel,
      overlayDisclosureReward,
      showTermsCard,
    } = await import("../../../packs/requester-terms-assent/src/index.mjs");
    const { createContributorState, readStateFile } = await import("../../../packs/job-resume/src/index.mjs");
    const { createEarnedWorkSdk } = await import("../../../packs/earned-work-sdk/src/index.mjs");

    const spec = JSON.parse(
      execFileSync(process.execPath, [path.join(e18Root, "bin/e18-repro.mjs"), "spec"], {
        cwd: e18Root,
        encoding: "utf8",
      }),
    ) as { specDigest: string };
    const runtimeAuth = JSON.parse(
      execFileSync(process.execPath, [path.join(e18Root, "bin/e18-repro.mjs"), "runtime-digest"], {
        cwd: e18Root,
        encoding: "utf8",
      }),
    ) as { runtimeDigest: string };
    const boundSummary = `SDS52 historical workflow trial, not new bug discovery. e18.specDigest:${spec.specDigest} e18.runtimeDigest:${runtimeAuth.runtimeDigest}`;

    const schema = uniqueSchema();
    const port = await freePort();
    const child = spawnCompiled(port, schema);
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      await waitListening(child, port);

      const valid = freshEvidence();
      const sds = await createReservedTask(baseUrl, {
        title: "First contributor SDS52 stale outDir",
        summary: boundSummary,
        terms: {
          summary: boundSummary,
          claimTtlSeconds: 3600,
          maxArtifactBytes: 4096,
          allowedMediaTypes: ["text/plain", "application/json"],
          slotLimit: 1,
        },
      });
      const pub = await json(baseUrl, `/v1/tasks/${sds.taskId}`);
      const kernelDoc = (pub.body as { task: { termsDocument: Record<string, unknown>; termsVersion: string; reward: { amount: string; asset: string; network: string } } }).task.termsDocument;
      assert.equal(kernelDoc.schema, "neomorphic.earned-work.terms.v1");
      assert.equal((pub.body as { task: { termsVersion: string } }).task.termsVersion, sds.termsVersion);

      const f17 = JSON.parse(readFileSync(f17Fixture, "utf8")) as Record<string, unknown>;
      f17.taskId = sds.taskId;
      const disclosureTerms = overlayDisclosureReward(f17, {
        amount: "0.10",
        asset: "USDC",
        network: "base",
      });
      const card = await showTermsCard(disclosureTerms);
      assert.notEqual(card.documentHash, sds.termsVersion);
      const mapping = mapDisclosureToKernel({
        disclosureHash: card.documentHash,
        disclosureReward: card.fields.reward,
        kernelTermsVersion: sds.termsVersion,
        kernelTermsDocument: kernelDoc,
        hashTermsVersion,
      });
      assert.equal(mapping.hashesEqual, false);
      assert.equal(mapping.kernelHash, sds.termsVersion);

      const ownerTokenFile = path.join(mkdtempSync(path.join(tmpdir(), "e07-owner-")), "owner.token");
      writeFileSync(ownerTokenFile, `${OWNER_TOKEN}\n`, { mode: 0o600 });
      const grantOut = mkdtempSync(path.join(tmpdir(), "e07-grant-"));
      const issued = await spawnCli(
        [
          e07Bin,
          "--role",
          "owner",
          "issue",
          "--base-url",
          baseUrl,
          "--owner-token-file",
          ownerTokenFile,
          "--out-dir",
          grantOut,
          "--task-id",
          sds.taskId,
          "--contributor-public-id",
          `e01-contrib-${randomBytes(4).toString("hex")}`,
          "--provenance",
          "test",
        ],
        { cwd: repoRoot, env: { ...process.env, EARNED_WORK_OWNER_TOKEN: OWNER_TOKEN } },
      );
      assert.equal(issued.code, 0, issued.stdout + issued.stderr);
      const grant = issued.payload as { tokenFile: string; contributorPublicId: string };
      const contribToken = readFileSync(grant.tokenFile, "utf8").trim();
      const publicId = grant.contributorPublicId;
      const tokenFile = grant.tokenFile;

      const store = createAssentStore();
      store.recordCard(card);
      assent(store, {
        taskId: card.taskId,
        termsVersion: card.termsVersion,
        digestShown: card.termsVersion,
        actor: { id: "owner-requester", role: "requester" },
        provenance: "test",
        card,
      });
      assent(store, {
        taskId: card.taskId,
        termsVersion: card.termsVersion,
        digestShown: card.termsVersion,
        actor: { id: publicId, role: "contributor" },
        provenance: "test",
        card,
      });
      const f01 = createF01HttpClient({ baseUrl });
      f01.registerSession(contribToken, publicId);
      const claimed = await claimWithAssent({
        store,
        card,
        client: f01,
        contributorSession: { publicId, bearer: contribToken },
        idempotencyKey: key("e05-claim"),
        mapping,
        hashTermsVersion,
      });
      assert.equal(claimed.status, 201);
      assert.equal(claimed.claimTermsVersion, sds.termsVersion);
      assert.equal(claimed.assentedTermsVersion, card.documentHash);
      const reservationId = claimed.claimId;

      const missing = await spawnCli(
        [
          e06Bin,
          "journey",
          "--base-url",
          baseUrl,
          "--contributor-token-file",
          tokenFile,
          "--task-id",
          sds.taskId,
          "--artifact-file",
          path.join(tmpdir(), "e01-missing-artifact.json"),
        ],
        { cwd: repoRoot, env: contributorEnv(baseUrl) },
      );
      assert.equal(missing.code, 1, missing.stdout + missing.stderr);
      assert.equal((missing.payload as { error: { code: string } }).error.code, "missing_artifact");

      const other = await json(baseUrl, "/v1/contributor-tokens", {
        method: "POST",
        token: OWNER_TOKEN,
        body: JSON.stringify({ contributorPublicId: publicId, provenance: "test", taskId: sds.taskId }),
      });
      assert.equal(other.status, 201);
      const otherToken = (other.body as { token: string }).token;
      const stolenSubmit = await json(baseUrl, `/v1/tasks/${sds.taskId}/submissions`, {
        method: "POST",
        token: otherToken,
        idempotencyKey: key("stolen-submit"),
        body: JSON.stringify({
          reservationId,
          artifact: valid.artifact,
          evidenceBase64: valid.evidenceBase64,
        }),
      });
      assert.equal(stolenSubmit.status, 403);

      const stateDir = mkdtempSync(path.join(tmpdir(), "e03-state-"));
      const statePath = path.join(stateDir, "state.json");
      createContributorState({
        statePath,
        taskId: sds.taskId,
        termsVersion: sds.termsVersion,
        contributorPublicId: publicId,
        reservationId,
        phase: "claimed",
        artifact: valid.artifact,
        evidenceBase64: valid.evidenceBase64,
      });
      const drop = spawnSync(process.execPath, [e03SubmitDrop], {
        env: {
          ...contributorEnv(baseUrl),
          JOB_RESUME_STATE_FILE: statePath,
          EARNED_WORK_BASE_URL: baseUrl,
          EARNED_WORK_CONTRIBUTOR_TOKEN: contribToken,
          JOB_RESUME_CONTRIBUTOR_PUBLIC_ID: publicId,
        },
        encoding: "utf8",
      });
      assert.equal(drop.status, 0, drop.stderr || drop.stdout);
      const dropped = JSON.parse(drop.stdout) as { dropped: boolean; journalOperation: string };
      assert.equal(dropped.dropped, true);
      assert.equal(dropped.journalOperation, "createSubmission");
      const afterDrop = readStateFile(statePath);
      assert.equal(afterDrop.journal.outcome, "unknown");
      assert.equal(afterDrop.reservationId, reservationId);

      const inspector = new pg.Client({ connectionString: databaseUrl() });
      await inspector.connect();
      try {
        await inspector.query(`SET search_path TO ${quoteIdent(schema)}`);
        const committed = await inspector.query("SELECT count(*)::int AS n FROM earned_work_submissions WHERE task_id = $1", [
          sds.taskId,
        ]);
        assert.equal(committed.rows[0]?.n, 1);
      } finally {
        await inspector.end();
      }

      const resume = spawnSync(
        process.execPath,
        [e03Cli, "resume", "--state-file", statePath, "--base-url", baseUrl, "--token-file", tokenFile],
        { encoding: "utf8", env: contributorEnv(baseUrl) },
      );
      assert.equal(resume.status, 0, resume.stderr || resume.stdout);
      const resumed = JSON.parse(resume.stdout) as { resumed: boolean; reservationId: string };
      assert.equal(resumed.resumed, true);
      assert.equal(resumed.reservationId, reservationId);

      const ownerView = await json(baseUrl, `/v1/tasks/${sds.taskId}`, { token: OWNER_TOKEN });
      assert.equal((ownerView.body as { task: { lifecycle: string } }).task.lifecycle, "submitted");
      assert.equal((ownerView.body as { task: { submission: { id: string } } }).task.submission.id.length > 0, true);

      const none = await json(baseUrl, `/v1/tasks/${sds.taskId}/contributor-obligation`, { token: contribToken });
      assert.equal(none.status, 200);
      assert.equal((none.body as { readback: string }).readback, "none");

      const ownerOnly = await json(baseUrl, `/v1/tasks/${sds.taskId}/obligation`, { token: contribToken });
      assert.equal(ownerOnly.status, 401);
      const ownerPayout = await json(baseUrl, `/v1/tasks/${sds.taskId}/payout`, { token: contribToken });
      assert.equal(ownerPayout.status, 401);

      const verdict = await json(baseUrl, `/v1/tasks/${sds.taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: key("journey-verdict"),
        body: JSON.stringify({ reservationId }),
      });
      assert.equal(verdict.status, 201, JSON.stringify(verdict.body));
      const pass = (verdict.body as { verdict: { id: string; outcome: string; verifierVersion: string; ordinal: number } }).verdict;
      assert.equal(pass.outcome, "pass");
      assert.equal(pass.verifierVersion, REPRODUCTION_VERIFIER_VERSION);
      assert.equal(pass.ordinal, 1);

      const accept = await spawnCli(
        [
          e09Bin,
          "accept",
          "--base-url",
          baseUrl,
          "--task-id",
          sds.taskId,
          "--reservation-id",
          reservationId,
          "--digest",
          valid.artifact.digestSha256,
          "--verdict-id",
          pass.id,
        ],
        {
          cwd: e09Root,
          env: { ...process.env, EARNED_WORK_OWNER_TOKEN: OWNER_TOKEN },
        },
      );
      assert.equal(accept.code, 0, accept.stdout + accept.stderr);
      const desk = accept.payload as { accepted: boolean; paid: boolean; settled: boolean; transfer: null };
      assert.equal(desk.accepted, true);
      assert.equal(desk.paid, false);
      assert.equal(desk.settled, false);
      assert.equal(desk.transfer, null);

      const sdk = createEarnedWorkSdk({
        baseUrl,
        ownerToken: OWNER_TOKEN,
        contributorToken: contribToken,
      });
      const owed = await sdk.earnedWork.getContributorObligation({ taskId: sds.taskId });
      assert.equal(owed.status, 200, JSON.stringify(owed.body));
      const owedBody = owed.body as {
        readback: string;
        obligation: { verdictId: string; payoutState: string };
        paid: boolean;
        transfer: null;
      };
      assert.equal(owedBody.readback, "owed");
      assert.equal(owedBody.obligation.verdictId, pass.id);
      assert.equal(owedBody.obligation.payoutState, "owed");
      assert.equal(owedBody.paid, false);
      assert.equal(owedBody.transfer, null);

      const payout = await json(baseUrl, `/v1/tasks/${sds.taskId}/payout`, { token: OWNER_TOKEN });
      assert.equal((payout.body as { payoutState: string }).payoutState, "owed");
      assert.equal((payout.body as { reconciliation: { paid: boolean } }).reconciliation.paid, false);

      async function failEvidence(label: string, name: string) {
        const packed = fileEvidence(name);
        const task = await createReservedTask(baseUrl, {
          title: label.slice(0, 120),
          summary: boundSummary,
          terms: {
            summary: boundSummary,
            claimTtlSeconds: 3600,
            maxArtifactBytes: 4096,
            allowedMediaTypes: ["text/plain", "application/json"],
            slotLimit: 1,
          },
        });
        const actor = await json(baseUrl, "/v1/contributor-tokens", {
          method: "POST",
          token: OWNER_TOKEN,
          body: JSON.stringify({ contributorPublicId: `fail-${label}`, provenance: "test", taskId: task.taskId }),
        });
        const token = (actor.body as { token: string }).token;
        const c = await json(baseUrl, `/v1/tasks/${task.taskId}/claims`, {
          method: "POST",
          token,
          idempotencyKey: key(`${label}-claim`),
          body: JSON.stringify({ termsVersion: task.termsVersion }),
        });
        const rsv = (c.body as { reservation: { id: string } }).reservation.id;
        const submitted = await json(baseUrl, `/v1/tasks/${task.taskId}/submissions`, {
          method: "POST",
          token,
          idempotencyKey: key(`${label}-submit`),
          body: JSON.stringify({
            reservationId: rsv,
            artifact: packed.artifact,
            evidenceBase64: packed.evidenceBase64,
          }),
        });
        assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
        const v = await json(baseUrl, `/v1/tasks/${task.taskId}/verdicts`, {
          method: "POST",
          token: OWNER_TOKEN,
          idempotencyKey: key(`${label}-verdict`),
          body: JSON.stringify({ reservationId: rsv }),
        });
        assert.equal((v.body as { verdict: { outcome: string } }).verdict.outcome, "fail", label);
        const a = await json(baseUrl, `/v1/tasks/${task.taskId}/accept`, {
          method: "POST",
          token: OWNER_TOKEN,
          idempotencyKey: key(`${label}-accept`),
          body: JSON.stringify({ reservationId: rsv, verdictId: (v.body as { verdict: { id: string } }).verdict.id }),
        });
        assert.equal(a.status, 409, label);
      }

      await failEvidence("copied-labels", "copied-labels.json");
      await failEvidence("corrupted-case", "corrupted-case.json");
      await failEvidence("unknown-engine", "unknown-engine.json");
    } finally {
      await stop(child);
      await dropSchema(schema);
    }
  },
);
