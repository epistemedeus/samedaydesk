import {
  ALLOCATION,
  ALLOCATION_ATOMIC,
  ADMITTED_CLIENT_ARCHIVE,
  ADMITTED_CLIENT_SHA256,
  ADMITTED_CLIENT_VERSION,
  CLIENT_ARCHIVE,
  CLIENT_VERSION,
  CURRENT_OFFER_URL,
  EXIT,
  EXPIRES_AT,
  FROZEN_CURRENT_CLIENT_ARCHIVE,
  FROZEN_CURRENT_CLIENT_SHA256,
  FROZEN_CURRENT_CLIENT_VERSION,
  MAX_ACCEPTED,
  OFFER_ID,
  OFFER_VERSION,
  PREPARED_CLIENT_ARCHIVE,
  PREPARED_CLIENT_VERSION,
  REWARD,
  REWARD_ATOMIC,
  SCHEMA_LEDGER,
  SCHEMA_OFFER,
} from "./constants.mjs";
import { containsPrivate } from "./privacy.mjs";
import { isObservedPaid, observedSpentAtomic } from "./settlement-state.mjs";

export const SCHEMA_CURRENT_AVAILABILITY = "neomorphic.contributor-reuse-trial.current-availability.v1";
export const FROZEN_TERMS_VERSION = "sha256:e14dc997e07228bf05ef29a2b4f13433ddcdb791c293fd429a51764db20ad717";
export const CURRENT_ARTIFACT_REL = "public/machine/contributor-reuse-trial-100198-current.json";

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const ARTIFACT_KEYS = ["schema", "offerId", "termsVersion", "asOf", "lifecycle", "capacity", "expiry", "payment", "publication", "record"];
const LIFECYCLE_KEYS = ["state", "openedAt", "openedBy", "openedByWorker"];
const CAPACITY_KEYS = ["allocated", "maxAccepted", "acceptedCount", "remainingAccepts", "committed", "committedAtomic", "spent", "spentAtomic", "escrowed", "unit", "exhausted"];
const EXPIRY_KEYS = ["expiresAt", "expired", "expiryCancelsAccepted"];
const PAYMENT_KEYS = ["paid", "payoutEnabled", "automatic", "settlementBy", "paymentAuthority", "sourceReceivingIsPayment", "sourceReceivingIsAdoption"];
const PUBLICATION_KEYS = ["manual", "automatic", "heartbeat"];
const RECORD_KEYS = ["evidenceClass", "organicCustomer", "customerRevenue"];
const BANNED_KEYS = new Set([
  "claims",
  "contributorpublicid",
  "control",
  "controlprivatekey",
  "controlproof",
  "evidence",
  "evidenceexport",
  "grantpreimage",
  "grantsha256",
  "kernel",
  "measurement",
  "obligations",
  "payoutdestination",
  "payoutdestinationsha256",
  "privatekey",
  "publickey",
  "signature",
  "submissions",
]);

function fail(exit, code, message) {
  return { ok: false, exit, code, message };
}

export function parseInstant(value) {
  if (typeof value !== "string" || value.length > 24 || !INSTANT.test(value)) return null;
  const match = INSTANT.exec(value);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const date = new Date(ms);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  if (date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
  return ms;
}

export function currentClientDescriptor() {
  return {
    version: CLIENT_VERSION,
    distribution: CLIENT_ARCHIVE,
    acquisitionUrl: `https://neomorphic.io/downloads/contributor-reuse-trial/${CLIENT_VERSION}/${CLIENT_ARCHIVE}`,
    distinctFromPreparedSnapshot: true,
    preparedSnapshotVersion: PREPARED_CLIENT_VERSION,
    preparedSnapshotDistribution: PREPARED_CLIENT_ARCHIVE,
    frozenCurrentVersion: FROZEN_CURRENT_CLIENT_VERSION,
    frozenCurrentArchive: FROZEN_CURRENT_CLIENT_ARCHIVE,
    frozenCurrentSha256: FROZEN_CURRENT_CLIENT_SHA256,
    frozenCurrentIsAdmission: false,
    admittedClientVersion: ADMITTED_CLIENT_VERSION,
    admittedClientArchive: ADMITTED_CLIENT_ARCHIVE,
    admittedClientSha256: ADMITTED_CLIENT_SHA256,
    admittedClientIsAdmission: false,
    rootReceivingInArchive: false,
    discovery: "current_https_api",
    currentOfferUrl: CURRENT_OFFER_URL,
  };
}

const PROVENANCE = Object.freeze({
  provenance: "unsigned_manual_publisher_statement",
  rootProvenance: false,
  reservesReward: false,
  ledgerIsFinalCapacity: true,
});

function keyIssue(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "malformed";
  const present = Object.keys(value);
  if (present.some((key) => !keys.includes(key))) return "supplied_status";
  if (present.length !== keys.length) return "malformed";
  return null;
}

function hasBannedKey(value) {
  if (Array.isArray(value)) return value.some((item) => hasBannedKey(item));
  if (!value || typeof value !== "object") return false;
  for (const [key, item] of Object.entries(value)) {
    if (BANNED_KEYS.has(key.toLowerCase())) return true;
    if (hasBannedKey(item)) return true;
  }
  return false;
}

export function formatUsdc(atomic) {
  const value = BigInt(atomic);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 1000000n;
  const frac = (abs % 1000000n).toString().padStart(6, "0").slice(0, 2);
  const text = `${whole.toString()}.${frac}`;
  return negative ? `-${text}` : text;
}

function walkStrings(value, visit) {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) walkStrings(item, visit);
  }
}

