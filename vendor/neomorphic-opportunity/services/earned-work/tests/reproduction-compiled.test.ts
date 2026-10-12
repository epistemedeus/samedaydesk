import assert from "node:assert/strict";
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { quoteIdent } from "../src/config.js";
import { REPRODUCTION_VERIFIER_VERSION } from "../src/reproduction-verifier.js";
import { startLossyProxy } from "../../../experiments/wave5/e17/src/lossy-proxy.mjs";
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
const submissions = path.join(e18Root, "fixtures/submissions");

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
  const child = spawn(process.execPath, ["dist/index.js"], {
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
  return child;
}

async function waitListening(child: ChildProcess, port: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`compiled reproduction kernel exited ${child.exitCode}: ${stderr}`);
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
  throw new Error(`compiled reproduction kernel did not reach healthz: ${stderr}`);
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
  const template = JSON.parse(readFileSync(path.join(submissions, "valid-reproduction.json"), "utf8")) as Record<
    string,
    unknown
  >;
  template.id = `fresh-${randomBytes(8).toString("hex")}`;
  const buf = Buffer.from(`${JSON.stringify(template, null, 2)}\n`);
  const catalogDigest = createHash("sha256")
    .update(readFileSync(path.join(submissions, "valid-reproduction.json")))
    .digest("hex");
  const packed = evidenceFrom(buf, "inline:reproduction-evidence");
  assert.notEqual(packed.artifact.digestSha256, catalogDigest);
  const dir = mkdtempSync(path.join(tmpdir(), "e01-evidence-"));
  const filePath = path.join(dir, "fresh-reproduction.json");
  writeFileSync(filePath, buf);
  return { filePath, ...packed };
}

function writeToken(token: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "e01-token-"));
  const filePath = path.join(dir, "contributor.token");
  writeFileSync(filePath, `${token}\n`);
  return filePath;
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

