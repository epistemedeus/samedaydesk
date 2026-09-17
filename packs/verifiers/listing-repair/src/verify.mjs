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
import { bindPacketDigest, bindSource, extractRoutePaths, isListingInput, isSourceObservation } from "./bind.mjs";
import { jsonEqual, normalizeDigest } from "./digest.mjs";
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

function fileKey(p) {
  if (!p) return null;
  return basename(posix.normalize(String(p).replaceAll("\\", "/")));
}

export function locatorsMatch(bind, source) {
  const a = locatorOf(bind);
  const b = locatorOf(source);
  if (!a.url && !a.file) return true;
  if (a.url && b.url) return a.url === b.url;
  if (a.file && b.file) {
    return fileKey(a.file) === fileKey(b.file) || a.file === b.file;
  }
  return false;
}

function labelText(value) {
  if (typeof value === "string") return value.trim();
  if (value === true) return "SAMPLE";
  return "";
}

export function isSamplePacket(packet) {
  if (!isPlainObject(packet)) return false;
  if (packet.caller?.exampleMode === true || packet.exampleMode === true) return true;
  const labels = [packet.caller?.sampleLabel, packet.sampleLabel, packet.callerProvenance?.sampleLabel];
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
 * Field-level rows are optional extras. Real 1.4.7 cli.mjs does not emit field/from/to.
 * corrections[] alone is the 1.0.0 shape and is never sufficient.
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

function sourceRefsOk(action, routes, snapshot) {
  const refs = Array.isArray(action.sourceRefs) ? action.sourceRefs : [];
  if (!refs.length) return true;
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

function is147Envelope(packet) {
  if (!isPlainObject(packet)) return false;
  if (packet.schema !== PACKET_SCHEMA) return false;
  if (packet.appId !== APP_ID) return false;
  if (!Array.isArray(packet.actions)) return false;
  return true;
}

function isMismatchPacket(packet) {
  if (!isPlainObject(packet)) return false;
  if (packet.status === "refused") return true;
  if (packet.underlying?.status === "mismatch") return true;
  return false;
}

function snapshotFieldHost(snapshot) {
  if (!isPlainObject(snapshot)) return snapshot;
  if (isPlainObject(snapshot.discovery?.listing)) {
    return { ...snapshot, ...snapshot.discovery.listing };
  }
  return snapshot;
}

/**
 * Verify a SameDayDesk listing-repair-packet (useful-jobs 1.4.7) against a named
 * listing snapshot. Does not run the listing-repair engine and never publishes.
 *
 * Real 1.4.7 packets do not embed sourceObservation or corrections[]. Binding is
 * --source (listing input or source-observation wrapper) plus optional --bind
 * sidecar that records packet.digest + sourceDigest from the generating run.
 */
export function verifyListingRepair({ packet, source = null, bind = null, flags = {} } = {}) {
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

  const envelopeBound = is147Envelope(packet);
  if (!envelopeBound) add(REASON.NOT_147_ENVELOPE);

  const legacyCorrections = isPlainObject(packet) && Array.isArray(packet.corrections) ? packet.corrections : [];
  if (legacyCorrections.length > 0) add(REASON.LEGACY_CORRECTIONS_SHAPE);

  const actions = collectOwnerActions(packet);
  if (envelopeBound && actions.length === 0) {
    if (legacyCorrections.length === 0) add(REASON.MISSING_OWNER_ACTIONS);
  }
  if (isPlainObject(packet) && packet.status === "actionable" && actions.length === 0) {
    add(REASON.FALSE_ACTIONABLE);
  }

  const mismatch = isMismatchPacket(packet);
  if (mismatch) {
    add(REASON.MISMATCH_NOT_CORRECTION);
    if (packet?.claimedLane === LANE.ACCEPTED_CORRECTION) add(REASON.CORRECTION_FROM_MISMATCH);
  }

  if (isPlainObject(bind?.kit) && bind.kit.sha256 && bind.kit.sha256 !== PINS.archiveSha256) {
    add(REASON.KIT_PIN_MISMATCH);
  }

  const sourcePresent = isSourceObservation(source) || isListingInput(source);
  const bound = bindSource(sourcePresent ? source : null, bind);
  let sourceBound = false;
  let stale = false;
  let computedSourceDigest = bound.computed;
  let fieldsExist = true;
  let falseCorrection = false;
  let actionsValid = actions.length > 0;

  if (!sourcePresent || !bound.ok) {
    add(REASON.MISSING_SOURCE_OBSERVATION);
  } else {
    computedSourceDigest = bound.computed;
    if (bound.declared && bound.computed && bound.declared !== bound.computed) {
      add(REASON.SOURCE_DIGEST_MISMATCH);
    }

    const packetObs = isPlainObject(packet) ? packet.sourceObservation : null;
    if (isPlainObject(packetObs) && locatorOf(packetObs).url) {
      if (!locatorsMatch(packetObs, source) && !locatorsMatch(packetObs, { file: source.file, url: source.url })) {
        add(REASON.SOURCE_LOCATOR_MISMATCH);
      }
      const packetBound = normalizeDigest(packetObs.digest);
      if (packetBound && bound.computed && packetBound !== bound.computed && !isRefresh(packet, packetBound, bound.computed)) {
        stale = true;
        add(REASON.STALE_SOURCE_DIGEST);
      }
    }

    const refreshed = isRefresh(packet, bound.bound, bound.computed);
    if (bound.bound && bound.computed && bound.bound !== bound.computed && !refreshed) {
      stale = true;
      add(REASON.STALE_SOURCE_DIGEST);
    }

    const packetDigests = bindPacketDigest(packet, bind);
    if (packetDigests.fromBind && packetDigests.claimed && packetDigests.fromBind !== packetDigests.claimed) {
      // Packet bytes no longer match the generating bind (caller.input path or actions drifted).
      stale = true;
      add(REASON.STALE_SOURCE_DIGEST);
    }

    const observedAt = parseTime(bound.observedAt);
    const asOf = parseTime(packet?.asOf);
    if (Number.isFinite(asOf) && Number.isFinite(observedAt) && observedAt < asOf) {
      stale = true;
      add(REASON.STALE_OBSERVED_AT);
    }

    const digestAligned = bound.declared === bound.computed;
    sourceBound = digestAligned && Boolean(bound.computed);
  }

  const snapshot = bound.snapshot;
  const fieldHost = snapshotFieldHost(snapshot);
  const routes = snapshot ? extractRoutePaths(snapshot) : new Set();
  const fieldCorrections = collectFieldCorrections(packet);
  const suggestion = actions.length > 0 || fieldCorrections.length > 0;

  if (actions.length > 0) {
    for (const a of actions) {
      if (!OWNER_ACTION_KINDS.includes(a.kind)) {
        actionsValid = false;
        add(REASON.INVALID_ACTION_KIND);
      }
      if (bound.ok && !sourceRefsOk(a, routes, fieldHost)) {
        actionsValid = false;
        add(REASON.ROUTE_REF_MISSING);
      }
    }
  }

  if (bound.ok && fieldCorrections.length > 0) {
    for (const c of fieldCorrections) {
      if (!hasOwn(fieldHost, c.field)) {
        fieldsExist = false;
        add(REASON.INVENTED_FIELD);
        continue;
      }
      const current = fieldHost[c.field];
      if (c.to !== undefined && jsonEqual(c.to, current)) {
        falseCorrection = true;
        add(REASON.FALSE_CORRECTION);
      } else if (c.from !== undefined && !jsonEqual(c.from, current)) {
        add(REASON.CORRECTION_FROM_MISMATCH);
      }
    }
  }

  const ok =
    reasons.length === 0 &&
    envelopeBound === true &&
    sourceBound === true &&
    fieldsExist === true &&
    actionsValid === true &&
    stale === false &&
    fabricated === false &&
    falseCorrection === false &&
    attemptedPublish === false &&
    mismatch === false;

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
    packetDigest: isPlainObject(packet) ? packet.digest || null : null,
    sourceDigest: computedSourceDigest,
    provenance: {
      pack: PACKAGE_ID,
      job: APP_ID,
      packetSchema: isPlainObject(packet) ? packet.schema || PACKET_SCHEMA : PACKET_SCHEMA,
      sourceSchema: sourcePresent
        ? isSourceObservation(source)
          ? source.schema || SOURCE_SCHEMA
          : source.schema || null
        : null,
      engine: { ...PINS },
      purchaseAuthority: false,
      republishKit: false,
      completionLabel: ok
        ? COMPLETION_LABEL.LOCAL_RUN_OK
        : fabricated
          ? COMPLETION_LABEL.FIXTURE_DEMO
          : "rejected",
      sample: fabricated,
    },
    checks: {
      envelopeBound,
      sourceBound,
      fieldsExist,
      stale,
      fabricated,
      falseCorrection,
      mismatch,
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
