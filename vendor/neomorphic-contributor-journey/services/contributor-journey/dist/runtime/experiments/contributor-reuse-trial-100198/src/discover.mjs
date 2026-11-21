import {
  ALLOCATION,
  CLIENT_VERSION,
  CURRENT_OFFER_URL,
  DISCOVER_MAX_BYTES,
  DISCOVER_TIMEOUT_MS,
  EXIT,
  EXPIRES_AT,
  MAX_ACCEPTED,
  OFFER_ID,
  PREPARED_CLIENT_VERSION,
  REWARD,
  SCHEMA_CURRENT_DISCOVERY,
} from "./constants.mjs";
import { assessArtifact, FROZEN_TERMS_VERSION, parseInstant, preparedFrozenShell } from "./current-availability.mjs";

const NEGATIVE = new Set([
  "prepared",
  "artifact_missing",
  "malformed",
  "wrong_offer",
  "wrong_terms",
  "stale_terms",
  "impossible_accounting",
  "impossible_future",
  "supplied_status",
  "fake_paid",
  "private_input",
  "closed",
  "exhausted",
  "expired",
  "frozen_offer_unusable",
  "unavailable",
  "bounded_read",
  "not_admitted",
  "not_open",
]);

export function exitFor(code) {
  if (code === "ok") return EXIT.ok;
  if (code === "wrong_terms" || code === "stale_terms") return EXIT.stale_terms;
  if (code === "wrong_offer" || code === "fake_paid") return EXIT.wrong_subject;
  if (code === "impossible_accounting" || code === "impossible_future") return EXIT.conflict;
  if (code === "private_input") return EXIT.private_input;
  if (code === "malformed" || code === "supplied_status" || code === "bounded_read" || code === "bad_claim") return EXIT.usage;
  return EXIT.unavailable;
}

export function offerUrlAllowed(url) {
  if (url === CURRENT_OFFER_URL) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return false;
  if (!parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
  return true;
}

export function resolveOfferUrl(value) {
  if (value == null) return { ok: true, url: CURRENT_OFFER_URL };
  if (typeof value !== "string" || !offerUrlAllowed(value)) return { ok: false };
  return { ok: true, url: value };
}

function summary(fields) {
  return {
    schema: SCHEMA_CURRENT_DISCOVERY,
    mode: "current_https",
    offerUrl: fields.offerUrl,
    clientVersion: CLIENT_VERSION,
    preparedClientVersion: PREPARED_CLIENT_VERSION,
    distinctFromPreparedSnapshot: true,
    termsVersion: fields.termsVersion ?? FROZEN_TERMS_VERSION,
    reward: REWARD,
    allocation: ALLOCATION,
    maxAccepted: MAX_ACCEPTED,
    expiresAt: EXPIRES_AT,
    evaluatedAt: fields.evaluatedAt ?? null,
    fetched: fields.fetched === true,
    bytes: Number.isInteger(fields.bytes) ? fields.bytes : 0,
    availabilityClass: fields.availabilityClass ?? "offline_prepared_snapshot",
    acceptsPublicSubmissions: fields.acceptsPublicSubmissions === true,
    admission: fields.acceptsPublicSubmissions === true ? "open" : "closed",
    reason: fields.reason,
    asOf: fields.asOf ?? null,
    asOfProjection: fields.asOfProjection ?? null,
    paid: false,
    observedSettlement: fields.observedSettlement ?? { paid: false, spent: "0", spentAtomic: "0", verifiedByClient: false },
    provenance: "unsigned_manual_publisher_statement",
    rootProvenance: false,
    reservesReward: false,
    ledgerIsFinalCapacity: true,
    hostedApi: "unavailable",
    claimRoute: "email",
    instantApi: false,
    publicLiveClaim: false,
    ok: fields.acceptsPublicSubmissions === true,
    capacity: fields.capacity ?? null,
  };
}

function refusal(code, message, fields) {
  const reason = NEGATIVE.has(code) ? code : "not_admitted";
  return {
    ok: false,
    exit: exitFor(reason),
    code: reason,
    message,
    body: summary({ ...fields, acceptsPublicSubmissions: false, reason }),
  };
}

function knownProjection(body) {
  const projection = body?.currentAvailability?.projection;
  if (projection && typeof projection === "object" && !Array.isArray(projection)) return projection;
  if (body?.schema === "neomorphic.contributor-reuse-trial.current-availability.v1") return body;
  return null;
}

function claimedOpen(body) {
  return body?.currentAvailability?.acceptsPublicSubmissions === true
    || body?.availability?.acceptsPublicSubmissions === true
    || body?.acceptsPublicSubmissions === true;
}

export function interpretCurrentOffer(body, { url, receivedAt, bytes }) {
  const base = { offerUrl: url, evaluatedAt: receivedAt, fetched: true, bytes };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return refusal("malformed", "current offer is malformed", base);
  }
  if (body.offerId && body.offerId !== OFFER_ID) return refusal("wrong_offer", "current offer id", base);
  if (body.termsVersion && body.termsVersion !== FROZEN_TERMS_VERSION) return refusal("wrong_terms", "current offer terms", base);
  if (body.reward && body.reward.amount !== REWARD) return refusal("wrong_terms", "current offer reward", base);
  if (body.allocation && (body.allocation.amount !== ALLOCATION || body.allocation.maxAccepted !== MAX_ACCEPTED)) {
    return refusal("wrong_terms", "current offer allocation", base);
  }
  const projection = knownProjection(body);
  if (!projection) {
    if (claimedOpen(body)) return refusal("supplied_status", "unsigned status cannot open admission", base);
    const stated = body.currentAvailability?.reason;
    const reason = typeof stated === "string" && NEGATIVE.has(stated) ? stated : "prepared";
    return refusal(reason, "current offer is not open at the caller clock", base);
  }
  const verdict = assessArtifact(projection, preparedFrozenShell(), receivedAt);
  if (!verdict.trusted) return refusal(verdict.reason, "current offer was not admitted", base);
  const accepts = verdict.admission.acceptsPublicSubmissions === true;
  const reason = verdict.admission.reason;
  const capacity = {
    acceptedCount: verdict.artifact.capacity.acceptedCount,
    remainingAccepts: verdict.artifact.capacity.remainingAccepts,
    exhausted: verdict.artifact.capacity.exhausted,
    committed: verdict.artifact.capacity.committed,
    spent: verdict.artifact.capacity.spent,
    spentAtomic: verdict.artifact.capacity.spentAtomic,
  };
  const document = summary({
    ...base,
    termsVersion: verdict.artifact.termsVersion,
    availabilityClass: "current_ledger",
    acceptsPublicSubmissions: accepts,
    reason,
    asOf: verdict.artifact.asOf,
    asOfProjection: verdict.admission.asOfProjection,
    capacity,
    observedSettlement: {
      paid: verdict.artifact.payment.paid === true,
      spent: verdict.artifact.capacity.spent,
      spentAtomic: verdict.artifact.capacity.spentAtomic,
      verifiedByClient: false,
    },
  });
  if (!accepts) {
    return { ok: false, exit: exitFor(reason), code: reason, message: "current offer is not open at the caller clock", body: document };
  }
  return { ok: true, exit: EXIT.ok, code: "ok", message: "open at the caller clock", body: document };
}