function leakedSecrets(artifact, ledger) {
  const text = JSON.stringify(artifact);
  const allow = new Set([
    OFFER_ID,
    ledger.termsVersion,
    ledger.schema,
    EXPIRES_AT,
    artifact.asOf,
    artifact.lifecycle.openedAt,
    ledger.availability?.openedAt,
    ledger.createdAt,
    REWARD,
    ALLOCATION,
    "0",
    "0.00",
    REWARD_ATOMIC.toString(),
    ALLOCATION_ATOMIC.toString(),
    "owed",
    "open",
    "prepared",
    "expired",
    "closed",
    "root",
    "USDC",
    "base",
    "sponsored_evaluation",
    "accepted",
    "submitted",
    "active",
    "rejected",
    "revoked",
    "null_nonpaying_v0",
    "false",
    "true",
  ]);
  const found = [];
  for (const bag of [ledger.claims, ledger.submissions, ledger.obligations]) {
    walkStrings(bag, (secret) => {
      if (secret.length < 8 || allow.has(secret)) return;
      if (text.includes(secret)) found.push(secret);
    });
  }
  return found;
}

function frozenSnapshotOk(frozen) {
  return Boolean(frozen
    && frozen.schema === SCHEMA_OFFER
    && frozen.offerId === OFFER_ID
    && frozen.offerVersion === OFFER_VERSION
    && frozen.termsVersion === FROZEN_TERMS_VERSION
    && frozen.openedByWorker === false
    && frozen.publicExport === false
    && frozen.historicalH15Slots === "closed"
    && frozen.paymentAuthority === "none"
    && frozen.payoutEnabled === false
    && frozen.organicCustomer === false
    && frozen.customerRevenue === false
    && frozen.reward?.amount === REWARD
    && frozen.reward?.escrowed === false
    && frozen.reward?.automated === false
    && frozen.allocation?.amount === ALLOCATION
    && frozen.allocation?.maxAccepted === MAX_ACCEPTED
    && frozen.allocation?.escrowed === false
    && frozen.allocation?.spent === "0"
    && frozen.availability?.state === "prepared"
    && frozen.availability?.acceptsPublicSubmissions === false
    && frozen.availability?.expiresAt === EXPIRES_AT
    && frozen.availability?.expiryCancelsAccepted === false
    && frozen.client?.version === PREPARED_CLIENT_VERSION
    && frozen.client?.distribution === PREPARED_CLIENT_ARCHIVE
    && frozen.client?.rootReceivingInArchive === false
    && frozen.client?.discoverySnapshot === "prepared_source_snapshot"
    && frozen.claim?.mailbox?.deliveryVerified === false
    && frozen.claim?.mailbox?.workerClaimsLive === false);
}

export function preparedFrozenShell(termsVersion = FROZEN_TERMS_VERSION) {
  return {
    schema: SCHEMA_OFFER,
    offerId: OFFER_ID,
    offerVersion: OFFER_VERSION,
    termsVersion,
    openedByWorker: false,
    publicExport: false,
    historicalH15Slots: "closed",
    paymentAuthority: "none",
    payoutEnabled: false,
    organicCustomer: false,
    customerRevenue: false,
    reward: { amount: REWARD, escrowed: false, automated: false },
    allocation: { amount: ALLOCATION, maxAccepted: MAX_ACCEPTED, escrowed: false, spent: "0" },
    availability: canonicalPreparedAvailability(),
    client: {
      version: PREPARED_CLIENT_VERSION,
      distribution: PREPARED_CLIENT_ARCHIVE,
      rootReceivingInArchive: false,
      discoverySnapshot: "prepared_source_snapshot",
    },
    claim: { mailbox: { deliveryVerified: false, workerClaimsLive: false } },
  };
}

