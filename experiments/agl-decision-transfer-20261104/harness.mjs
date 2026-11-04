// Disposable loopback journey. A saved harbor decision is granted to a later
// requester, who reuses it while the producer files are hidden.
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { machineHost } from "../../server/scripts/root10940-machine-host.mjs";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const CLIENT = join(root, "vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs");
const PREFIX = "/api/neomorphic-contributor-journey";
const SOURCE_COMMIT = "0593026ad155352f263e4749dc889a1578d91675";
const SOURCE_REPOSITORY = "https://github.com/epistemedeus/samedaydesk.git";
const SOURCE_PATH = "vendor/hosted-wallet-market/client/cold-requester-0.3.0.mjs";
const WORKFLOW = join(root, "experiments/n4-workflow-distribution-20261104/bin/workflow.mjs");
const CASE_INPUT = join(root, "experiments/n4-workflow-distribution-20261104/fixtures/case.json");
const MANIFEST = join(root, "experiments/n4-workflow-distribution-20261104/fixtures/before-work.json");
const TRACER_SOURCE = join(root, "experiments/n4-workflow-distribution-20261104/observer/trace-exec.c");
const CHILD = join(root, "experiments/agl-decision-transfer-20261104/reuse-child.mjs");
const RECIPE = join(root, "tools/recurring-job-recipes/recipes/source-change-alert.mjs");
const PRODUCER = join(root, "tools/recurring-job-recipes/cli.mjs");
const PLACEHOLDER = "<the same before-work manifest>";
const LIVE_PROFILE = "https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/profile";
const LIVE_ACCEPTED = "https://samedaydesk.com/api/neomorphic-contributor-journey/v1/market/accepted-work";
const WALLET_CALL_METHODS = Object.freeze([
  "eth_sendTransaction", "eth_sendRawTransaction", "eth_sign", "eth_signTransaction",
  "personal_sign", "eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4",
  "wallet_sendTransaction", "wallet_sendCalls",
]);

const NEED = Object.freeze({
  title: "SYNTHETIC harbor catalog decision",
  summary: "Synthetic requester A offers one saved harbor catalog decision. No payout and no commission.",
  criterion: "reuse-unchanged-manifest",
});

const RIGHTS = Object.freeze({
  license: "CC0-1.0",
  scope: "synthetic-or-authorized-reusable-artifact",
  attribution: "SYNTHETIC harbor catalog decision",
});

function must(step, response) {
  if (response.status !== 0 || response.body?.ok !== true) {
    const detail = JSON.stringify(response.body ?? {}).slice(0, 800);
    throw new Error(`${step} failed status=${response.status} body=${detail}`);
  }
  return response.body;
}