async function issueWalletless(baseUrl: string) {
  const publicId = `e01-contrib-${randomBytes(4).toString("hex")}`;
  const created = await json(baseUrl, "/v1/contributor-tokens", {
    method: "POST",
    token: OWNER_TOKEN,
    body: JSON.stringify({ contributorPublicId: publicId, provenance: "test" }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const body = created.body as { token: string; contributorPublicId: string };
  assert.equal("payoutDestination" in (created.body as object), false);
  return { token: body.token, publicId: body.contributorPublicId };
}

async function obligationJoin(schema: string, taskId: string) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO ${quoteIdent(schema)}`);
    const result = await client.query(
      `SELECT o.id AS obligation_id,
              o.contributor_public_id AS obligation_recipient,
              o.terms_version AS obligation_terms,
              o.payout_state,
              o.payout_destination,
              r.contributor_public_id AS reservation_recipient,
              t.version AS terms_row,
              t.summary AS terms_summary
       FROM earned_work_obligations o
       JOIN earned_work_reservations r ON r.id = o.reservation_id
       JOIN earned_work_terms t
         ON t.task_id = o.task_id
        AND t.version = COALESCE(o.terms_version, r.terms_version)
       WHERE o.task_id = $1`,
      [taskId],
    );
    return result.rows as Array<{
      obligation_id: string;
      obligation_recipient: string;
      obligation_terms: string;
      payout_state: string;
      payout_destination: string | null;
      reservation_recipient: string;
      terms_row: string;
      terms_summary: string;
    }>;
  } finally {
    await client.end();
  }
}

test(
  "compiled reproduction injection: useful pass, controls fail, wrong actor/task/artifact fail, replay, DB join",
  { timeout: 180_000 },
  async () => {
    execFileSync("npm", ["run", "build"], { cwd: kernelRoot, stdio: "inherit" });
    if (!existsSync(path.join(e09Root, "node_modules/tsx"))) {
      execFileSync("npm", ["ci"], { cwd: e09Root, stdio: "inherit" });
    }

    const controls = await spawnCli([path.join(e18Root, "bin/e18-repro.mjs"), "controls"], {
      cwd: e18Root,
      env: process.env,
    });
    assert.equal(controls.code, 0, controls.stdout + controls.stderr);
    const proof = (controls.payload as { proof: Record<string, boolean> }).proof;
    assert.equal(proof.alwaysAcceptFailed, true);
    assert.equal(proof.alwaysRejectFailed, true);
    assert.equal(proof.usefulValidSucceeded, true);

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
    const wrongSummary = `Wrong reproduction binding. e18.specDigest:sha256:${"f".repeat(64)} e18.runtimeDigest:${runtimeAuth.runtimeDigest}`;

    const schema = uniqueSchema();
    const port = await freePort();
    const child = spawnCompiled(port, schema);
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      await waitListening(child, port);

      const valid = freshEvidence();
      const alwaysAccept = fileEvidence("always-accept.json");
      const alwaysReject = fileEvidence("always-reject.json");
      const catalogValid = fileEvidence("valid-reproduction.json");

      const sds = await createReservedTask(baseUrl, {
        title: "SDS52 stale outDir existence-filter",
        summary: boundSummary,
        terms: {
          summary: boundSummary,
          claimTtlSeconds: 3600,
          maxArtifactBytes: 4096,
          allowedMediaTypes: ["text/plain", "application/json"],
          slotLimit: 1,
        },
      });
      const contrib = await issueWalletless(baseUrl);
      const other = await issueWalletless(baseUrl);
      const tokenFile = writeToken(contrib.token);
      const env = contributorEnv(baseUrl);

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
        { cwd: repoRoot, env },
      );
      assert.equal(missing.code, 1, missing.stdout + missing.stderr);
      assert.equal((missing.payload as { error: { code: string } }).error.code, "missing_artifact");

      const journey = await spawnCli(
        [
          e06Bin,
          "journey",
          "--base-url",
          baseUrl,
          "--contributor-token-file",
          tokenFile,
          "--task-id",
          sds.taskId,
          "--evidence-file",
          valid.filePath,
        ],
        { cwd: repoRoot, env },
      );
      assert.equal(journey.code, 0, journey.stdout + journey.stderr);
      const receipt = journey.payload as {
        reservationId: string;
        paid: boolean;
        settled: boolean;
        destinationAbsent: boolean;
        task: { lifecycle: string; termsVersion: string };
      };
      assert.equal(receipt.paid, false);
      assert.equal(receipt.settled, false);
      assert.equal(receipt.destinationAbsent, true);
      assert.equal(receipt.task.lifecycle, "submitted");
      assert.equal(receipt.task.termsVersion, sds.termsVersion);

      const stolenClaim = await json(baseUrl, `/v1/tasks/${sds.taskId}/claims`, {
        method: "POST",
        token: other.token,
        idempotencyKey: key("stolen-claim"),
        body: JSON.stringify({ termsVersion: sds.termsVersion }),
      });
      assert.equal(stolenClaim.status, 409);
      assert.equal((stolenClaim.body as { error: { code: string } }).error.code, "reserved_elsewhere");

      const stolenSubmit = await json(baseUrl, `/v1/tasks/${sds.taskId}/submissions`, {
        method: "POST",
        token: other.token,
        idempotencyKey: key("stolen-submit"),
        body: JSON.stringify({
          reservationId: receipt.reservationId,
          artifact: valid.artifact,
          evidenceBase64: valid.evidenceBase64,
        }),
      });
      assert.equal(stolenSubmit.status, 403);

      const contribVerdict = await json(baseUrl, `/v1/tasks/${sds.taskId}/verdicts`, {
        method: "POST",
        token: contrib.token,
        idempotencyKey: key("contrib-verdict"),
        body: JSON.stringify({ reservationId: receipt.reservationId }),
      });
      assert.equal(contribVerdict.status, 401);

      const verdictKey = key("repro-verdict");
      const proxy = await startLossyProxy(port);
      try {
        let received = false;
        try {
          await json(proxy.baseUrl, `/v1/tasks/${sds.taskId}/verdicts`, {
            method: "POST",
            token: OWNER_TOKEN,
            idempotencyKey: verdictKey,
            body: JSON.stringify({ reservationId: receipt.reservationId }),
          });
          received = true;
        } catch {
          received = false;
        }
        assert.equal(received, false);
        assert.equal(proxy.dropped.at(-1)?.status, 201);
      } finally {
        await proxy.close();
      }

      const replay = await json(baseUrl, `/v1/tasks/${sds.taskId}/verdicts`, {
        method: "POST",
        token: OWNER_TOKEN,
        idempotencyKey: verdictKey,
        body: JSON.stringify({ reservationId: receipt.reservationId }),
      });
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      const verdict = (replay.body as { verdict: { outcome: string; verifierVersion: string; reasons: string[] } })
        .verdict;
      assert.equal(verdict.outcome, "pass");
      assert.equal(verdict.verifierVersion, REPRODUCTION_VERIFIER_VERSION);

      const accept = await spawnCli(
        [
          e09Bin,
          "accept",
          "--base-url",
          baseUrl,
          "--task-id",
          sds.taskId,
          "--reservation-id",
          receipt.reservationId,
          "--digest",
          valid.artifact.digestSha256,
        ],
        {
          cwd: e09Root,
          env: {
            ...process.env,
            EARNED_WORK_OWNER_TOKEN: OWNER_TOKEN,
          },
        },
      );
      assert.equal(accept.code, 0, accept.stdout + accept.stderr);
      const desk = accept.payload as { accepted: boolean; paid: boolean; settled: boolean; transfer: null };
      assert.equal(desk.accepted, true);
      assert.equal(desk.paid, false);
      assert.equal(desk.settled, false);
      assert.equal(desk.transfer, null);

      const payout = await json(baseUrl, `/v1/tasks/${sds.taskId}/payout`, { token: OWNER_TOKEN });
      assert.equal(payout.status, 200);
      assert.equal((payout.body as { payoutState: string }).payoutState, "owed");
      assert.equal((payout.body as { reconciliation: { paid: boolean; settled: boolean } }).reconciliation.paid, false);
      assert.equal((payout.body as { reconciliation: { settled: boolean } }).reconciliation.settled, false);

      const rows = await obligationJoin(schema, sds.taskId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.obligation_recipient, contrib.publicId);
      assert.equal(rows[0]?.reservation_recipient, contrib.publicId);
      assert.equal(rows[0]?.obligation_terms, sds.termsVersion);
      assert.equal(rows[0]?.terms_row, sds.termsVersion);
      assert.equal(rows[0]?.payout_state, "owed");
      assert.equal(rows[0]?.payout_destination, null);
      assert.match(rows[0]?.terms_summary ?? "", /e18\.specDigest:/);

      async function failCase(
        label: string,
        summary: string,
        artifact: typeof valid.artifact,
        evidenceBase64?: string,
        expectSubmitStatus = 201,
      ) {
        const task = await createReservedTask(baseUrl, {
          title: label.slice(0, 120),
          summary,
          terms: {
            summary,
            claimTtlSeconds: 3600,
            maxArtifactBytes: 4096,
            allowedMediaTypes: ["text/plain", "application/json"],
            slotLimit: 1,
          },
        });
        const actor = await issueWalletless(baseUrl);
        const claimed = await json(baseUrl, `/v1/tasks/${task.taskId}/claims`, {
          method: "POST",
          token: actor.token,
          idempotencyKey: key(`${label}-claim`),
          body: JSON.stringify({ termsVersion: task.termsVersion }),
        });
        assert.equal(claimed.status, 201, JSON.stringify(claimed.body));
        const reservationId = (claimed.body as { reservation: { id: string } }).reservation.id;
        const body: Record<string, unknown> = { reservationId, artifact };
        if (evidenceBase64 != null) body.evidenceBase64 = evidenceBase64;
        const submitted = await json(baseUrl, `/v1/tasks/${task.taskId}/submissions`, {
          method: "POST",
          token: actor.token,
          idempotencyKey: key(`${label}-submit`),
          body: JSON.stringify(body),
        });
        assert.equal(submitted.status, expectSubmitStatus, JSON.stringify(submitted.body));
        if (expectSubmitStatus !== 201) {
          return submitted.body as { error: { code: string } };
        }
        const verdictHttp = await json(baseUrl, `/v1/tasks/${task.taskId}/verdicts`, {
          method: "POST",
          token: OWNER_TOKEN,
          idempotencyKey: key(`${label}-verdict`),
          body: JSON.stringify({ reservationId }),
        });
        assert.equal(verdictHttp.status, 201, JSON.stringify(verdictHttp.body));
        const outcome = (verdictHttp.body as { verdict: { outcome: string; verifierVersion: string } }).verdict;
        assert.equal(outcome.outcome, "fail", label);
        assert.equal(outcome.verifierVersion, REPRODUCTION_VERIFIER_VERSION);
        const acceptFail = await json(baseUrl, `/v1/tasks/${task.taskId}/accept`, {
          method: "POST",
          token: OWNER_TOKEN,
          idempotencyKey: key(`${label}-accept`),
          body: JSON.stringify({ reservationId }),
        });
        assert.equal(acceptFail.status, 409);
        return outcome;
      }

      await failCase("always-accept", boundSummary, alwaysAccept.artifact, alwaysAccept.evidenceBase64);
      await failCase("always-reject", boundSummary, alwaysReject.artifact, alwaysReject.evidenceBase64);
      await failCase("wrong-task", wrongSummary, valid.artifact, valid.evidenceBase64);
      const missingEvidence = await failCase("missing-evidence", boundSummary, catalogValid.artifact, undefined, 400);
      assert.equal((missingEvidence as { error: { code: string } }).error.code, "missing_evidence");
      const wrongBytes = Buffer.from('{"schema":"neomorphic.wave5.e18.submission.v1","id":"not-useful"}\n');
      const wrongPacked = evidenceFrom(wrongBytes, "inline:not-useful");
      await failCase("wrong-artifact", boundSummary, wrongPacked.artifact, wrongPacked.evidenceBase64);
    } finally {
      await stop(child);
      await dropSchema(schema);
    }
  },
);
