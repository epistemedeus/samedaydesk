import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  ENGINE_JOB,
  EVIDENCE_SCHEMA,
  JOURNEY_SCHEMA,
  OWNED_DIR,
  PR51_ARCHIVE_BYTES,
  PR51_ARCHIVE_SHA256,
  PR51_MERGE,
  PR51_PACKAGE_ID,
  SUGGESTION_SCHEMA,
} from "./pins.mjs";
import { bindEvidenceDigest, bindSuggestionDigest } from "./digest.mjs";
import { runListingRepairPacket } from "./engine.mjs";
import { inspectSample, packetWantsAcceptedCorrection } from "./sample.mjs";
import {
  classifyWritePath,
  countChangedFields,
  isNoopPacket,
  wantsAutoPublish,
  wantsF08Edit,
} from "./guards.mjs";
import { FixtureRefuse, loadFixtureFile, validateCaseObject } from "./fixture.mjs";

function rejection({
  code,
  message,
  detail = null,
  sample = false,
  sampleReasons = [],
}) {
  return {
    ok: false,
    refused: true,
    code,
    error: message,
    detail,
    sample,
    sampleReasons,
    publishAuthorized: false,
    accepted_correction: false,
    sold: false,
    purchaseAuthority: false,
    purchaseAuthorized: false,
    payment: { attempted: false },
    liveSettlement: "out-of-scope",
    wrote: false,
  };
}

function loadEnginePacket(outDir) {
  try {
    return JSON.parse(readFileSync(join(outDir, "repair-packet.json"), "utf8"));
  } catch {
    return null;
  }
}

export function runManagedListingRepair(request = {}) {
  if (wantsF08Edit(request)) {
    return rejection({
      code: "f08_edit_rejected",
      message: "F05 does not edit F08 paid wrappers",
    });
  }

  if (request.outPath) {
    const classified = classifyWritePath(resolve(request.outPath));
    if (!classified.ok) {
      return rejection({
        code: classified.code,
        message: classified.message,
        detail: { path: classified.path },
      });
    }
  }

  const example = request.example === true;
  const fixturePath =
    example && !request.fixturePath
      ? join(OWNED_DIR, "fixtures/invalid/sample-as-accepted.json")
      : request.fixturePath;
  if (!fixturePath) {
    return rejection({
      code: "missing_fixture",
      message: "Pass --fixture <file> (ok.json for the literal journey)",
    });
  }

  let loaded;
  try {
    loaded = loadFixtureFile(fixturePath);
  } catch (err) {
    if (err instanceof FixtureRefuse) {
      return rejection({ code: err.code, message: err.message, detail: err.detail });
    }
    throw err;
  }

  let caseObject;
  try {
    caseObject = validateCaseObject(loaded.object);
  } catch (err) {
    if (err instanceof FixtureRefuse) {
      return rejection({ code: err.code, message: err.message, detail: err.detail });
    }
    throw err;
  }

  const sampleInfo = inspectSample(request, { caseObject });

  if (wantsAutoPublish(request, caseObject)) {
    return rejection({
      code: "auto_publish_rejected",
      message: "Managed listing repair never publishes. publishAuthorized stays false.",
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const wantsAccepted =
    request.acceptedCorrection === true || packetWantsAcceptedCorrection(caseObject.packet);

  if (wantsAccepted && sampleInfo.sample) {
    return rejection({
      code: "sample_accepted_correction_rejected",
      message: "SAMPLE packets cannot become accepted_correction",
      sample: true,
      sampleReasons: sampleInfo.reasons,
    });
  }

  if (wantsAccepted) {
    return rejection({
      code: "accepted_correction_rejected",
      message: "This tool emits suggestion only; it does not accept corrections",
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  if (isNoopPacket(caseObject.packet)) {
    return rejection({
      code: "noop_sold_as_fix_rejected",
      message: "No-op packet cannot be sold as a listing fix",
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const changedFields = countChangedFields(caseObject.packet);
  if (changedFields !== 1) {
    return rejection({
      code: "one_field_fix_required",
      message: "Journey packet must fix exactly one field",
      detail: { changedFields },
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const work = mkdtempSync(join(tmpdir(), "sds-mlr-"));
  const engineInputPath = join(work, "engine-input.json");
  const engineOutDir = join(work, "engine-out");
  mkdirSync(engineOutDir, { recursive: true });
  writeFileSync(`${engineInputPath}`, `${JSON.stringify(caseObject.engineInput, null, 2)}\n`);

  const engine = runListingRepairPacket({
    inputPath: engineInputPath,
    outDir: engineOutDir,
  });
  if (engine.status !== 0 || !engine.json) {
    return rejection({
      code: "engine_refused",
      message: "listing-repair-packet engine refused or produced no JSON",
      detail: {
        status: engine.status,
        stdout: String(engine.stdout || "").slice(0, 800),
        stderr: String(engine.stderr || "").slice(0, 800),
      },
      sample: sampleInfo.sample,
      sampleReasons: sampleInfo.reasons,
    });
  }

  const packetFile = loadEnginePacket(engineOutDir);
  const evidenceDigest = bindEvidenceDigest(caseObject.source);
  const engineDigest = engine.json.digest || packetFile?.digest || null;
  const changes = caseObject.packet.changes;
  const suggestionDigest = bindSuggestionDigest({
    evidenceDigest,
    changes,
    engineDigest,
  });

  const evidence = {
    schema: EVIDENCE_SCHEMA,
    kind: "source_observation",
    source: caseObject.source,
    digest: evidenceDigest,
    observedAt: caseObject.source.observedAt || caseObject.clock || null,
    engine: {
      jobId: ENGINE_JOB,
      pr51: PR51_MERGE,
      packageId: PR51_PACKAGE_ID,
      bytes: PR51_ARCHIVE_BYTES,
      sha256: PR51_ARCHIVE_SHA256,
      status: engine.json.status || packetFile?.status || null,
      digest: engineDigest,
      purchaseAuthority: false,
    },
  };

  const suggestion = {
    schema: SUGGESTION_SCHEMA,
    kind: "suggestion",
    notAPublish: true,
    publishAuthorized: false,
    accepted_correction: false,
    fieldCount: changedFields,
    changes,
    digest: suggestionDigest,
    engineActions: Array.isArray(packetFile?.actions) ? packetFile.actions : [],
    engineStatus: engine.json.status || packetFile?.status || null,
    note: "Suggestion only. Not a listing publish.",
  };

  const journey = {
    schema: JOURNEY_SCHEMA,
    ok: true,
    evidence,
    suggestion,
    publishAuthorized: false,
    accepted_correction: false,
    sample: sampleInfo.sample,
    sampleReasons: sampleInfo.reasons,
    sold: false,
    purchaseAuthority: false,
    purchaseAuthorized: false,
    payment: { attempted: false },
    liveSettlement: "out-of-scope",
    claims: {
      published: false,
      autoPublish: false,
      acceptedCorrection: false,
      editedF08: false,
      changedLivePrices: false,
      bazaarPublish: false,
    },
  };

  let wrote = false;
  let outPath = null;
  if (request.outPath) {
    const dest = resolve(request.outPath);
    const classified = classifyWritePath(dest);
    if (!classified.ok) {
      return rejection({
        code: classified.code,
        message: classified.message,
        detail: { path: classified.path },
        sample: sampleInfo.sample,
        sampleReasons: sampleInfo.reasons,
      });
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(journey, null, 2)}\n`);
    wrote = true;
    outPath = dest;
  }

  return {
    ok: true,
    refused: false,
    ...journey,
    wrote,
    outPath,
  };
}
