import { basename, posix } from "node:path";
import {
  APP_ID,
  COMPLETION_LABEL,
  FORBIDDEN_COMPLETION_LABEL,
  LANE,
  OWNER_ACTION_KINDS,
  PACKAGE_ID,
  PACKET_SCHEMA,
  PINS,
  REASON,
  SAMPLE_LABELS,
  SOURCE_SCHEMA,
  VERDICT_SCHEMA,
} from "./constants.mjs";
import { digestOf, jsonEqual, normalizeDigest, snapshotDigest } from "./digest.mjs";
import { f12CorpusPresent } from "./f12-optional.mjs";
import { buildHonesty } from "./honesty.mjs";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function locatorOf(obj) {
  if (!isPlainObject(obj)) return { url: null, file: null };
  const nested = isPlainObject(obj.locator) ? obj.locator : {};
  const url = typeof obj.url === "string" && obj.url.trim() ? obj.url.trim() : nested.url || null;
  const file = typeof obj.file === "string" && obj.file.trim() ? obj.file.trim() : nested.file || null;
  return {
    url: typeof url === "string" && url.trim() ? url.trim() : null,
    file: typeof file === "string" && file.trim() ? file.trim() : null,
  };
}

export function locatorPresent(obj) {
  const loc = locatorOf(obj);
  return Boolean(loc.url || loc.file);
}

function fileKey(p) {
  if (!p) return null;
  return basename(posix.normalize(String(p).replaceAll("\\", "/")));
}

export function locatorsMatch(bind, source) {
  const a = locatorOf(bind);
  const b = locatorOf(source);
  if (a.url && b.url) return a.url === b.url;
  if (a.file && b.file) {
    return fileKey(a.file) === fileKey(b.file) || a.file === b.file;
  }
  return false;
}

export function isSourceObservation(source) {
  if (!isPlainObject(source)) return false;
  if (!locatorPresent(source)) return false;
  const observedAt = source.observedAt || source.locator?.observedAt;
  if (typeof observedAt !== "string" || !observedAt.trim()) return false;
  if (!isPlainObject(source.snapshot)) return false;
  return true;
}

function labelText(value) {
  if (typeof value === "string") return value.trim();
  if (value === true) return "SAMPLE";
  return "";
}

export function isSamplePacket(packet) {
  if (!isPlainObject(packet)) return false;
  if (packet.caller?.exampleMode === true || packet.exampleMode === true) return true;
  if (packet.labelledSample === true || packet.callerProvenance?.syntheticFixture === true) {
    const sl = labelText(packet.callerProvenance?.sampleLabel || packet.sampleLabel || packet.caller?.sampleLabel);
    if (!sl || SAMPLE_LABELS.includes(sl) || /sample/i.test(sl)) return true;
  }
  const labels = [
    packet.caller?.sampleLabel,
    packet.sampleLabel,
    packet.callerProvenance?.sampleLabel,
  ];
  for (const l of labels) {
    const t = labelText(l);
    if (SAMPLE_LABELS.includes(t)) return true;
  }
  return false;
}

function walkForbidden(value, acc) {
  if (typeof value === "string") {
    if (value === FORBIDDEN_COMPLETION_LABEL) acc.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkForbidden(v, acc);
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === FORBIDDEN_COMPLETION_LABEL) acc.push(k);
      walkForbidden(v, acc);
    }
  }
}

export function containsForbiddenCompletion(packet) {
  const acc = [];
  walkForbidden(packet, acc);
  return acc.length > 0;
}

/** 1.4.7 primary shape: owner-repair actions[]. */
export function collectOwnerActions(packet) {
  if (!isPlainObject(packet) || !Array.isArray(packet.actions)) return [];
  return packet.actions.filter((a) => isPlainObject(a) && typeof a.kind === "string" && a.kind.trim());
}

/**
 * Field-level oracle rows. Prefer action.field/from/to (1.4.7-adapted).
 * Legacy corrections[] alone is NOT sufficient for pass — see LEGACY_CORRECTIONS_SHAPE.
 */