function canonicalPreparedAvailability() {
  return {
    state: "prepared",
    acceptsPublicSubmissions: false,
    expiresAt: EXPIRES_AT,
    expiryCancelsAccepted: false,
    openCommand: "node bin/trial.mjs open --ledger <root-ledger.json>",
    note: "Prepared. Not open. Root opens a reserved ledger only after mailbox delivery is verified and a real cold envelope arrives.",
  };
}

function badAdmission(reason) {
  return { trusted: false, reason, admission: null, artifact: null };
}

export function assessArtifact(artifact, frozen, receivedAt = new Date().toISOString()) {
  if (!frozenSnapshotOk(frozen)) return badAdmission("frozen_offer_unusable");
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return badAdmission("malformed");
  if (containsPrivate(artifact) || hasBannedKey(artifact)) return badAdmission("private_input");
  const topKeys = keyIssue(artifact, ARTIFACT_KEYS);
  if (topKeys) return badAdmission(topKeys);
  if (artifact.schema !== SCHEMA_CURRENT_AVAILABILITY) return badAdmission("malformed");
  if (artifact.offerId !== OFFER_ID) return badAdmission("wrong_offer");
  if (artifact.termsVersion !== FROZEN_TERMS_VERSION || artifact.termsVersion !== frozen.termsVersion) return badAdmission("wrong_terms");
  const asOfMs = parseInstant(artifact.asOf);
  const clockMs = parseInstant(receivedAt);
  if (asOfMs == null || clockMs == null) return badAdmission("malformed");
  for (const [value, keys] of [
    [artifact.lifecycle, LIFECYCLE_KEYS],
    [artifact.capacity, CAPACITY_KEYS],
    [artifact.expiry, EXPIRY_KEYS],
    [artifact.payment, PAYMENT_KEYS],
    [artifact.publication, PUBLICATION_KEYS],
    [artifact.record, RECORD_KEYS],
  ]) {
    const issue = keyIssue(value, keys);
    if (issue) return badAdmission(issue);
  }

  const { lifecycle, capacity, expiry, payment, publication, record } = artifact;
  if (lifecycle.openedByWorker !== false) return badAdmission("supplied_status");
  if (publication.manual !== true || publication.automatic !== false || publication.heartbeat !== false) return badAdmission("supplied_status");
  if (payment.sourceReceivingIsAdoption !== false || payment.settlementBy !== "root") return badAdmission("supplied_status");
  if (record.evidenceClass !== "sponsored_evaluation" || record.organicCustomer !== false || record.customerRevenue !== false) {
    return badAdmission("supplied_status");
  }
  if (typeof payment.paid !== "boolean" || payment.payoutEnabled !== false || payment.automatic !== false || payment.paymentAuthority !== "none" || payment.sourceReceivingIsPayment !== false) {
    return badAdmission("fake_paid");
  }
  if (capacity.allocated !== ALLOCATION || capacity.maxAccepted !== MAX_ACCEPTED || capacity.unit !== REWARD) return badAdmission("impossible_accounting");
  if (capacity.escrowed !== false) return badAdmission("impossible_accounting");
  if (!Number.isInteger(capacity.acceptedCount) || capacity.acceptedCount < 0 || capacity.acceptedCount > MAX_ACCEPTED) {
    return badAdmission("impossible_accounting");
  }
  if (expiry.expiresAt !== EXPIRES_AT || expiry.expiryCancelsAccepted !== false) return badAdmission("wrong_terms");
  const expiresMs = parseInstant(EXPIRES_AT);
  if (expiresMs == null) return badAdmission("malformed");
  let openedMs = null;
  if (lifecycle.openedAt !== null) {
    openedMs = parseInstant(lifecycle.openedAt);
    if (openedMs == null) return badAdmission("malformed");
    if (openedMs > asOfMs || openedMs > clockMs) return badAdmission("impossible_future");
    if (openedMs > expiresMs) return badAdmission("impossible_accounting");
  }
  if (asOfMs > clockMs) return badAdmission("impossible_future");
  const count = capacity.acceptedCount;
  const committed = BigInt(count) * REWARD_ATOMIC;
  let committedAtomic;
  try {
    committedAtomic = BigInt(capacity.committedAtomic);
  } catch {
    return badAdmission("impossible_accounting");
  }
  if (committedAtomic !== committed || capacity.committed !== formatUsdc(committed)) return badAdmission("impossible_accounting");
  let spentAtomic;
  try {
    spentAtomic = BigInt(capacity.spentAtomic);
  } catch {
    return badAdmission("impossible_accounting");
  }
  if (spentAtomic < 0n || spentAtomic > committedAtomic || spentAtomic % REWARD_ATOMIC !== 0n) return badAdmission("fake_paid");
  const spentText = spentAtomic === 0n ? "0" : formatUsdc(spentAtomic);
  if (capacity.spent !== spentText) return badAdmission("impossible_accounting");
  if (payment.paid !== (spentAtomic > 0n)) return badAdmission("fake_paid");
  if (capacity.remainingAccepts !== MAX_ACCEPTED - count || capacity.exhausted !== (count >= MAX_ACCEPTED)) {
    return badAdmission("impossible_accounting");
  }

  const pastAtAsOf = asOfMs > expiresMs;
  const pastAtReceipt = clockMs > expiresMs;
  const state = lifecycle.state;
  if (state === "expired") {
    if (!pastAtAsOf || expiry.expired !== true) return badAdmission("impossible_accounting");
    return trusted(artifact, false, "expired", receivedAt, "expired");
  }
  if (pastAtAsOf || expiry.expired !== false) return badAdmission("impossible_accounting");
  if (state === "prepared") {
    if (lifecycle.openedAt !== null || lifecycle.openedBy !== null || count !== 0) return badAdmission("impossible_accounting");
    if (pastAtReceipt) return trusted(artifact, false, "expired", receivedAt, "prepared");
    return trusted(artifact, false, "prepared", receivedAt, "prepared");
  }
  if (state === "closed") {
    if (lifecycle.openedBy !== "root" && lifecycle.openedBy !== null) return badAdmission("supplied_status");
    if (pastAtReceipt) return trusted(artifact, false, "expired", receivedAt, "closed");
    return trusted(artifact, false, "closed", receivedAt, "closed");
  }
  if (state !== "open") return badAdmission("malformed");
  if (lifecycle.openedBy !== "root" || openedMs == null) return badAdmission("impossible_accounting");
  if (pastAtReceipt) return trusted(artifact, false, "expired", receivedAt, "open");
  if (count >= MAX_ACCEPTED) return trusted(artifact, false, "exhausted", receivedAt, "open");
  return trusted(artifact, true, "open", receivedAt, "open");
}