async function readBounded(url, timeoutMs, maxBytes) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
  } catch (error) {
    const name = error?.name;
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return { ok: false, code: "unavailable", message: timedOut ? "current offer timed out" : "current offer unavailable" };
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, code: "unavailable", message: "current offer status was not readable" };
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) return { ok: false, code: "bounded_read", message: "current offer exceeds the read bound" };
    return { ok: true, text, bytes: Buffer.byteLength(text) };
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, code: "bounded_read", message: "current offer exceeds the read bound" };
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return { ok: true, text, bytes: total };
}

export async function discoverCurrent({ url, receivedAt, timeoutMs = DISCOVER_TIMEOUT_MS, maxBytes = DISCOVER_MAX_BYTES }) {
  const resolved = resolveOfferUrl(url);
  const clock = typeof receivedAt === "string" ? receivedAt : new Date().toISOString();
  const base = { offerUrl: resolved.ok ? resolved.url : CURRENT_OFFER_URL, evaluatedAt: clock, fetched: false, bytes: 0 };
  if (!resolved.ok) return refusal("malformed", "current offer url is not the published API or an isolated loopback fixture", base);
  if (parseInstant(clock) == null) return refusal("malformed", "caller clock", base);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > DISCOVER_TIMEOUT_MS) {
    return refusal("malformed", "discover timeout", base);
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > DISCOVER_MAX_BYTES) {
    return refusal("malformed", "discover read bound", base);
  }
  const read = await readBounded(resolved.url, timeoutMs, maxBytes);
  if (!read.ok) return refusal(read.code, read.message, base);
  let parsed;
  try {
    parsed = JSON.parse(read.text);
  } catch {
    return refusal("malformed", "current offer is malformed", { ...base, fetched: true, bytes: read.bytes });
  }
  return interpretCurrentOffer(parsed, { url: resolved.url, receivedAt: clock, bytes: read.bytes });
}

export function claimAdmission(body, termsVersion) {
  if (!body || typeof body !== "object" || Array.isArray(body) || body.schema !== SCHEMA_CURRENT_DISCOVERY) {
    return { ok: false, exit: EXIT.usage, code: "malformed", message: "current admission file" };
  }
  if (body.publicLiveClaim !== false || body.rootProvenance !== false || body.reservesReward !== false || body.paid !== false || body.ledgerIsFinalCapacity !== true) {
    return { ok: false, exit: EXIT.usage, code: "supplied_status", message: "current admission cannot reserve a reward" };
  }
  if (body.termsVersion !== termsVersion) {
    return { ok: false, exit: EXIT.stale_terms, code: "wrong_terms", message: "current admission terms" };
  }
  const evaluated = parseInstant(body.evaluatedAt);
  if (evaluated == null || evaluated > parseInstant(EXPIRES_AT)) {
    return { ok: false, exit: EXIT.unavailable, code: "expired", message: "current offer is not open at the caller clock" };
  }
  if (body.acceptsPublicSubmissions !== true || body.admission !== "open" || body.reason !== "open" || body.ok !== true) {
    const reason = typeof body.reason === "string" && NEGATIVE.has(body.reason) ? body.reason : "not_admitted";
    return { ok: false, exit: exitFor(reason), code: reason, message: "current offer is not open at the caller clock" };
  }
  return { ok: true };
}
