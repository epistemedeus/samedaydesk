import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { refuse } from "./refuse.mjs";
import { NEXT_RUN_SCHEMAS, SUPPORTED_FAMILIES, parserMatchesFamily } from "./pins.mjs";
import { parseFileSha256, sha256File } from "./digest.mjs";
import { assertTermsVersionClaim } from "./hash.mjs";

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    throw refuse("invalid-ticket", "ticket is not valid JSON", {
      path: filePath,
      error: String(e.message || e),
    });
  }
}

function textBlob(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function isSampleLabelled(raw, filePath) {
  const pieces = [
    raw?.caller?.sampleLabel,
    raw?.caller?.exampleMode === true ? "SAMPLE" : "",
    raw?.sampleLabel,
    raw?.sourceMeta?.sampleLabel,
    raw?.sourceMeta?.note,
    raw?.repeatJob?.nextRunManifest?.sourceMeta?.sampleLabel,
    raw?.repeatJob?.nextRunManifest?.sourceMeta?.note,
    raw?.nextRunManifest?.sourceMeta?.sampleLabel,
    raw?.currentInputs?.before?.attribution,
    raw?.currentInputs?.after?.attribution,
    raw?.repeatJob?.nextRunManifest?.currentInputs?.before?.attribution,
    raw?.repeatJob?.nextRunManifest?.currentInputs?.after?.attribution,
    raw?.repeatJob?.nextRunManifest?.currentInputs?.used?.attribution,
  ];
  if (pieces.some((p) => /sample/i.test(textBlob(p)))) return true;
  if (filePath && /(?:^|[/\\])samples[/\\]/i.test(filePath)) return true;
  return false;
}

export function isLiveRecurrence(args, raw) {
  if (args?.["live-recurrence"] === true || args?.["live-recurrence"] === "true") return true;
  if (raw?.liveRecurrence === true) return true;
  if (raw?.recurrence === "live" || raw?.recurrenceKind === "live") return true;
  if (raw?.kind === "live-recurrence") return true;
  if (raw?.repeatJob?.scheduleHint === "live") return true;
  if (raw?.scheduleHint === "live") return true;
  if (raw?.repeatJob?.liveRecurrence === true) return true;
  return false;
}

export function schedulerDaemonTrue(raw) {
  return (
    raw?.schedulerDaemon === true ||
    raw?.repeatJob?.schedulerDaemon === true ||
    raw?.runtime?.schedulerDaemon === true ||
    raw?.nextRunManifest?.schedulerDaemon === true ||
    raw?.repeatJob?.nextRunManifest?.schedulerDaemon === true
  );
}

function declaredFromSlot(slot) {
  if (slot == null) return null;
  if (typeof slot !== "object" || Array.isArray(slot)) return null;
  const sha256 = slot.sha256 ? parseFileSha256(slot.sha256, { label: "declared sha256" }) : null;
  return {
    path: slot.path ?? null,
    bytes: slot.bytes ?? null,
    sha256,
  };
}

function firstAfterSha(declared, verified) {
  return verified?.after?.sha256 || declared?.after?.sha256 || null;
}

function currentInputSha(slot) {
  if (slot == null || typeof slot !== "object") return null;
  return slot.sha256 ? parseFileSha256(slot.sha256, { label: "currentInputs sha256" }) : null;
}

export function assertNextRunFrozen({ family, kind, nextRun, path: ticketPath }) {
  const next = nextRun;
  if (!next) return;
  if (next.parser && !parserMatchesFamily(family, next.parser)) {
    throw refuse("family-parser-mismatch", "next-run family does not match parser", {
      family,
      parser: next.parser,
      path: ticketPath,
    });
  }
  if (kind !== "next-run-manifest") return;
  const spec = SUPPORTED_FAMILIES[family];
  const current = next.currentInputs;
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    throw refuse(
      "unchecked-next-manifest",
      "next-run currentInputs must freeze previous input references",
      { path: ticketPath },
    );
  }
  for (const slot of spec.requiredSlots) {
    const sha = currentInputSha(current[slot]);
    if (!sha) {
      throw refuse(
        "unchecked-next-manifest",
        `next-run currentInputs.${slot}.sha256 is required as the frozen previous reference`,
        { path: ticketPath, slot },
      );
    }
  }
}