function produceDecision() {
  const state = mkdtempSync(join(tmpdir(), "agl-dt-state-"));
  try {
    const install = spawnSync(process.execPath, [
      WORKFLOW, "install", "--state", state, "--clock", "2026-11-04T22:00:00.000Z",
    ], { encoding: "utf8" });
    if (install.status !== 0) throw new Error(install.stderr || install.stdout);
    const out = join(state, "out");
    const run = spawnSync(process.execPath, [
      WORKFLOW, "run", "--state", state, "--input", CASE_INPUT, "--out", out,
    ], { encoding: "utf8", cwd: root });
    if (run.status !== 0) throw new Error(run.stderr || run.stdout);
    return {
      result: JSON.parse(readFileSync(join(out, "result.json"), "utf8")),
      observationText: readFileSync(join(out, "bound-observation.json"), "utf8"),
      manifestText: readFileSync(MANIFEST, "utf8"),
    };
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
}

function privateProbe(command, observationText) {
  const directory = mkdtempSync(join(tmpdir(), "agl-dt-private-"));
  try {
    const taintedPath = join(directory, "tainted.json");
    const manifestPath = join(directory, "manifest.json");
    writeFileSync(manifestPath, readFileSync(MANIFEST));
    const observation = JSON.parse(observationText);
    observation.password = "synthetic-refused-secret";
    writeFileSync(taintedPath, JSON.stringify(observation));
    const argv = command.slice(1).map((token, index, all) => {
      if (token === PLACEHOLDER) return manifestPath;
      if (all[index - 1] === "--decision") return taintedPath;
      return token;
    });
    const ran = spawnSync(process.execPath, argv, { cwd: root, encoding: "utf8" });
    let body = {};
    try { body = JSON.parse(ran.stderr || ran.stdout || "{}"); } catch { body = {}; }
    return { status: ran.status, body, argv };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function compileTracer() {
  const tracer = join(tmpdir(), `agl-dt-trace-${process.pid}`);
  execFileSync("gcc", ["-O2", "-o", tracer, TRACER_SOURCE], { stdio: "pipe" });
  return tracer;
}

function producerExecuted(trace) {
  return trace.split("\n").filter(Boolean).some((line) => {
    const first = line.split("\t")[0] || "";
    const name = first.slice(first.lastIndexOf("/") + 1);
    if (name === "mount" || name === "unshare") return false;
    return line.includes("source-change-alert") || line.includes("recurring-job-recipes/cli.mjs");
  });
}

function runPrepared(tracer, command, observationText, manifestPath) {
  const work = mkdtempSync(join(tmpdir(), "agl-dt-reuse-"));
  try {
    writeFileSync(join(work, "bound-observation.json"), observationText);
    symlinkSync(join(root, "tools"), join(work, "tools"));
    const argv = command.slice(1).map((token) => (token === PLACEHOLDER ? manifestPath : token));
    const proof = join(work, "proof");
    const job = join(work, "job.json");
    writeFileSync(job, JSON.stringify({
      recipe: RECIPE, producer: PRODUCER, work, argv, proof,
    }));
    const log = join(work, "trace.log");
    const ran = spawnSync(tracer, [
      log, "--", "unshare", "--user", "--mount", "--map-root-user", "--propagation", "private",
      process.execPath, CHILD, job,
    ], { encoding: "utf8" });
    const stdout = existsSync(`${proof}.stdout`) ? readFileSync(`${proof}.stdout`, "utf8") : "";
    const stderr = existsSync(`${proof}.stderr`) ? readFileSync(`${proof}.stderr`, "utf8") : "";
    let body = {};
    try { body = JSON.parse(stdout || stderr || "{}"); } catch { body = {}; }
    return {
      status: ran.status,
      stdout,
      stderr,
      body,
      hidden: existsSync(proof) ? readFileSync(proof, "utf8").trim() : "",
      trace: existsSync(log) ? readFileSync(log, "utf8") : "",
      producerExecuted: producerExecuted(existsSync(log) ? readFileSync(log, "utf8") : ""),
      sawCli: (existsSync(log) ? readFileSync(log, "utf8") : "").includes("result-reuse/cli.mjs"),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function readLive() {
  async function get(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    return { status: response.status, body };
  }
  const [profile, accepted] = await Promise.all([get(LIVE_PROFILE), get(LIVE_ACCEPTED)]);
  const value = profile.body?.value ?? {};
  const acceptedValue = accepted.body?.value ?? {};
  return {
    profileStatus: profile.status,
    profileOk: profile.body?.ok === true,
    acceptedWorkPresent: value.acceptedWork != null && typeof value.acceptedWork === "object",
    acceptedWork: value.acceptedWork ?? null,
    money: value.capability?.money ?? null,
    participation: value.participation?.protocol ?? null,
    signerAuthority: value.signerAuthority ?? null,
    acceptedStatus: accepted.status,
    acceptedOk: accepted.body?.ok === true,
    acceptedWorkPublic: acceptedValue.acceptedWorkPublic ?? null,
    acceptedItems: Array.isArray(acceptedValue.items) ? acceptedValue.items.length : null,
    paidWork: acceptedValue.paidWork ?? null,
  };
}

function evidenceFor(produced) {
  const businessResult = JSON.stringify({
    observationText: produced.observationText,
    manifestText: produced.manifestText,
    command: produced.result.transfer.command,
  });
  return {
    bytes: Buffer.byteLength(businessResult),
    evidence: {
      kind: "usable",
      businessResult,
      attempts: [{
        action: "Carry the saved harbor catalog decision",
        result: "The bound observation and before-work manifest are in businessResult",
        evidence: "Synthetic decision packet produced by the harbor catalog workflow",
      }],
      criterionResults: [{
        criterionId: NEED.criterion,
        observation: "The saved decision is bound to the unchanged before-work manifest",
        passed: true,
      }],
      nextDecision: "A later requester may run the prepared decide-or-reuse command after an explicit grant.",
    },
  };
}

async function countRows(host, sql, args = []) {
  const result = await host.query(sql, args);
  return Number(result.rows[0].n);
}

export async function runJourney() {
  const produced = produceDecision();
  const command = produced.result.transfer.command;
  const packet = evidenceFor(produced);
  if (packet.bytes > 4096) {
    throw new Error(`evidence_text_limit:${packet.bytes}`);
  }
  const probe = privateProbe(command, produced.observationText);
  const tracer = compileTracer();
  const livePromise = readLive();
  const host = await machineHost();
  const directory = mkdtempSync(join(host.scratch, "agl-dt-"));
  const file = (name) => join(directory, name);
  let seq = 0;
  const secrets = {};
  try {
    const booted = await host.boot({ participation: true, acceptedWorkPublic: false });
    if (booted?.acceptedWorkPublic === true) throw new Error("host_accepted_work_public");
    const beforeMoney = await host.financialSnapshot();
    const pins = ["--origin", host.origin, "--ca-file", host.caFile];
    async function cold(args) {
      try {
        const { stdout } = await exec(process.execPath, ["--max-old-space-size=256", CLIENT, ...args], {
          encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024,
          env: { ...process.env, UV_THREADPOOL_SIZE: "1", OMP_NUM_THREADS: "1" },
        });
        return { status: 0, body: JSON.parse(stdout) };
      } catch (error) {
        const status = Number.isInteger(error.code) ? error.code : 1;
        let body = {};
        try { body = JSON.parse(error.stdout || "{}"); } catch { body = {}; }
        return { status, body };
      }
    }
    async function act(name, action, input) {
      const path = file(`${action}-${name}-${++seq}.json`);
      writeFileSync(path, JSON.stringify(input));
      return cold(["act", ...pins, "--secret-file", secrets[name], "--action", action, "--input", path]);
    }
    async function readOut(commandName, name, taskId) {
      const path = file(`${commandName}-${name}-${++seq}.json`);
      const response = await cold([
        commandName, ...pins, "--secret-file", secrets[name], "--task-id", taskId, "--out", path,
      ]);
      return {
        response,
        value: response.body?.ok ? JSON.parse(readFileSync(path, "utf8")) : null,
      };
    }
    const clientBytes = readFileSync(CLIENT);
    const clientSha = createHash("sha256").update(clientBytes).digest("hex");
    const localProfile = await host.request(`${PREFIX}/v1/market/profile`, { method: "GET" });
    const localAccepted = await host.request(`${PREFIX}/v1/market/accepted-work`, { method: "GET" });
    const opened = await cold(["profile", ...pins]);
    must("profile", opened);
    const descriptor = {
      schema: "neomorphic.machine-participation.acquisition.v1",
      version: "0.3.0",
      bytes: clientBytes.length,
      sha256: clientSha,
      source: { repository: SOURCE_REPOSITORY, commit: SOURCE_COMMIT, path: SOURCE_PATH },
      requiredProfile: {
        money: "unfunded",
        participation: "voluntary-artifact-v1",
        sourceSha256: opened.body.sourceSha256,
        hostSha256: opened.body.hostSha256,
      },
    };
    const descriptorPath = file("acquisition.json");
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    const descriptorSha = createHash("sha256").update(readFileSync(descriptorPath)).digest("hex");
    const acquire = [
      "--descriptor", descriptorPath, "--descriptor-sha256", descriptorSha,
      "--source-repository", SOURCE_REPOSITORY, "--source-commit", SOURCE_COMMIT, "--source-path", SOURCE_PATH,
    ];
    for (const [name, role, displayName] of [
      ["A", "requester", "SYNTHETIC requester A"],
      ["B", "contributor", "SYNTHETIC contributor B"],
      ["C", "requester", "SYNTHETIC requester C"],
      ["D", "requester", "SYNTHETIC stranger D"],
    ]) {
      secrets[name] = file(`secret-${name}.json`);
      must(`signup ${name}`, await cold([
        "signup", ...pins, "--secret-file", secrets[name], "--display-name", displayName, "--role", role, ...acquire,
      ]));
    }
    const accountId = (name) => JSON.parse(readFileSync(secrets[name], "utf8")).accountId;
    const quotesBefore = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_quotes");
    const fundingBefore = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_funding");
    const capturesBefore = await countRows(host, "SELECT count(*)::int AS n FROM hosted_wallet_market.captures");
    const walletsBefore = await countRows(host, "SELECT count(*)::int AS n FROM hosted_wallet_market.wallets");

    const posted = must("post", await cold([
      "post", ...pins, "--secret-file", secrets.A,
      "--title", NEED.title, "--summary", NEED.summary, "--criterion", NEED.criterion,
    ]));
    const taskId = posted.taskId;
    must("interest", await cold([
      "interest", ...pins, "--secret-file", secrets.B, "--task-id", taskId,
      "--note", "Synthetic contributor B offers to carry the saved harbor decision.",
    ]));
    let step = must("offer", await act("A", "offerVoluntary", {
      taskId, contributorId: accountId("B"), authorizedToRequest: true, rights: RIGHTS,
    }));
    const inspected = await readOut("inspect", "B", taskId);
    must("inspect", inspected.response);
    step = must("assent", await act("B", "assentVoluntary", {
      taskId, termsDigest: step.termsDigest, expectedRevision: step.revision,
      authorizedToShare: true, spec: inspected.value.spec,
    }));
    step = must("deliver", await act("B", "deliverVoluntary", {
      taskId, termsDigest: step.termsDigest, expectedRevision: step.revision,
      evidence: packet.evidence,
    }));
    step = must("review", await act("A", "reviewVoluntary", {
      taskId, termsDigest: step.termsDigest, expectedRevision: step.revision,
      artifactDigest: step.artifactDigest, accepted: true, exportAuthorized: true,
      reason: "The saved decision matches the before-work manifest and may be exported.",
    }));
    const exportBeforeGrant = await readOut("export", "C", taskId);
    const contributorGrant = await act("B", "grantVoluntary", {
      taskId, termsDigest: step.termsDigest, expectedRevision: step.revision, consumerId: accountId("C"),
    });
    const strangerExport = await readOut("export", "D", taskId);
    step = must("grant", await act("A", "grantVoluntary", {
      taskId, termsDigest: step.termsDigest, expectedRevision: step.revision, consumerId: accountId("C"),
    }));
    const strangerUse = await act("D", "useVoluntary", {
      taskId,
      laterTaskId: `market-${"ab".repeat(32)}`,
      artifactDigest: step.artifactDigest,
      decision: "Synthetic stranger D has no grant.",
    });
    const exported = await readOut("export", "C", taskId);
    must("export", exported.response);
    const carried = JSON.parse(exported.value.evidence.businessResult);
    const manifestPath = file("before-work.json");
    writeFileSync(manifestPath, carried.manifestText);
    const reuse = runPrepared(tracer, carried.command, carried.observationText, manifestPath);
    const changedManifest = JSON.parse(carried.manifestText);
    changedManifest.capture.contentHash = "sha256:harbor-light-changed";
    const changedPath = file("changed-before-work.json");
    writeFileSync(changedPath, JSON.stringify(changedManifest));
    const changed = runPrepared(tracer, carried.command, carried.observationText, changedPath);

    const later = must("later post", await cold([
      "post", ...pins, "--secret-file", secrets.C,
      "--title", "SYNTHETIC later harbor reuse",
      "--summary", "Synthetic requester C records one reuse of the granted harbor decision.",
      "--criterion", "record-harbor-reuse",
    ]));
    const useInput = {
      taskId,
      laterTaskId: later.taskId,
      artifactDigest: exported.response.body.artifactDigest,
      decision: "SYNTHETIC-HARBOR-168 reuse verdict reuse producerInvoked false",
    };
    const useBefore = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'", [taskId]);
    const idempotencyBefore = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency");
    host.fault.dropAction = "useVoluntary";
    const lost = await act("C", "useVoluntary", useInput);
    const dropConsumed = host.fault.dropAction === null;
    const useAfterLost = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'", [taskId]);
    const idempotencyAfterLost = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency");
    host.fault.dropAction = "useVoluntary";
    const second = await act("C", "useVoluntary", useInput);
    const secondPostBlocked = host.fault.dropAction === "useVoluntary";
    host.fault.dropAction = null;
    const recovered = await cold(["readback", ...pins, "--secret-file", secrets.C, "--operation", "useVoluntary"]);
    const useAfterReadback = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'", [taskId]);
    const idempotencyAfterReadback = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.earned_work_idempotency");
    const measure = (await host.query(
      "SELECT payload FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'",
      [taskId],
    )).rows[0]?.payload ?? null;

    const withdrawn = must("withdraw", await act("A", "withdrawVoluntary", {
      taskId, termsDigest: step.termsDigest, expectedRevision: step.revision,
      reason: "Synthetic requester A withdraws the harbor decision grant.",
    }));
    const exportAfter = await readOut("export", "C", taskId);
    const useAfter = await act("C", "useVoluntary", useInput);
    const useFinal = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_measures WHERE task_id=$1 AND kind='downstream_use'", [taskId]);
    const consumers = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_voluntary_consumers WHERE task_id=$1", [taskId]);
    const fund = await cold(["fund", ...pins, "--secret-file", secrets.A]);
    const afterMoney = await host.financialSnapshot();
    const quotesAfter = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_quotes");
    const fundingAfter = await countRows(host, "SELECT count(*)::int AS n FROM cj227_earned_work.ae14_market_funding");
    const capturesAfter = await countRows(host, "SELECT count(*)::int AS n FROM hosted_wallet_market.captures");
    const walletsAfter = await countRows(host, "SELECT count(*)::int AS n FROM hosted_wallet_market.wallets");
    const live = await livePromise;
    return {
      live,
      local: {
        profileStatus: localProfile.status,
        acceptedWorkPresent: localProfile.body?.value?.acceptedWork != null,
        acceptedWorkStatus: localAccepted.status,
        acceptedWorkCode: localAccepted.body?.code ?? null,
        participation: opened.body.participation,
        money: opened.body.money,
        signerAuthority: opened.body.signerAuthority,
      },
      privateField: {
        status: probe.status,
        ok: probe.body.ok === true,
        verdict: probe.body.verdict ?? null,
        reason: probe.body.reason ?? null,
        decision: probe.body.decision ?? null,
        secretInEvidence: packet.evidence.businessResult.includes("synthetic-refused-secret"),
      },
      packetBytes: packet.bytes,
      identityHorizon: produced.result.identity.horizonHours,
      commandHorizon: command[command.indexOf("--horizon") + 1],
      commandHasUndefined: command.includes("undefined"),
      grant: {
        state: step.state,
        paidWork: step.paidWork,
        artifactDigest: step.artifactDigest,
        rights: exported.value?.terms?.rights ?? null,
      },
      export: {
        state: exported.value?.state ?? null,
        relationship: exported.value?.relationship ?? null,
        paidWork: exported.value?.paidWork ?? null,
        sameBusinessResult: exported.value?.evidence?.businessResult === packet.evidence.businessResult,
        sameCommand: JSON.stringify(carried.command) === JSON.stringify(command),
      },
      refusals: {
        exportBeforeGrant: exportBeforeGrant.response.body?.code ?? null,
        contributorGrant: contributorGrant.body?.code ?? null,
        strangerExport: strangerExport.response.body?.code ?? null,
        strangerUse: strangerUse.body?.code ?? null,
      },
      reuse: {
        status: reuse.status,
        verdict: reuse.body.verdict ?? null,
        producerInvoked: reuse.body.producerInvoked ?? null,
        outcome: reuse.body.decision?.useful?.outcome ?? null,
        hidden: reuse.hidden,
        producerExecuted: reuse.producerExecuted,
        sawCli: reuse.sawCli,
        stderr: reuse.status === 0 ? "" : (reuse.stderr || reuse.stdout).slice(0, 400),
      },
      changed: {
        status: changed.status,
        verdict: changed.body.verdict ?? null,
        reason: changed.body.reason ?? null,
        producerInvoked: changed.body.producerInvoked ?? null,
        hidden: changed.hidden,
        producerExecuted: changed.producerExecuted,
        sawCli: changed.sawCli,
        stderr: changed.status === 0 ? "" : (changed.stderr || changed.stdout).slice(0, 400),
      },
      use: {
        lostStatus: lost.status,
        lostCode: lost.body?.code ?? null,
        lostNext: lost.body?.nextAction ?? null,
        dropConsumed,
        recoveredOk: recovered.body?.ok === true,
        recoveredRevision: recovered.body?.revision ?? null,
        secondStatus: second.status,
        secondCode: second.body?.code ?? null,
        secondPostBlocked,
        useBefore,
        useAfterLost,
        useAfterReadback,
        useFinal,
        idempotencyBefore,
        idempotencyAfterLost,
        idempotencyAfterReadback,
        verification: measure?.verification ?? null,
        independence: measure?.independence ?? null,
        paidWork: measure?.paidWork ?? null,
        decision: measure?.decision ?? null,
      },
      withdrawal: {
        state: withdrawn.state,
        paidWork: withdrawn.paidWork,
        exportCode: exportAfter.response.body?.code ?? null,
        useCode: useAfter.body?.code ?? null,
        consumers,
      },
      fund: {
        ok: fund.body?.ok === true,
        code: fund.body?.code ?? null,
        paidWork: fund.body?.paidWork ?? null,
      },
      money: {
        snapshotUnchanged: JSON.stringify(beforeMoney) === JSON.stringify(afterMoney),
        walletCalls: host.rpcMethods.filter((name) => WALLET_CALL_METHODS.includes(name)).length,
        quotesBefore,
        quotesAfter,
        fundingBefore,
        fundingAfter,
        capturesBefore,
        capturesAfter,
        walletsBefore,
        walletsAfter,
      },
    };
  } finally {
    await host.close();
  }
}
