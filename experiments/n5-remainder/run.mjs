#!/usr/bin/env node
// N5-REMAINDER runner.
// consumer: synthetic-normal
// The source root is an argument. Cores are imported from that root only
// after its commit, tree, and the seven admitted blobs match. This file does
// not copy a core and does not write a fee table, a payment, or a real
// obligation.

import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { captureCommit, pinBlobs, writerRoot } from "./import-gate.mjs";

const experimentDir = dirname(fileURLToPath(import.meta.url));
const here = fileURLToPath(import.meta.url);
const INPUT_COMMIT = "9f6c0c4e396dd7677f334400eed93e3445fad600";
const INPUT_TREE = "8a85072962a71dc1b78b19a0dc0caf17aebac833";
const WRITER_BASE = "09b2d6155ce247d828355183c9367889daf5f0f0";
const CLOCK = "2026-11-05T03:11:00.000Z";
const DIRECT_FIELD = "directLabel";
const DIRECT_VALUE = "synthetic-direct-a";
const REMAINDER_FIELD = "specialistNote";
const REMAINDER_VALUE = "synthetic-remainder-b";
const CONTENT_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MISS_HASH = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const TENANT = "n5tenant";
const REQUESTER = "n5requester";
const CONTRIBUTOR = "n5contributor";
const TASK_ID = "n5remainder";
const SOURCE_SHA = createHash("sha256").update("n5-remainder-source").digest("hex");
const HOST_SHA = createHash("sha256").update("n5-remainder-host").digest("hex");
const PARENT_RIGHTS = Object.freeze({
  license: "CC0-1.0",
  scope: "synthetic-or-authorized-reusable-artifact",
  attribution: "Synthetic normal attribution",
});
const WIDER_RIGHTS = Object.freeze({
  license: "CC0-1.0",
  scope: "synthetic-or-authorized-reusable-artifact-and-downstream",
  attribution: "Synthetic normal attribution",
});
const SPEC = Object.freeze({
  title: "Synthetic remainder",
  summary: "Synthetic normal remainder join.",
  criteria: Object.freeze(["keep-direct-part", "add-remainder-field"]),
});
const FEE_GROSS = "2500000";
const FEE_RAIL = "0";

let feeCalls = 0;

function writerHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: writerRoot,
    encoding: "utf8",
  }).trim();
}

function parseArgs(argv) {
  const out = {
    sourceRoot: null,
    wrongRoot: null,
    missingRoot: null,
    store: null,
    caseName: "normal",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return null;
      index += 1;
      return value;
    };
    if (arg === "--source-root") out.sourceRoot = next();
    else if (arg === "--wrong-root") out.wrongRoot = next();
    else if (arg === "--missing-root") out.missingRoot = next();
    else if (arg === "--store") out.store = next();
    else if (arg === "--case") out.caseName = next() || "normal";
    else return { error: `unknown argument ${arg}` };
  }
  return out;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function verifySource(sourceRoot) {
  if (!sourceRoot) {
    return { ok: false, code: "missing_source_root", message: "source root is absent", root: null };
  }
  const root = resolve(sourceRoot);
  if (!existsSync(root)) {
    return { ok: false, code: "missing_source_root", message: "source root is absent", root };
  }
  let head = null;
  let tree = null;
  try {
    head = git(root, ["rev-parse", "HEAD"]);
    tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  } catch (error) {
    return {
      ok: false,
      code: "missing_source_root",
      message: String(error.stderr || error.message || error).split("\n")[0],
      root,
    };
  }
  if (head !== INPUT_COMMIT || tree !== INPUT_TREE) {
    return {
      ok: false,
      code: "wrong_pin",
      message: `commit ${head} tree ${tree}`,
      root,
      head,
      tree,
      blobChecks: "not_reached",
    };
  }
  const blobs = [];
  for (const [relativePath, expected] of Object.entries(pinBlobs)) {
    const absolute = resolve(root, relativePath);
    if (!existsSync(absolute)) {
      blobs.push({
        path: relativePath,
        expected,
        actual: null,
        match: false,
        code: "missing_file",
      });
      continue;
    }
    let actual = null;
    try {
      actual = git(root, ["hash-object", "--", relativePath]);
    } catch (error) {
      blobs.push({
        path: relativePath,
        expected,
        actual: null,
        match: false,
        code: "missing_file",
        message: String(error.stderr || error.message || error).split("\n")[0],
      });
      continue;
    }
    blobs.push({
      path: relativePath,
      expected,
      actual,
      match: actual === expected,
      code: actual === expected ? null : "pin_blob_mismatch",
    });
  }
  const failed = blobs.find((row) => !row.match);
  if (failed) {
    return {
      ok: false,
      code: failed.code,
      message: `${failed.code} ${failed.path}`,
      root,
      head,
      tree,
      blobs,
    };
  }
  return { ok: true, code: null, message: null, root, head, tree, blobs };
}