function trusted(artifact, accepts, reason, receivedAt, asOfProjection) {
  return {
    trusted: true,
    reason,
    artifact,
    projection: {
      asOf: artifact.asOf,
      state: artifact.lifecycle.state,
      expiredAtAsOf: artifact.expiry.expired === true,
    },
    admission: {
      class: "current_ledger",
      acceptsPublicSubmissions: accepts,
      admission: accepts ? "open" : "closed",
      reason,
      evaluatedAt: receivedAt,
      asOfProjection,
      paid: artifact.payment.paid === true,
      ...PROVENANCE,
    },
  };
}

function offlineAvailability(reason, receivedAt) {
  return {
    present: false,
    class: "offline_prepared_snapshot",
    frozenAvailabilityIsLiveAdmission: false,
    admissionSource: "frozen_prepared_snapshot",
    acceptsPublicSubmissions: false,
    admission: "closed",
    reason,
    asOfProjection: null,
    evaluatedAt: parseInstant(receivedAt) == null ? null : receivedAt,
    paid: false,
    rejected: reason !== "artifact_missing",
    sourceReceivingIsPayment: false,
    sourceReceivingIsAdoption: false,
    ...PROVENANCE,
  };
}

export function mergeFrozenOffer(frozen, artifactInput, receivedAt = new Date().toISOString()) {
  const base = frozen && typeof frozen === "object" && !Array.isArray(frozen) ? frozen : {};
  const snapshotOk = frozenSnapshotOk(base);
  let verdict = null;
  let reason = "artifact_missing";
  if (!snapshotOk) reason = "frozen_offer_unusable";
  else if (!artifactInput || artifactInput.missing === true) reason = "artifact_missing";
  else if (artifactInput.malformed === true || !Object.prototype.hasOwnProperty.call(artifactInput, "value")) reason = "malformed";
  else {
    verdict = assessArtifact(artifactInput.value, base, receivedAt);
    if (!verdict.trusted) reason = verdict.reason;
  }
  const currentAvailability = verdict?.trusted
    ? {
      present: true,
      class: "current_ledger",
      frozenAvailabilityIsLiveAdmission: false,
      admissionSource: "ledger_lifecycle_counts_capacity_expiry",
      acceptsPublicSubmissions: verdict.admission.acceptsPublicSubmissions,
      admission: verdict.admission.admission,
      reason: verdict.admission.reason,
      asOfProjection: verdict.admission.asOfProjection,
      evaluatedAt: verdict.admission.evaluatedAt,
      paid: verdict.admission.paid === true,
      rejected: false,
      sourceReceivingIsPayment: false,
      sourceReceivingIsAdoption: false,
      projection: verdict.artifact,
      ...PROVENANCE,
    }
    : offlineAvailability(reason, receivedAt);
  const response = {
    ...base,
    availabilityClass: verdict?.trusted ? "current_ledger" : "offline_prepared_snapshot",
    preparedSnapshot: {
      distinctFromCurrentOffer: true,
      class: "prepared_source_snapshot",
      termsVersion: base.termsVersion ?? null,
      clientVersion: base.client?.version ?? null,
      availability: base.availability ? structuredClone(base.availability) : null,
      acceptsPublicSubmissions: false,
      openedByWorker: false,
    },
    currentClient: currentClientDescriptor(),
    currentAvailability,
  };
  if (!snapshotOk) {
    response.availability = canonicalPreparedAvailability();
    response.openedByWorker = false;
    response.payoutEnabled = false;
    response.paymentAuthority = "none";
  }
  return response;
}

