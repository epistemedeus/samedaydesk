import {createHash, timingSafeEqual} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

export const ACTIVATION_PATH = "/v1/root/funded-round-activation";
const PREFIX = "/api/neomorphic-contributor-journey";
const SCHEMA = "neomorphic.funded-round-activation.v1";
const RECEIPT = "neomorphic.funded-round-activation-receipt.v1";
const SCOPE = "funded_round_activation";
const DESK_SOURCE = fileURLToPath(new URL("../../vendor/neomorphic-contributor-desk/SOURCE.json", import.meta.url));
const LEGACY = new Set(["agent-opportunity-221400-v1", "contributor-reuse-trial-100198"]);
const STATUSES = {
  unauthorized: 401, not_found: 404, canonical_round_absent: 404, method_refused: 405,
  invalid_activation: 422, missing_reserve_authority: 422, requester_mismatch: 403,
  authority_expired: 403, public_binding_refused: 403, installation_mismatch: 409,
  allocation_terms_mismatch: 409, canonical_round_mismatch: 409, replay_conflict: 409,
  identity_conflict: 409, round_capacity_refused: 409, round_closed: 409,
  unavailable: 503, activation_failed: 500,
};
let deskCommit;

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function sha256(value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  return createHash("sha256").update(data).digest("hex");
}
function tokenMatches(presented, expected) {
  if (typeof presented !== "string" || typeof expected !== "string" || !presented || !expected) return false;
  return timingSafeEqual(createHash("sha256").update(presented).digest(), createHash("sha256").update(expected).digest());
}
function operationKey(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{8,160}$/.test(value);
}
export function isFundedRoundActivation(req) {
  const path = String(req.path || "").split("?")[0];
  if (path === ACTIVATION_PATH) return true;
  return String(req.originalUrl || req.url || "").split("?")[0] === PREFIX + ACTIVATION_PATH;
}
async function deskSourceCommit() {
  if (!deskCommit) {
    const parsed = JSON.parse(await readFile(DESK_SOURCE, "utf8"));
    if (!/^[a-f0-9]{40}$/.test(parsed.sourceCommit ?? "")) throw coded("installation_mismatch");
    deskCommit = parsed.sourceCommit;
  }
  return deskCommit;
}
function readRaw(req) {
  return new Promise((resolve, reject) => {
    if (req.readableEnded) { resolve(Buffer.alloc(0)); return; }
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 32768) { reject(coded("invalid_activation")); req.pause(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(coded("invalid_activation")));
  });
}
function queryOperation(req) {
  const raw = String(req.originalUrl || req.url || "");
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get("operation");
}
function stablePin(pin) {
  return JSON.stringify({
    roundKey: pin.roundKey, provenance: pin.provenance, roundId: pin.roundId, termsVersion: pin.termsVersion,
    tasks: pin.tasks.map(task => ({offerKey: task.offerKey, requesterAccountId: task.requesterAccountId, publicDiscussion: task.publicDiscussion})),
  });
}
function canonicalPin(pin) {
  if (!pin || typeof pin !== "object" || Array.isArray(pin) || pin.provenance !== "production") throw coded("invalid_activation");
  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(pin.roundKey ?? "") || LEGACY.has(pin.roundKey)) throw coded("invalid_activation");
  if (!/^rnd_[A-Za-z0-9_-]{16}$/.test(pin.roundId ?? "") || !/^sha256:[a-f0-9]{64}$/.test(pin.termsVersion ?? "")) throw coded("invalid_activation");
  if (!Array.isArray(pin.tasks) || pin.tasks.length < 1 || pin.tasks.length > 64) throw coded("invalid_activation");
  const seen = new Set();
  const tasks = pin.tasks.map(task => {
    if (!task || typeof task !== "object" || Array.isArray(task)) throw coded("invalid_activation");
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(task.offerKey ?? "") || !/^acc_[A-Za-z0-9_-]{16}$/.test(task.requesterAccountId ?? "")) throw coded("invalid_activation");
    if (task.publicDiscussion !== false) throw coded("public_binding_refused");
    if (seen.has(task.offerKey)) throw coded("invalid_activation");
    seen.add(task.offerKey);
    return {offerKey: task.offerKey, requesterAccountId: task.requesterAccountId, publicDiscussion: false};
  });
  return {roundKey: pin.roundKey, provenance: "production", roundId: pin.roundId, termsVersion: pin.termsVersion, tasks};
}
async function assertInstallation(body, env) {
  const installed = body.installation;
  const desk = await deskSourceCommit();
  const expected = {
    origin: env.CONTRIBUTOR_JOURNEY_ORIGIN, sdsCommit: env.CONTRIBUTOR_DESK_SDS_SOURCE_COMMIT,
    runtimeSourceCommit: env.CONTRIBUTOR_JOURNEY_SOURCE_COMMIT, deskSourceCommit: desk,
    buildId: env.CONTRIBUTOR_DESK_INSTALLATION_ID, storeId: env.CONTRIBUTOR_JOURNEY_STORE_ID,
    earnedWorkSchema: env.CONTRIBUTOR_JOURNEY_EARNED_WORK_SCHEMA, correspondenceSchema: env.CONTRIBUTOR_JOURNEY_CORRESPONDENCE_SCHEMA,
  };
  if (!installed || typeof installed !== "object" || Array.isArray(installed)) throw coded("installation_mismatch");
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value !== "string" || !value || installed[key] !== value) throw coded("installation_mismatch");
  }
}
function assertAllocationShape(allocation) {
  if (!allocation || typeof allocation !== "object" || Array.isArray(allocation) || allocation.schema !== "pilot.root-allocation-receipt.v1" || allocation.status !== "reserved" ||
      typeof allocation.recordRef !== "string" || allocation.recordRef.length <= 5 || typeof allocation.operationId !== "string" || allocation.operationId.length <= 5 ||
      !Number.isFinite(Date.parse(allocation.reservedAt)) || Date.parse(allocation.reservedAt) > Date.now()) throw coded("missing_reserve_authority");
}
function assertAllocationMatches(allocation, pin, row, packetHash, allocationHash) {
  const deadline = new Date(row.submission_deadline).getTime();
  const fee = row.transfer_fee_cap && typeof row.transfer_fee_cap === "object" ? row.transfer_fee_cap.amountAtomic : undefined;
  if (allocation.roundId !== pin.roundKey || allocation.termsVersion !== pin.termsVersion || allocation.termsPacketSha256 !== packetHash ||
      allocation.asset !== "USDC" || allocation.chainId !== 8453 || allocation.principalReserveAtomicUsdc !== String(row.principal_cap_atomic) ||
      allocation.gasCapWei !== fee || !Number.isFinite(deadline) || deadline !== Date.parse(allocation.deadline) || sha256(allocation) !== allocationHash) {
    throw coded("allocation_terms_mismatch");
  }
}
function arraysOf(runtime) {
  const admission = runtime?.installed?.admission;
  const claims = runtime?.installed?.claims;
  const inner = admission?.config?.installed?.futureRounds;
  const outer = runtime?.config?.installed?.futureRounds;
  if (!admission?.kernel || !runtime.installed.db || !claims || !Array.isArray(inner) || !Array.isArray(claims.rounds)) throw coded("unavailable");
  return {admission, claims, inner, outer, db: runtime.installed.db, kernel: admission.kernel};
}
async function restoreLive(found, pin) {
  const existing = found.inner.find(item => item.roundKey === pin.roundKey || item.roundId === pin.roundId);
  if (existing) {
    if (stablePin(existing) !== stablePin(pin)) throw coded("identity_conflict");
    return;
  }
  const undo = remember(found, pin);
  try {
    for (const task of pin.tasks) await found.db.enrollTask(`${pin.roundKey}:${task.offerKey}`, task.requesterAccountId);
    await found.admission.checkReady();
  } catch (error) {
    undo();
    mapFailure(error);
  }
}
function remember(found, pin) {
  const {inner, outer, claims} = found;
  const existing = inner.find(item => item.roundKey === pin.roundKey || item.roundId === pin.roundId);
  if (existing) {
    if (stablePin(existing) !== stablePin(pin)) throw coded("identity_conflict");
    return () => {};
  }
  if (inner.length >= 16 || (Array.isArray(outer) && outer !== inner && outer.length >= 16)) throw coded("round_capacity_refused");
  const marked = {inner: inner.length, outer: Array.isArray(outer) && outer !== inner ? outer.length : null, rounds: claims.rounds.length, tasks: Array.isArray(claims.options?.taskIds) ? claims.options.taskIds.length : null};
  inner.push(pin);
  if (marked.outer !== null) outer.push(pin);
  claims.rounds.push({...pin, tasks: pin.tasks.map(task => ({...task}))});
  if (marked.tasks !== null) {
    for (const task of pin.tasks) {
      const taskId = `${pin.roundKey}:${task.offerKey}`;
      if (!claims.options.taskIds.includes(taskId)) claims.options.taskIds.push(taskId);
    }
  }
  return () => {
    inner.length = marked.inner;
    if (marked.outer !== null) outer.length = marked.outer;
    claims.rounds.length = marked.rounds;
    if (marked.tasks !== null) claims.options.taskIds.length = marked.tasks;
  };
}
function storedBody(row) {
  return typeof row.response_json === "string" ? JSON.parse(row.response_json) : row.response_json;
}
async function loadCanonical(found, pin) {
  return found.kernel.withOpportunityClient(async client => (await client.query(
    `SELECT id, round_key, status, terms_version, production_admission, principal_cap_atomic, submission_deadline, transfer_fee_cap, asset, chain_id
     FROM opportunity_rounds WHERE round_key=$1 AND provenance='production'`, [pin.roundKey])).rows[0] ?? null, "read");
}
async function assertCurrentBinding(body, pin, found, env, owed) {
  if (typeof body.requesterAccountId !== "string" || !/^acc_[A-Za-z0-9_-]{16}$/.test(body.requesterAccountId) ||
      pin.tasks.some(task => task.requesterAccountId !== body.requesterAccountId)) throw coded("requester_mismatch");
  if (typeof body.packetHash !== "string" || !/^[a-f0-9]{64}$/.test(body.packetHash) || typeof body.allocationHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.allocationHash) || body.termsVersion !== pin.termsVersion) throw coded("allocation_terms_mismatch");
  await assertInstallation(body, env);
  assertAllocationShape(body.allocation);
  if (body.allocation.termsPacketSha256 !== body.packetHash || body.allocation.termsVersion !== pin.termsVersion) throw coded("allocation_terms_mismatch");
  const row = await loadCanonical(found, pin);
  if (!row) throw coded("canonical_round_absent");
  if (row.id !== pin.roundId || row.round_key !== pin.roundKey || row.terms_version !== pin.termsVersion || row.production_admission !== true ||
      row.asset !== "USDC" || Number(row.chain_id) !== 8453) throw coded("canonical_round_mismatch");
  assertAllocationMatches(body.allocation, pin, row, body.packetHash, body.allocationHash);
  // A stored receipt may restore owed access after close or expiry. It does not change round status.
  if (!owed) {
    if (row.status !== "open") throw coded("round_closed");
    if (new Date(row.submission_deadline).getTime() <= Date.now()) throw coded("authority_expired");
  }
  const account = await found.kernel.withOpportunityClient(async client => (await client.query("SELECT id FROM journey_accounts WHERE id=$1", [body.requesterAccountId])).rows[0] ?? null, "read");
  if (!account) throw coded("requester_mismatch");
  for (const task of pin.tasks) {
    const taskId = `${pin.roundKey}:${task.offerKey}`;
    const link = await found.kernel.withOpportunityClient(async client => (await client.query(
      "SELECT requester_account_id, public_discussion FROM journey_task_links WHERE task_id=$1", [taskId])).rows[0] ?? null, "read");
    if (link && (link.requester_account_id !== body.requesterAccountId || link.public_discussion !== false)) throw coded("requester_mismatch");
  }
  return row;
}
async function readReceipt(kernel, operation) {
  return kernel.withOpportunityClient(async client => (await client.query(
    "SELECT request_hash, response_json FROM earned_work_idempotency WHERE scope=$1 AND task_id=$2 AND key=$3",
    [SCOPE, "", operation])).rows[0] ?? null, "read");
}
async function saveReceipt(kernel, operation, bodyHash, receipt) {
  return kernel.withOpportunityClient(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 99010))", [`funded-round-activation:${operation}`]);
    const row = (await client.query(
      "SELECT request_hash, response_json FROM earned_work_idempotency WHERE scope=$1 AND task_id=$2 AND key=$3 FOR UPDATE",
      [SCOPE, "", operation])).rows[0];
    if (row) {
      if (row.request_hash !== bodyHash) throw coded("replay_conflict");
      return storedBody(row);
    }
    await client.query(`INSERT INTO earned_work_idempotency(
      scope, task_id, key, request_hash, status_code, response_json, created_at, principal_id
    ) VALUES($1,'',$2,$3,200,$4::jsonb,$5,'owner')`, [SCOPE, operation, bodyHash, JSON.stringify(receipt), new Date().toISOString()]);
    return receipt;
  }, "idempotent");
}
function send(res, status, body) {
  res.status(status).json(body);
}
function mapFailure(error) {
  if (error?.code && STATUSES[error.code]) throw error;
  const message = String(error?.message || "");
  if (message === "task authority already enrolled" || message === "requester differs from the durable binding") throw coded("identity_conflict");
  if (message === "existing canonical offer and requester account required") throw coded("requester_mismatch");
  if (message === "selected canonical round is absent") throw coded("canonical_round_absent");
  throw error?.code ? error : coded("activation_failed");
}
async function activate(req, res, env, runtime) {
  if (!["GET", "POST"].includes(req.method)) throw coded("method_refused");
  const expected = runtime?.config?.storage?.ownerToken;
  if (typeof expected !== "string" || !expected || expected !== env.CONTRIBUTOR_JOURNEY_OWNER_TOKEN) throw coded("unavailable");
  const presented = typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (!tokenMatches(presented, expected)) throw coded("unauthorized");
  const found = arraysOf(runtime);
  if (req.method === "GET") {
    const operation = queryOperation(req);
    if (!operationKey(operation)) throw coded("not_found");
    const row = await readReceipt(found.kernel, operation);
    if (!row) throw coded("not_found");
    send(res, 200, storedBody(row));
    return;
  }
  const raw = await readRaw(req);
  const bodyHash = sha256(raw);
  let body;
  try { body = JSON.parse(raw.toString("utf8")); } catch { throw coded("invalid_activation"); }
  if (!body || typeof body !== "object" || Array.isArray(body) || body.schema !== SCHEMA || !operationKey(body.operation)) throw coded("invalid_activation");
  const operation = body.operation;
  const prior = await readReceipt(found.kernel, operation);
  if (prior) {
    if (prior.request_hash !== bodyHash) throw coded("replay_conflict");
    const pin = canonicalPin(body.pin);
    await assertCurrentBinding(body, pin, found, env, true);
    await restoreLive(found, pin);
    send(res, 200, storedBody(prior));
    return;
  }
  const pin = canonicalPin(body.pin);
  await assertCurrentBinding(body, pin, found, env, false);
  const undo = remember(found, pin);
  try {
    for (const task of pin.tasks) await found.db.enrollTask(`${pin.roundKey}:${task.offerKey}`, task.requesterAccountId);
    await found.admission.checkReady();
    const receipt = {
      schema: RECEIPT, operation, bodyHash, roundId: pin.roundId, roundKey: pin.roundKey,
      taskId: `${pin.roundKey}:${pin.tasks[0].offerKey}`, taskIds: pin.tasks.map(task => `${pin.roundKey}:${task.offerKey}`),
      termsVersion: pin.termsVersion, requesterAccountId: body.requesterAccountId, enrolled: true, duplicateEffect: false,
      activatedAt: new Date().toISOString(),
    };
    send(res, 200, await saveReceipt(found.kernel, operation, bodyHash, receipt));
  } catch (error) {
    undo();
    mapFailure(error);
  }
}
export async function handleFundedRoundActivation(req, res, {env, runtime}) {
  try {
    await activate(req, res, env, runtime);
  } catch (error) {
    const code = STATUSES[error.code] ? error.code : "activation_failed";
    if (!res.headersSent) res.status(STATUSES[code]).json({schema: SCHEMA, error: {code}});
    if (code === "activation_failed") {
      const message = typeof error.message === "string" && error.message.length < 180 && !/select |insert |update |postgres:|ew_ctr_|acs_|bearer /i.test(error.message) ? error.message : "activation_failed";
      console.error("funded_round_activation_failed", {code: message});
    }
  }
}