async function loadCores(verified) {
  const url = (relativePath) => pathToFileURL(resolve(verified.root, relativePath)).href;
  const [exportMod, projectMod, mapMod, voluntaryMod, publicationMod, feeMod, marketMod, coldMod, foundationMod] = await Promise.all([
    import(url("tools/result-reuse/src/export.mjs")),
    import(url("tools/result-reuse/src/project.mjs")),
    import(url("tools/result-reuse/src/map.mjs")),
    import(url("vendor/hosted-wallet-market/src/voluntary-market.mjs")),
    import(url("vendor/hosted-wallet-market/src/accepted-work-publication.mjs")),
    import(url("vendor/hosted-wallet-market/src/fee.mjs")),
    import(url("vendor/hosted-wallet-market/runtime/agent-economy-market/src/market.mjs")),
    import(url("vendor/hosted-wallet-market/runtime/agent-economy-market/src/cold-receipt.mjs")),
    import(url("vendor/hosted-wallet-market/runtime/agent-economy-foundation/dist/index.js")),
  ]);
  const cores = {
    decideOrReuse: exportMod.decideOrReuse,
    bindUsefulDecision: exportMod.bindUsefulDecision,
    projectResult: projectMod.projectResult,
    n45RecordToObservation: mapMod.n45RecordToObservation,
    voluntaryMarket: voluntaryMod.voluntaryMarket,
    proposalFrom: publicationMod.proposalFrom,
    quoteEconomics: feeMod.quoteEconomics,
    digest: foundationMod.digest,
    evidence: marketMod.RequesterMarket.prototype.evidence,
    coldRequest: coldMod.coldRequest,
    coldReceipt: coldMod.coldReceipt,
    checkedColdResult: coldMod.checkedColdResult,
  };
  const required = [
    "decideOrReuse",
    "bindUsefulDecision",
    "projectResult",
    "n45RecordToObservation",
    "voluntaryMarket",
    "proposalFrom",
    "quoteEconomics",
    "digest",
    "evidence",
    "coldRequest",
    "coldReceipt",
    "checkedColdResult",
  ];
  const missing = required.filter((name) => typeof cores[name] !== "function");
  if (missing.length) {
    return { ok: false, code: "MISSING_EXPORT", message: `missing ${missing.join(",")}`, cores: null };
  }
  return { ok: true, cores };
}

function failureCode(error) {
  if (!error) return "unknown";
  if (typeof error.code === "string" && error.code) return error.code;
  if (typeof error.codeName === "string" && error.codeName) return error.codeName;
  return error.name || "error";
}

function emptyEffects() {
  return {
    funding: false,
    account: false,
    commission: false,
    realObligation: false,
    payment: false,
    provider: false,
    outsideSend: false,
    feeTableWrite: false,
    storeWritten: false,
  };
}

function envelope(args, extra = {}) {
  return {
    consumer: "synthetic-normal",
    command: "experiments/n5-remainder/run.mjs",
    case: args.caseName,
    writerHead: writerHead(),
    writerBase: WRITER_BASE,
    declaredInputCommit: INPUT_COMMIT,
    declaredInputTree: INPUT_TREE,
    captureCommit,
    delegationEmitted: 0,
    obligationCount: 0,
    realObligationCount: 0,
    feeRead: null,
    joinedRecord: null,
    effects: emptyEffects(),
    ...extra,
  };
}

function emit(record, code) {
  record.consumer = "synthetic-normal";
  record.quoteEconomicsCalls = feeCalls;
  record.realObligationCount = 0;
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  process.exit(code);
}

function manifest(contentHash) {
  return {
    recipeId: "source-change-alert",
    recipeVersion: "source-change-alert.v1",
    fields: [DIRECT_FIELD],
    prior: {
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sequence: 1,
      createdAt: CLOCK,
      payload: { [DIRECT_FIELD]: DIRECT_VALUE },
    },
    capture: {
      url: "https://example.com/n5-remainder-direct",
      contentHash,
    },
  };
}

function produced(contentHash) {
  return {
    recipeId: "source-change-alert",
    schema: "source-change-alert.v1",
    outcome: "unchanged",
    evidence: {
      kind: "field-compare",
      contentHash,
      changed: [],
      unchanged: [{ field: DIRECT_FIELD, value: DIRECT_VALUE }],
    },
    recovery: {
      action: "keep_prior",
      operatorNext: "Keep the captured direct label.",
    },
  };
}

function decisionOptions() {
  return {
    taskId: "n5-remainder-direct",
    subject: "n5-remainder-subject",
    sequence: 1,
    clock: CLOCK,
    horizonHours: 168,
    optIn: true,
  };
}

function bindAndDecide(cores, savedHash, inputHash = savedHash) {
  const saved = manifest(savedHash);
  const bound = cores.bindUsefulDecision(saved, produced(savedHash), decisionOptions());
  if (!bound.ok) return { ok: false, stage: "bind", bound, verdict: null, input: manifest(inputHash) };
  const input = manifest(inputHash);
  const verdict = cores.decideOrReuse(bound.observation, input, decisionOptions());
  return { ok: verdict.ok === true, stage: "decide", bound, verdict, input };
}