function obligationRows(ledger) {
  if (!ledger.obligations || typeof ledger.obligations !== "object" || Array.isArray(ledger.obligations)) return null;
  return Object.values(ledger.obligations);
}

export function projectCurrentAvailability(ledger, now, termsVersion) {
  if (!ledger) return fail(EXIT.unavailable, "not_open", "Root has not opened a ledger");
  if (typeof now !== "string" || Number.isNaN(Date.parse(now))) return fail(EXIT.usage, "malformed", "as-of time");
  if (termsVersion !== FROZEN_TERMS_VERSION) return fail(EXIT.stale_terms, "stale_terms", "checkout terms are not the frozen terms");
  if (ledger.schema !== SCHEMA_LEDGER) return fail(EXIT.wrong_subject, "wrong_offer", "ledger schema");
  if (ledger.offerId !== OFFER_ID) return fail(EXIT.wrong_subject, "wrong_offer", "ledger offer");
  if (ledger.termsVersion !== termsVersion) return fail(EXIT.stale_terms, "stale_terms", "ledger terms");
  if (ledger.evidenceClass !== "sponsored_evaluation" || ledger.organicCustomer !== false || ledger.customerRevenue !== false) {
    return fail(EXIT.wrong_subject, "supplied_status", "ledger record class");
  }
  const availability = ledger.availability;
  const allocation = ledger.allocation;
  if (!availability || availability.expiresAt !== EXPIRES_AT || availability.expiryCancelsAccepted !== false) {
    return fail(EXIT.conflict, "impossible_accounting", "ledger expiry");
  }
  if (availability.openedByWorker === true) return fail(EXIT.usage, "supplied_status", "worker opening is not a ledger state");
  if (!allocation || allocation.amount !== ALLOCATION || allocation.allocatedAtomic !== ALLOCATION_ATOMIC.toString() || allocation.maxAccepted !== MAX_ACCEPTED) {
    return fail(EXIT.conflict, "impossible_accounting", "ledger allocation");
  }
  if (allocation.escrowed !== false) return fail(EXIT.conflict, "impossible_accounting", "escrow is not this trial");
  const rows = obligationRows(ledger);
  if (!rows || !Number.isInteger(allocation.acceptedCount) || rows.length !== allocation.acceptedCount || rows.length > MAX_ACCEPTED) {
    return fail(EXIT.conflict, "impossible_accounting", "accepted count");
  }
  let committed = 0n;
  for (const row of rows) {
    if (!row || typeof row !== "object") return fail(EXIT.conflict, "impossible_accounting", "obligation");
    if (row.kernel?.paid === true || row.kernel?.settled === true || row.kernel?.transfer != null) {
      return fail(EXIT.wrong_subject, "fake_paid", "the null adapter does not pay");
    }
    if (isObservedPaid(row)) {
      if (row.reward !== REWARD || row.rewardAtomic !== REWARD_ATOMIC.toString()) {
        return fail(EXIT.conflict, "impossible_accounting", "obligation accounting");
      }
      committed += REWARD_ATOMIC;
      continue;
    }
    if (row.paid === true || row.settled === true || row.payoutState === "paid" || row.state === "paid" || row.settlement?.paid === true || row.settlement?.verified === true || row.settlement?.chainObserved === true) {
      return fail(EXIT.wrong_subject, "fake_paid", "a receipt-free claim is not paid");
    }
    if (row.paid !== false || row.reward !== REWARD || row.rewardAtomic !== REWARD_ATOMIC.toString() || row.state !== "owed" || row.payoutState !== "owed" || row.settled !== false) {
      return fail(EXIT.conflict, "impossible_accounting", "obligation accounting");
    }
    committed += REWARD_ATOMIC;
  }
  const observed = observedSpentAtomic(rows);
  if (!observed.ok || allocation.spentAtomic !== observed.spent.toString()) {
    return fail(EXIT.wrong_subject, "fake_paid", "spent does not match observed obligations");
  }
  let recorded;
  try {
    recorded = BigInt(allocation.committedAtomic);
  } catch {
    return fail(EXIT.conflict, "impossible_accounting", "committed atomic");
  }
  if (recorded !== committed) return fail(EXIT.conflict, "impossible_accounting", "committed atomic drifted from obligations");

  const past = Date.parse(now) > Date.parse(EXPIRES_AT);
  let state = availability.state;
  if (!["prepared", "open", "expired"].includes(state)) return fail(EXIT.conflict, "impossible_accounting", "lifecycle");
  if (!past && state === "expired") return fail(EXIT.conflict, "impossible_accounting", "expiry does not match the ledger clock");
  if (past) state = "expired";
  if (state === "prepared" && (availability.openedAt || availability.openedBy || rows.length !== 0)) {
    return fail(EXIT.conflict, "impossible_accounting", "prepared ledger already has an opening");
  }
  if (state === "open" && (availability.openedBy !== "root" || typeof availability.openedAt !== "string" || availability.openedAt.length === 0)) {
    return fail(EXIT.conflict, "impossible_accounting", "open ledger has no Root opening");
  }
  if (state === "expired" && availability.state === "prepared") {
    return fail(EXIT.unavailable, "expired", "availability has expired");
  }

  const artifact = {
    schema: SCHEMA_CURRENT_AVAILABILITY,
    offerId: OFFER_ID,
    termsVersion,
    asOf: now,
    lifecycle: {
      state,
      openedAt: state === "prepared" ? null : availability.openedAt ?? null,
      openedBy: state === "prepared" ? null : availability.openedBy ?? null,
      openedByWorker: false,
    },
    capacity: {
      allocated: ALLOCATION,
      maxAccepted: MAX_ACCEPTED,
      acceptedCount: rows.length,
      remainingAccepts: MAX_ACCEPTED - rows.length,
      committed: formatUsdc(committed),
      committedAtomic: committed.toString(),
      spent: observed.spent === 0n ? "0" : formatUsdc(observed.spent),
      spentAtomic: observed.spent.toString(),
      escrowed: false,
      unit: REWARD,
      exhausted: rows.length >= MAX_ACCEPTED,
    },
    expiry: {
      expiresAt: EXPIRES_AT,
      expired: state === "expired",
      expiryCancelsAccepted: false,
    },
    payment: {
      paid: observed.spent > 0n,
      payoutEnabled: false,
      automatic: false,
      settlementBy: "root",
      paymentAuthority: "none",
      sourceReceivingIsPayment: false,
      sourceReceivingIsAdoption: false,
    },
    publication: {
      manual: true,
      automatic: false,
      heartbeat: false,
    },
    record: {
      evidenceClass: "sponsored_evaluation",
      organicCustomer: false,
      customerRevenue: false,
    },
  };
  const secrets = leakedSecrets(artifact, ledger);
  if (secrets.length > 0 || containsPrivate(artifact) || hasBannedKey(artifact)) {
    return fail(EXIT.private_input, "private_input", "projection included a private ledger field");
  }
  const verdict = assessArtifact(artifact, preparedFrozenShell(termsVersion), now);
  if (!verdict.trusted) return fail(EXIT.conflict, verdict.reason, "projection failed its own public checks");
  return { ok: true, artifact, admission: verdict.admission };
}