export function loadTicket(filePath) {
  if (!filePath || filePath === true) {
    throw refuse("missing-required-inputs", "Caller mode requires --ticket");
  }
  const abs = path.resolve(String(filePath));
  if (!existsSync(abs)) {
    throw refuse("missing-ticket", "ticket file missing", { path: abs });
  }
  const raw = readJson(abs);
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw refuse("invalid-ticket", "ticket must be a JSON object", { path: abs });
  }

  if (schedulerDaemonTrue(raw)) {
    throw refuse("scheduler-daemon-refused", "schedulerDaemon true is refused; this binder is not a daemon", {
      path: abs,
    });
  }

  const sampleLabelled = isSampleLabelled(raw, abs);
  const live = isLiveRecurrence({}, raw);
  if (live && sampleLabelled) {
    throw refuse(
      "sample-labelled-as-live-recurrence",
      "SAMPLE-labelled ticket cannot be claimed as live recurrence",
      { path: abs },
    );
  }

  assertTermsVersionClaim(raw);

  const repeatJob = raw.repeatJob && typeof raw.repeatJob === "object" ? raw.repeatJob : null;
  const nextRun =
    (repeatJob && repeatJob.nextRunManifest) ||
    (NEXT_RUN_SCHEMAS.includes(raw.schema) ? raw : null) ||
    raw.nextRunManifest ||
    null;

  const kind =
    repeatJob && (raw.appId === "repeat-job-record" || repeatJob.schema === "s242.repeat-job-record.v1")
      ? "repeat-job-record"
      : nextRun && NEXT_RUN_SCHEMAS.includes(nextRun.schema)
        ? "next-run-manifest"
        : null;

  if (!kind) {
    throw refuse(
      "unsupported-ticket-schema",
      "ticket must be a repeat-job.json envelope or s176/s163 next-run manifest",
      { path: abs, schema: raw.schema ?? null, appId: raw.appId ?? null },
    );
  }

  const family = repeatJob?.family || nextRun?.family || raw.family || null;
  if (!family || !SUPPORTED_FAMILIES[family]) {
    throw refuse("unsupported-family", "binder supports openapi-used-ops and pricing-row-unit", {
      family,
      supported: Object.keys(SUPPORTED_FAMILIES),
    });
  }

  assertNextRunFrozen({ family, kind, nextRun, path: abs });

  const declared = {
    before: declaredFromSlot(
      repeatJob?.inputs?.declaredDigests?.before || nextRun?.currentInputs?.before || null,
    ),
    after: declaredFromSlot(
      repeatJob?.inputs?.declaredDigests?.after || nextRun?.currentInputs?.after || null,
    ),
    used: declaredFromSlot(
      repeatJob?.inputs?.declaredDigests?.used || nextRun?.currentInputs?.used || null,
    ),
  };

  const verified = {
    before: declaredFromSlot(repeatJob?.inputs?.verifiedDigests?.before || null),
    after: declaredFromSlot(repeatJob?.inputs?.verifiedDigests?.after || null),
    used: declaredFromSlot(repeatJob?.inputs?.verifiedDigests?.used || null),
  };

  const inputPaths = {
    before: repeatJob?.inputs?.before || nextRun?.inputs?.before || declared.before?.path || null,
    after: repeatJob?.inputs?.after || nextRun?.inputs?.after || declared.after?.path || null,
    used: repeatJob?.inputs?.used || nextRun?.inputs?.used || nextRun?.inputs?.usedPin || declared.used?.path || null,
  };

  return {
    kind,
    path: abs,
    dir: path.dirname(abs),
    raw,
    repeatJob,
    nextRun,
    family,
    sampleLabelled,
    liveRecurrence: live,
    caller: raw.caller || null,
    declared,
    verified,
    inputPaths,
    firstAfterSha256: firstAfterSha(declared, verified),
    firstBeforeSha256: verified?.before?.sha256 || declared?.before?.sha256 || null,
    ticketSha256: sha256File(abs),
    identityVerified: repeatJob?.identityVerification?.verified === true || raw.identityVerified === true,
    schedulerDaemon: false,
  };
}