export function collectFieldCorrections(packet) {
  if (!isPlainObject(packet)) return [];
  const out = [];
  const seen = new Set();
  const push = (c, via) => {
    if (!c || typeof c.field !== "string" || !c.field.trim()) return;
    const item = { field: c.field.trim(), from: c.from, to: c.to, via };
    const key = JSON.stringify([item.field, item.from, item.to]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const a of packet.actions || []) push(a, "action");
  for (const c of packet.corrections || []) push(c, "corrections");
  return out;
}

function hasOwn(obj, key) {
  return isPlainObject(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function parseTime(value) {
  if (typeof value !== "string" || !value.trim()) return NaN;
  return Date.parse(value);
}

function isRefresh(packet, boundDigest, currentDigest) {
  const r = packet?.refresh;
  if (!isPlainObject(r)) return false;
  const from = normalizeDigest(r.fromDigest);
  const to = normalizeDigest(r.toDigest);
  return from === boundDigest && to === currentDigest;
}

function looksLikeLiveSds(value) {
  return typeof value === "string" && /samedaydesk\.com/i.test(value) && /^https?:\/\//i.test(value.trim());
}

function publishAttempted(packet, flags) {
  if (flags.publish === true || flags.live === true || flags.writeSds === true || flags.deploy === true) {
    return true;
  }
  if (!isPlainObject(packet)) return false;
  if (packet.publish === true) return true;
  if (packet.networkPublish === true || packet.liveWrite === true) return true;
  if (packet.claimedLane === LANE.PUBLISH) return true;
  if (typeof packet.publishTo === "string" && packet.publishTo.trim()) return true;
  if (typeof packet.sdsWrite === "string" && packet.sdsWrite.trim()) return true;
  return false;
}

function liveSdsWrite(packet, flags) {
  if (looksLikeLiveSds(flags.sourcePath) || looksLikeLiveSds(flags.liveSourceUrl)) return true;
  if (!isPlainObject(packet)) return false;
  return (
    looksLikeLiveSds(packet.publishTo) ||
    looksLikeLiveSds(packet.sdsWrite) ||
    looksLikeLiveSds(packet.liveWrite) ||
    looksLikeLiveSds(packet.networkPublish)
  );
}

function routeKeysFromSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return new Set();
  const routes = snapshot.routes;
  if (Array.isArray(routes)) {
    return new Set(routes.map((r) => (typeof r === "string" ? r : r?.path || r?.route)).filter(Boolean));
  }
  if (isPlainObject(routes)) return new Set(Object.keys(routes));
  return new Set();
}

function sourceRefsOk(action, snapshot) {
  const refs = Array.isArray(action.sourceRefs) ? action.sourceRefs : [];
  if (!refs.length) return true;
  const routes = routeKeysFromSnapshot(snapshot);
  for (const ref of refs) {
    if (typeof ref !== "string") continue;
    if (ref.startsWith("route:")) {
      const path = ref.slice("route:".length);
      if (routes.size && !routes.has(path)) return false;
    }
    if (ref.startsWith("field:")) {
      const field = ref.slice("field:".length);
      if (!hasOwn(snapshot, field)) return false;
    }
  }
  return true;
}

/**
 * Verify a SameDayDesk listing-repair-packet (useful-jobs 1.4.7) against a named
 * source observation. Does not run the listing-repair engine and never publishes.
 */
export function verifyListingRepair({ packet, source = null, flags = {} } = {}) {
  const reasons = [];
  const add = (code) => {
    if (!reasons.includes(code)) reasons.push(code);
  };

  const attemptedPublish = publishAttempted(packet, flags);
  if (attemptedPublish) add(REASON.PUBLISH_ATTEMPTED);
  if (liveSdsWrite(packet, flags)) add(REASON.LIVE_SDS_WRITE);

  if (containsForbiddenCompletion(packet)) add(REASON.FORBIDDEN_COMPLETION_LABEL);

  const fabricated = isSamplePacket(packet);
  if (fabricated) add(REASON.FABRICATED_SAMPLE);

  if (isPlainObject(packet) && packet.purchaseAuthority === true) {
    add(REASON.PURCHASE_AUTHORITY_CLAIMED);
  }
  if (isPlainObject(packet) && packet.notMarketFact === false) {
    add(REASON.MARKET_FACT_CLAIM);
  }

  const sourceOk = isSourceObservation(source);
  const bind = isPlainObject(packet) ? packet.sourceObservation : null;
  const bindOk =
    isPlainObject(bind) &&
    locatorPresent(bind) &&
    typeof bind.observedAt === "string" &&
    bind.observedAt.trim() &&
    typeof bind.digest === "string" &&
    bind.digest.trim();

  let sourceBound = false;
  let stale = false;
  let computedSourceDigest = null;

  if (!sourceOk || !bindOk) {
    add(REASON.MISSING_SOURCE_OBSERVATION);
  } else {
    computedSourceDigest = snapshotDigest(source.snapshot);
    const declared = normalizeDigest(source.digest);
    const bound = normalizeDigest(bind.digest);
    const current = normalizeDigest(computedSourceDigest);

    if (declared && current && declared !== current) add(REASON.SOURCE_DIGEST_MISMATCH);
    if (!locatorsMatch(bind, source)) add(REASON.SOURCE_LOCATOR_MISMATCH);

    const refreshed = isRefresh(packet, bound, current);
    if (bound && current && bound !== current && !refreshed) {
      stale = true;
      add(REASON.STALE_SOURCE_DIGEST);
    }

    const observedAt = parseTime(source.observedAt);
    const asOf = parseTime(packet.asOf);
    if (Number.isFinite(asOf) && Number.isFinite(observedAt) && observedAt < asOf) {
      stale = true;
      add(REASON.STALE_OBSERVED_AT);
    }

    const digestAligned = bound === current;
    if (locatorsMatch(bind, source) && digestAligned && locatorPresent(source) && source.observedAt) {
      sourceBound = true;
    }
  }

  const actions = collectOwnerActions(packet);
  const legacyCorrections = isPlainObject(packet) && Array.isArray(packet.corrections) ? packet.corrections : [];
  const fieldCorrections = collectFieldCorrections(packet);
  const suggestion = actions.length > 0 || fieldCorrections.length > 0;

  // 1.4.7 bind: actions[] is required. corrections[] alone is legacy 1.0.0 shape.
  if (actions.length === 0) {
    if (legacyCorrections.length > 0) add(REASON.LEGACY_CORRECTIONS_SHAPE);
    else add(REASON.MISSING_OWNER_ACTIONS);
  }

  const snapshot = sourceOk ? source.snapshot : null;
  let fieldsExist = true;
  let falseCorrection = false;
  let actionsValid = actions.length > 0;

  if (actions.length > 0) {
    for (const a of actions) {
      if (!OWNER_ACTION_KINDS.includes(a.kind)) {
        actionsValid = false;
        add(REASON.INVALID_ACTION_KIND);
      }
      if (sourceOk && !sourceRefsOk(a, snapshot)) {
        actionsValid = false;
        add(REASON.ROUTE_REF_MISSING);
      }
    }
  }

  if (sourceOk && fieldCorrections.length > 0) {
    for (const c of fieldCorrections) {
      if (!hasOwn(snapshot, c.field)) {
        fieldsExist = false;
        add(REASON.INVENTED_FIELD);
        continue;
      }
      const current = snapshot[c.field];
      if (c.to !== undefined && jsonEqual(c.to, current)) {
        falseCorrection = true;
        add(REASON.FALSE_CORRECTION);
      } else if (c.from !== undefined && !jsonEqual(c.from, current)) {
        add(REASON.CORRECTION_FROM_MISMATCH);
      }
    }
  }

  // actionable status with empty guidance is a false claim
  if (isPlainObject(packet) && packet.status === "actionable" && actions.length === 0) {
    add(REASON.FALSE_ACTIONABLE);
  }

  const packetDigest = isPlainObject(packet) ? digestOf(packet) : null;
  const sourceDigest = computedSourceDigest || (sourceOk ? snapshotDigest(source.snapshot) : null);

  const ok =
    reasons.length === 0 &&
    sourceBound === true &&
    fieldsExist === true &&
    actionsValid === true &&
    stale === false &&
    fabricated === false &&
    falseCorrection === false &&
    attemptedPublish === false;

  const honesty = buildHonesty({
    sourceBound,
    suggestion,
    publishAttempted: attemptedPublish,
    ok,
  });

  const verdict = {
    schema: VERDICT_SCHEMA,
    ok,
    reasons,
    packetDigest,
    sourceDigest,
    provenance: {
      pack: PACKAGE_ID,
      job: APP_ID,
      packetSchema: isPlainObject(packet) ? packet.schema || PACKET_SCHEMA : PACKET_SCHEMA,
      sourceSchema: sourceOk ? source.schema || SOURCE_SCHEMA : null,
      engine: { ...PINS },
      purchaseAuthority: false,
      completionLabel: ok
        ? COMPLETION_LABEL.LOCAL_RUN_OK
        : fabricated
          ? COMPLETION_LABEL.FIXTURE_DEMO
          : "rejected",
      f12CorpusPresent: f12CorpusPresent(),
      sample: fabricated,
    },
    checks: {
      sourceBound,
      fieldsExist,
      stale,
      fabricated,
      falseCorrection,
      evidence: honesty.lanes[LANE.EVIDENCE],
      suggestion: honesty.lanes[LANE.SUGGESTION],
      publish: false,
      accepted_correction: honesty.lanes[LANE.ACCEPTED_CORRECTION],
    },
    honesty,
  };

  if (Object.prototype.hasOwnProperty.call(verdict, FORBIDDEN_COMPLETION_LABEL)) {
    delete verdict[FORBIDDEN_COMPLETION_LABEL];
  }
  return verdict;
}