function compactProjection(cores, value) {
  try {
    const projected = cores.projectResult(value);
    return {
      ok: projected?.ok === true,
      kind: projected?.kind ?? null,
      message: projected?.message ?? null,
    };
  } catch (error) {
    return { ok: false, kind: null, message: failureCode(error) };
  }
}

function coveredFields(verdict) {
  const evidence = verdict?.decision?.useful?.evidence;
  const names = new Set();
  for (const row of [...(evidence?.unchanged ?? []), ...(evidence?.changed ?? [])]) {
    if (row && typeof row === "object" && typeof row.field === "string") names.add(row.field);
  }
  return names;
}

function splitRemainder(verdict, taskFields) {
  const coreDelegation = verdict && Object.hasOwn(verdict, "delegation") ? verdict.delegation : null;
  if (coreDelegation != null) {
    return { delegation: coreDelegation, missing: [], coreEmitted: true, falsified: true };
  }
  if (!verdict || verdict.verdict !== "reuse") {
    return { delegation: null, missing: [...taskFields], coreEmitted: false, falsified: false };
  }
  const covered = coveredFields(verdict);
  const missing = taskFields.filter((field) => !covered.has(field));
  if (missing.length === 0 || missing.length === taskFields.length) {
    return { delegation: null, missing, coreEmitted: false, falsified: false };
  }
  return {
    delegation: {
      remainderId: missing.join("+"),
      fields: [...missing],
      source: "named field absent from the reused capture",
    },
    missing,
    coreEmitted: false,
    falsified: false,
  };
}

function directPart(verdict) {
  const unchanged = verdict?.decision?.useful?.evidence?.unchanged ?? [];
  const row = unchanged.find((item) => item && item.field === DIRECT_FIELD) ?? null;
  return {
    field: DIRECT_FIELD,
    value: row ? row.value : null,
    verdict: verdict?.verdict ?? null,
    observationId: verdict?.decision?.observationId ?? null,
    inputDigest: verdict?.inputDigest ?? null,
    producerInvoked: verdict?.producerInvoked ?? null,
  };
}

function specialistFixture(field, mode) {
  if (mode === "fail") {
    const error = new Error("specialist_failed");
    error.code = "specialist_failed";
    throw error;
  }
  if (field !== REMAINDER_FIELD) {
    const error = new Error("specialist_field_refused");
    error.code = "specialist_field_refused";
    throw error;
  }
  return { field, value: REMAINDER_VALUE };
}

function captureContains(value, verdict, input) {
  return JSON.stringify({ decision: verdict?.decision ?? null, input }).includes(value);
}

function inProcessRecord(direct) {
  return {
    consumer: "synthetic-normal",
    direct,
    [REMAINDER_FIELD]: REMAINDER_VALUE,
    delegation: null,
  };
}

function capability() {
  return {
    money: "unfunded",
    participation: "voluntary-artifact-v1",
    sourceSha256: SOURCE_SHA,
    hostSha256: HOST_SHA,
    origin: "https://example.com/n5-remainder",
  };
}

function emptyState() {
  return {
    consumer: "synthetic-normal",
    tasks: {},
    interests: [],
    journal: {},
    acceptances: [],
  };
}

function taskKey(taskId) {
  return `${TENANT}\t${taskId}`;
}

function seed(state, taskId) {
  const key = taskKey(taskId);
  if (!state.tasks[key]) {
    state.tasks[key] = {
      tenant_id: TENANT,
      id: taskId,
      requester_id: REQUESTER,
      spec: { title: SPEC.title, summary: SPEC.summary, criteria: [...SPEC.criteria] },
      current_quote: null,
      selected_quote: null,
      voluntary: null,
    };
  }
  const interest = `${TENANT}\t${taskId}\t${CONTRIBUTOR}`;
  if (!state.interests.includes(interest)) state.interests.push(interest);
}

function createHarness(cores, state) {
  const tasks = state.tasks;
  const interests = new Set(state.interests);
  const journal = state.journal;
  const client = {
    async query(sql, args) {
      const compact = sql.replace(/\s+/g, " ");
      if (compact.includes("SET voluntary")) {
        const row = tasks[`${args[0]}\t${args[1]}`];
        if (!row) {
          const error = new Error("forbidden");
          error.code = "forbidden";
          throw error;
        }
        row.voluntary = JSON.parse(args[2]);
        return { rows: [] };
      }
      if (compact.includes("interests")) {
        const present = interests.has(`${args[0]}\t${args[1]}\t${args[2]}`);
        return { rows: present ? [{ ok: 1 }] : [] };
      }
      const error = new Error("unhandled_sql");
      error.code = "unhandled_sql";
      throw error;
    },
  };
  const store = {
    table(name) {
      return `"earned"."ae14_market_${name}"`;
    },
    async task(tenant, id) {
      const row = tasks[`${tenant}\t${id}`];
      if (!row) {
        const error = new Error("forbidden");
        error.code = "forbidden";
        throw error;
      }
      return structuredClone(row);
    },
    async hasFunding() {
      return false;
    },
    async coldMutation({ origin, actor, action, input, operationId }, effect) {
      const request = cores.coldRequest(origin, actor, action, input, operationId);
      const requestHash = cores.digest(request);
      const key = `${actor.actorId}\t${operationId}`;
      const prior = journal[key];
      if (prior) {
        if (prior.principal !== actor.actorId || prior.requestHash !== requestHash) {
          const error = new Error("operation_conflict");
          error.code = "operation_conflict";
          throw error;
        }
        return cores.checkedColdResult(request, prior.result);
      }
      const result = cores.coldReceipt(request, await effect(client));
      journal[key] = { principal: actor.actorId, requestHash, result };
      return result;
    },
  };
  const market = {
    store,
    async actor(req) {
      return { tenantId: req.tenantId, actorId: req.actorId };
    },
    async member(actorId) {
      if (actorId === REQUESTER) return { actorId, role: "requester" };
      if (actorId === CONTRIBUTOR) return { actorId, role: "contributor" };
      const error = new Error("forbidden");
      error.codeName = "forbidden";
      throw error;
    },
    owner(actor, row) {
      if (actor.actorId !== row.requester_id) {
        const error = new Error("forbidden");
        error.codeName = "forbidden";
        throw error;
      }
    },
    evidence(input, spec) {
      return cores.evidence(input, spec);
    },
  };
  return market;
}

function joinedEvidence() {
  return {
    kind: "usable",
    businessResult: "Captured direct label kept. Remainder field added by the specialist fixture.",
    attempts: [{
      action: "Join the captured field and the remainder field",
      result: "Both fields are present on the synthetic record",
      evidence: "Synthetic join of the reused decision and the specialist fixture",
    }],
    criterionResults: [
      {
        criterionId: "keep-direct-part",
        observation: "The captured label is unchanged",
        passed: true,
      },
      {
        criterionId: "add-remainder-field",
        observation: "The remainder field is present",
        passed: true,
      },
    ],
    nextDecision: "Keep the joined synthetic record.",
  };
}

async function offerOnly(cores, state, rights, taskId, operationId) {
  seed(state, taskId);
  const market = createHarness(cores, state);
  const cap = capability();
  const voluntary = cores.voluntaryMarket({ market, capability: cap, acceptedWorkPublic: false });
  return voluntary.invoke({ tenantId: TENANT, actorId: REQUESTER }, "offerVoluntary", {
    taskId,
    contributorId: CONTRIBUTOR,
    rights,
    authorizedToRequest: true,
    sourceSha256: cap.sourceSha256,
    hostSha256: cap.hostSha256,
  }, operationId);
}

async function acceptJoined(cores, state) {
  seed(state, TASK_ID);
  const market = createHarness(cores, state);
  const cap = capability();
  const voluntary = cores.voluntaryMarket({ market, capability: cap, acceptedWorkPublic: false });
  const requester = { tenantId: TENANT, actorId: REQUESTER };
  const contributor = { tenantId: TENANT, actorId: CONTRIBUTOR };
  const base = {
    taskId: TASK_ID,
    sourceSha256: cap.sourceSha256,
    hostSha256: cap.hostSha256,
  };
  const offer = await voluntary.invoke(requester, "offerVoluntary", {
    taskId: TASK_ID,
    contributorId: CONTRIBUTOR,
    rights: { ...PARENT_RIGHTS },
    authorizedToRequest: true,
    sourceSha256: cap.sourceSha256,
    hostSha256: cap.hostSha256,
  }, "n5offer01");
  const assent = await voluntary.invoke(contributor, "assentVoluntary", {
    ...base,
    termsDigest: offer.termsDigest,
    expectedRevision: offer.revision,
    authorizedToShare: true,
    spec: state.tasks[taskKey(TASK_ID)].spec,
  }, "n5assent1");
  const deliver = await voluntary.invoke(contributor, "deliverVoluntary", {
    ...base,
    termsDigest: offer.termsDigest,
    expectedRevision: assent.revision,
    evidence: joinedEvidence(),
  }, "n5deliver");
  const review = await voluntary.invoke(requester, "reviewVoluntary", {
    ...base,
    termsDigest: offer.termsDigest,
    expectedRevision: deliver.revision,
    artifactDigest: deliver.artifactDigest,
    accepted: true,
    exportAuthorized: false,
    reason: "Synthetic requester kept the joined record.",
  }, "n5review1");
  return { offer, assent, deliver, review, row: state.tasks[taskKey(TASK_ID)] };
}

function readFee(quoteEconomics) {
  feeCalls += 1;
  const functionResult = quoteEconomics({ gross: FEE_GROSS, railCost: FEE_RAIL });
  return {
    sent: false,
    persisted: false,
    arguments: { gross: FEE_GROSS, railCost: FEE_RAIL },
    functionResult,
  };
}

function proposalInput(cores, row) {
  const summary = "Synthetic normal joined remainder.";
  const publicArtifact = null;
  const voluntary = row.voluntary;
  return {
    publicationConsent: true,
    summary,
    publicArtifact,
    summaryDigest: cores.digest(summary),
    publicArtifactDigest: cores.digest(publicArtifact),
    termsDigest: voluntary.termsDigest,
    rightsDigest: cores.digest(voluntary.terms.rights),
    artifactDigest: voluntary.artifact.digest,
  };
}

function commitAcceptance(state, review, feeRead) {
  const localAcceptanceId = review?.receipt?.receiptId ?? null;
  const existing = state.acceptances.find((row) => row.taskId === TASK_ID);
  if (existing) {
    return {
      appended: false,
      acceptance: existing,
      newLocalAcceptances: 0,
      newObligations: 0,
      sameId: existing.localAcceptanceId === localAcceptanceId,
    };
  }
  const acceptance = {
    taskId: TASK_ID,
    localAcceptanceId,
    state: review.state,
    realObligation: false,
    obligationId: null,
    feeRead,
  };
  state.acceptances.push(acceptance);
  return {
    appended: true,
    acceptance,
    newLocalAcceptances: 1,
    newObligations: 0,
    sameId: true,
  };
}

function obligationView(acceptance, commit) {
  return {
    fit: "no-fit",
    obligationId: null,
    realObligation: false,
    reason: "voluntaryMarket creates no earned-work funding, obligation, verifier receipt, or payment",
    localAcceptanceId: acceptance?.localAcceptanceId ?? null,
    newObligations: commit?.newObligations ?? 0,
    newLocalAcceptances: commit?.newLocalAcceptances ?? 0,
    sameLocalAcceptanceId: commit?.sameId ?? null,
  };
}

function storeFile(storeDir) {
  return resolve(storeDir, "state.json");
}

function assertDeletableStore(storeDir) {
  const resolved = resolve(storeDir);
  const local = resolve(experimentDir, ".store");
  const allowed = resolved === local || (resolved.startsWith("/tmp/n5-remainder-") && !resolved.includes(".."));
  if (!allowed) {
    const error = new Error("store_path_refused");
    error.code = "store_path_refused";
    throw error;
  }
}

function loadState(file) {
  if (!existsSync(file)) return { state: emptyState(), text: null };
  const text = readFileSync(file, "utf8");
  const state = JSON.parse(text);
  state.tasks ||= {};
  state.interests ||= [];
  state.journal ||= {};
  state.acceptances ||= [];
  return { state, text };
}

function saveState(file, state) {
  assertDeletableStore(dirname(file));
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify(state));
  renameSync(temporary, file);
}

function acceptanceView(review) {
  if (!review) return null;
  return {
    state: review.state,
    localAcceptanceId: review.receipt?.receiptId ?? null,
    realObligation: false,
    obligationId: null,
    funding: review.funding ?? null,
    paymentAuthority: review.paymentAuthority ?? null,
    paidWork: review.paidWork ?? null,
    debtCreated: review.debtCreated ?? null,
  };
}

function spawnCase(args) {
  const started = existsSync(args.store);
  const child = spawnSync(process.execPath, [here, ...args.argv], {
    cwd: writerRoot,
    encoding: "utf8",
  });
  let parsed = null;
  try {
    parsed = JSON.parse(child.stdout);
  } catch {
    parsed = null;
  }
  return {
    status: child.status,
    parsed,
    stderr: child.stderr,
    storeCreated: !started && existsSync(args.store),
    storePresent: existsSync(args.store),
  };
}

function prove(args) {
  const sentinel = resolve(`/tmp/n5-remainder-sentinel-${process.pid}`);
  rmSync(sentinel, { recursive: true, force: true });
  const defaultStore = resolve(experimentDir, ".store");
  const defaultBefore = existsSync(defaultStore);
  const runs = [];
  const add = (name, argv, expect) => {
    const result = spawnCase({ store: sentinel, argv: ["--store", sentinel, ...argv] });
    const parsed = result.parsed || {};
    const ok = result.status === expect.status
      && parsed.code === expect.code
      && result.storeCreated === false
      && result.storePresent === false
      && (expect.positive == null || parsed.positive === expect.positive)
      && (expect.stopped == null || parsed.stopped === expect.stopped);
    runs.push({
      name,
      status: result.status,
      code: parsed.code ?? null,
      positive: parsed.positive ?? null,
      stopped: parsed.stopped ?? null,
      storeCreated: result.storeCreated,
      delegationEmitted: parsed.delegationEmitted ?? null,
      obligationCount: parsed.obligationCount ?? null,
      feeRead: parsed.feeRead ?? null,
      ok,
      stderr: ok ? "" : result.stderr.slice(0, 400),
    });
  };
  add("correct-pin", ["--case", "pin", "--source-root", args.sourceRoot], {
    status: 0,
    code: null,
    positive: true,
  });
  add("wrong-pin", ["--case", "pin", "--source-root", args.wrongRoot], {
    status: 2,
    code: "wrong_pin",
    positive: false,
    stopped: true,
  });
  add("missing-source-root", ["--case", "pin"], {
    status: 2,
    code: "missing_source_root",
    positive: false,
    stopped: true,
  });
  add("absent-source-root", ["--case", "pin", "--source-root", "/tmp/sds-n5-absent-root"], {
    status: 2,
    code: "missing_source_root",
    positive: false,
    stopped: true,
  });
  add("missing-file", ["--case", "pin", "--source-root", args.missingRoot], {
    status: 2,
    code: "missing_file",
    positive: false,
    stopped: true,
  });
  const gate = spawnSync(process.execPath, [resolve(experimentDir, "import-gate.mjs")], {
    cwd: writerRoot,
    encoding: "utf8",
  });
  let gateParsed = null;
  try {
    gateParsed = JSON.parse(gate.stdout);
  } catch {
    gateParsed = null;
  }
  const map = gateParsed?.checks?.find((row) => row.role === "capture-cli-map");
  const gateOk = gate.status === 2
    && gateParsed?.stopped === true
    && gateParsed?.missing?.length === 6
    && gateParsed?.delegationEmitted === 0
    && gateParsed?.obligationCount === 0
    && gateParsed?.feeLine == null
    && gateParsed?.joinedRecord == null
    && gateParsed?.head === writerHead()
    && map?.pinBlobMatch === true
    && map?.exportPresent === true;
  runs.push({
    name: "default-main-import-gate",
    status: gate.status,
    code: gateOk ? "exit_2" : "import_gate_changed",
    positive: false,
    stopped: gateParsed?.stopped ?? null,
    storeCreated: !defaultBefore && existsSync(defaultStore),
    delegationEmitted: gateParsed?.delegationEmitted ?? null,
    obligationCount: gateParsed?.obligationCount ?? null,
    feeRead: null,
    missing: gateParsed?.missing?.length ?? null,
    ok: gateOk && !(!defaultBefore && existsSync(defaultStore)),
    stderr: gateOk ? "" : (gate.stderr || "").slice(0, 400),
  });
  const record = envelope(args, {
    case: "prove",
    stopped: runs.some((row) => !row.ok),
    positive: runs.every((row) => row.ok),
    runs,
    sentinelExists: existsSync(sentinel),
    defaultStoreCreated: !defaultBefore && existsSync(defaultStore),
  });
  record.effects.storeWritten = record.sentinelExists || record.defaultStoreCreated;
  emit(record, record.positive ? 0 : 2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    emit(envelope({ caseName: "arguments" }, {
      stopped: true,
      positive: false,
      code: "unknown_argument",
      message: args.error,
    }), 2);
  }
  const storeDir = resolve(args.store || resolve(experimentDir, ".store"));
  const file = storeFile(storeDir);
  if (args.caseName === "prove") {
    if (!args.sourceRoot || !args.wrongRoot || !args.missingRoot) {
      emit(envelope(args, {
        stopped: true,
        positive: false,
        code: "missing_source_root",
        message: "prove requires --source-root, --wrong-root, and --missing-root",
      }), 2);
    }
    prove(args);
  }

  const verified = verifySource(args.sourceRoot);
  if (!verified.ok) {
    emit(envelope(args, {
      stopped: true,
      positive: false,
      code: verified.code,
      message: verified.message,
      sourceRoot: verified.root,
      sourceHead: verified.head ?? null,
      sourceTree: verified.tree ?? null,
      blobChecks: verified.blobChecks ?? null,
      blobs: verified.blobs ?? null,
    }), 2);
  }

  let loaded;
  try {
    loaded = await loadCores(verified);
  } catch (error) {
    emit(envelope(args, {
      stopped: true,
      positive: false,
      code: failureCode(error) || "IMPORT_FAILED",
      message: String(error.message || error).split("\n")[0],
      sourceRoot: verified.root,
      sourceHead: verified.head,
      sourceTree: verified.tree,
    }), 2);
  }
  if (!loaded.ok) {
    emit(envelope(args, {
      stopped: true,
      positive: false,
      code: loaded.code,
      message: loaded.message,
      sourceRoot: verified.root,
      sourceHead: verified.head,
      sourceTree: verified.tree,
    }), 2);
  }
  const cores = loaded.cores;
  const source = {
    sourceRoot: verified.root,
    sourceHead: verified.head,
    sourceTree: verified.tree,
    blobs: verified.blobs,
  };

  if (args.caseName === "pin") {
    emit(envelope(args, {
      ...source,
      stopped: false,
      positive: true,
      code: null,
      exports: {
        decideOrReuse: typeof cores.decideOrReuse === "function",
        projectResult: typeof cores.projectResult === "function",
        n45RecordToObservation: typeof cores.n45RecordToObservation === "function",
        voluntaryMarket: typeof cores.voluntaryMarket === "function",
        proposalFrom: typeof cores.proposalFrom === "function",
        quoteEconomics: typeof cores.quoteEconomics === "function",
      },
    }), 0);
  }

  if (args.caseName === "whole") {
    const hit = bindAndDecide(cores, CONTENT_HASH);
    if (!hit.ok || hit.verdict?.verdict !== "reuse") {
      emit(envelope(args, {
        ...source,
        stopped: true,
        code: "capture_not_reused",
        message: hit.bound?.message || hit.verdict?.message || hit.verdict?.reason || "capture was not reused",
        verdict: hit.verdict?.verdict ?? null,
        reason: hit.verdict?.reason ?? null,
      }), 2);
    }
    const split = splitRemainder(hit.verdict, [DIRECT_FIELD]);
    emit(envelope(args, {
      ...source,
      stopped: split.falsified,
      falsified: split.falsified,
      code: split.falsified ? "falsified" : null,
      verdict: hit.verdict.verdict,
      reason: hit.verdict.reason ?? null,
      producerInvoked: hit.verdict.producerInvoked,
      coreEmittedDelegation: split.coreEmitted,
      delegation: split.delegation,
      delegationEmitted: split.delegation ? 1 : 0,
      direct: directPart(hit.verdict),
      projection: compactProjection(cores, hit.verdict.decision),
      observationSchema: hit.bound.observation?.schema ?? null,
    }), split.falsified ? 2 : 0);
  }

  if (args.caseName === "miss") {
    const hit = bindAndDecide(cores, CONTENT_HASH, MISS_HASH);
    const verdict = hit.verdict;
    const split = verdict ? splitRemainder(verdict, [DIRECT_FIELD, REMAINDER_FIELD]) : { delegation: null, falsified: false };
    const refused = verdict?.verdict === "recompute" && split.delegation == null && split.falsified === false;
    emit(envelope(args, {
      ...source,
      stopped: !refused,
      code: refused ? null : "capture_miss_not_refused",
      verdict: verdict?.verdict ?? null,
      reason: verdict?.reason ?? null,
      message: verdict?.message ?? hit.bound?.message ?? null,
      producerInvoked: verdict?.producerInvoked ?? null,
      delegation: null,
      delegatedWholeTask: false,
      direct: verdict ? directPart(verdict) : null,
    }), refused ? 0 : 2);
  }

  if (args.caseName === "rights") {
    const state = emptyState();
    let refused = false;
    let code = null;
    let message = null;
    try {
      await offerOnly(cores, state, { ...WIDER_RIGHTS }, "n5widerright", "n5wider01");
    } catch (error) {
      refused = true;
      code = failureCode(error);
      message = String(error.message || error).split("\n")[0];
    }
    const wrote = state.acceptances.length > 0 || Object.keys(state.journal).length > 0;
    emit(envelope(args, {
      ...source,
      stopped: wrote,
      code: wrote ? "rights_wrote_state" : code,
      message,
      refused,
      parentScope: PARENT_RIGHTS.scope,
      remainderScope: WIDER_RIGHTS.scope,
      journalEntries: Object.keys(state.journal).length,
      localAcceptanceCount: state.acceptances.length,
      feeRead: null,
      delegation: null,
    }), wrote ? 2 : 0);
  }

  if (args.caseName === "specialist-fail") {
    const hit = bindAndDecide(cores, CONTENT_HASH);
    if (!hit.ok || hit.verdict?.verdict !== "reuse") {
      emit(envelope(args, {
        ...source,
        stopped: true,
        code: "capture_not_reused",
        message: hit.verdict?.message || hit.bound?.message || "capture was not reused",
      }), 2);
    }
    let specialistCode = null;
    try {
      specialistFixture(REMAINDER_FIELD, "fail");
    } catch (error) {
      specialistCode = failureCode(error);
    }
    emit(envelope(args, {
      ...source,
      stopped: false,
      code: specialistCode,
      direct: directPart(hit.verdict),
      remainder: { id: REMAINDER_FIELD, field: REMAINDER_FIELD, unresolved: true },
      delegation: null,
      specialist: null,
      feeRead: null,
    }), 0);
  }

  if (args.caseName === "in-process") {
    const hit = bindAndDecide(cores, CONTENT_HASH);
    if (!hit.ok || hit.verdict?.verdict !== "reuse") {
      emit(envelope(args, {
        ...source,
        stopped: true,
        code: "capture_not_reused",
        message: hit.verdict?.message || hit.bound?.message || "capture was not reused",
      }), 2);
    }
    const direct = directPart(hit.verdict);
    const started = process.hrtime.bigint();
    const output = inProcessRecord(direct);
    const elapsedNs = Number(process.hrtime.bigint() - started);
    const present = Object.hasOwn(output, REMAINDER_FIELD) && output[REMAINDER_FIELD] === REMAINDER_VALUE;
    emit(envelope(args, {
      ...source,
      stopped: false,
      code: null,
      direct,
      inProcess: output,
      delegation: output.delegation,
      specialistOnlyFieldPresent: present,
      comparison: present ? "negative" : "specialist_field_absent",
      filesTouched: [],
      filesTouchedCount: 0,
      elapsedNs,
      minutes: elapsedNs / 60e9,
      feeRead: null,
    }), 0);
  }

  const requestedCase = args.caseName;
  if (args.caseName === "recover") {
    try {
      assertDeletableStore(storeDir);
    } catch (error) {
      emit(envelope(args, { ...source, stopped: true, code: failureCode(error), message: error.message }), 2);
    }
    const existed = existsSync(storeDir);
    rmSync(storeDir, { recursive: true, force: true });
    args.caseName = "normal";
    args.recoveredFrom = existed ? storeDir : null;
  }

  if (args.caseName !== "normal" && args.caseName !== "retry") {
    emit(envelope(args, {
      ...source,
      stopped: true,
      code: "unknown_case",
      message: `unknown case ${args.caseName}`,
    }), 2);
  }

  if (args.caseName === "retry" && !existsSync(file)) {
    emit(envelope(args, {
      ...source,
      stopped: true,
      code: "acceptance_absent",
      message: "retry found no committed local acceptance",
    }), 2);
  }

  const hit = bindAndDecide(cores, CONTENT_HASH);
  if (!hit.ok || hit.verdict?.verdict !== "reuse") {
    emit(envelope(args, {
      ...source,
      stopped: true,
      code: "capture_not_reused",
      message: hit.verdict?.message || hit.verdict?.reason || hit.bound?.message || "capture was not reused",
      verdict: hit.verdict?.verdict ?? null,
    }), 2);
  }
  const split = splitRemainder(hit.verdict, [DIRECT_FIELD, REMAINDER_FIELD]);
  if (split.falsified || split.delegation == null) {
    emit(envelope(args, {
      ...source,
      stopped: true,
      falsified: split.falsified,
      code: split.falsified ? "falsified" : "remainder_absent",
      delegation: split.delegation,
      delegationEmitted: split.delegation ? 1 : 0,
      missing: split.missing,
    }), 2);
  }
  const specialist = specialistFixture(split.delegation.fields[0], "pass");
  const copied = captureContains(specialist.value, hit.verdict, hit.input);
  if (copied || split.delegation.fields.some((field) => field !== REMAINDER_FIELD)) {
    emit(envelope(args, {
      ...source,
      stopped: true,
      code: "complementarity_failed",
      complementarity: "failed",
      delegation: split.delegation,
      specialist,
      feeRead: null,
    }), 2);
  }

  const loadedState = loadState(file);
  const state = loadedState.state;
  let review = null;
  let proposal = null;
  try {
    const accepted = await acceptJoined(cores, state);
    review = accepted.review;
    proposal = cores.proposalFrom(accepted.row, proposalInput(cores, accepted.row));
  } catch (error) {
    emit(envelope(args, {
      ...source,
      stopped: true,
      code: failureCode(error),
      message: String(error.message || error).split("\n")[0],
      direct: directPart(hit.verdict),
      delegation: split.delegation,
      delegationEmitted: 1,
      feeRead: null,
    }), 2);
  }

  const prior = state.acceptances.find((row) => row.taskId === TASK_ID);
  const feeRead = prior ? prior.feeRead : readFee(cores.quoteEconomics);
  const commit = commitAcceptance(state, review, feeRead);
  if (args.caseName === "retry" && commit.newLocalAcceptances !== 0) {
    emit(envelope(args, {
      ...source,
      stopped: true,
      code: "retry_appended",
      message: "retry appended a local acceptance",
      newLocalAcceptances: commit.newLocalAcceptances,
      newObligations: commit.newObligations,
    }), 2);
  }
  const nextText = JSON.stringify(state);
  let storeWritten = false;
  if (nextText !== loadedState.text) {
    saveState(file, state);
    storeWritten = true;
  }
  const obligation = obligationView(commit.acceptance, commit);
  const rightsDecision = {
    source: "offerVoluntary",
    license: PARENT_RIGHTS.license,
    scope: PARENT_RIGHTS.scope,
    allowed: true,
  };
  const joinedRecord = {
    consumer: "synthetic-normal",
    direct: directPart(hit.verdict),
    remainder: {
      id: split.delegation.remainderId,
      field: REMAINDER_FIELD,
      missingFromCapture: true,
    },
    delegation: split.delegation,
    coreDelegation: null,
    rightsDecision,
    publicationFence: {
      called: true,
      applied: false,
      schema: proposal?.proposal?.schema ?? null,
      proposalDigest: proposal?.proposalDigest ?? null,
    },
    specialist,
    acceptance: acceptanceView(review),
    obligation,
    feeRead,
    projection: compactProjection(cores, hit.verdict.decision),
    observationSchema: hit.bound.observation?.schema ?? null,
    producerInvoked: hit.verdict.producerInvoked,
    verdict: hit.verdict.verdict,
  };
  const effects = emptyEffects();
  effects.storeWritten = storeWritten;
  emit(envelope(args, {
    ...source,
    case: requestedCase,
    stopped: false,
    code: null,
    recoveredFrom: args.recoveredFrom ?? null,
    joinedRecord,
    delegation: split.delegation,
    delegationEmitted: 1,
    obligation,
    obligationCount: 0,
    localAcceptanceCount: state.acceptances.length,
    newObligations: commit.newObligations,
    newLocalAcceptances: commit.newLocalAcceptances,
    feeRead,
    effects,
    complementarity: "field_absent_from_capture",
  }), 0);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exit(1);
});
