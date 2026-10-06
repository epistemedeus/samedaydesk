import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OWNED_DIR } from "./pins.mjs";
import { ingestObservation, listAllResult, listCurrentResult } from "./ingest.mjs";
import { FeedRefuse } from "./refuse.mjs";

export function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new FeedRefuse("input-malformed", `cannot read JSON fixture: ${err.message}`);
  }
}

export function laterObservationFrom(first, firstId) {
  return {
    sourceUrl: first.sourceUrl,
    observedAt: "2026-09-11T12:00:00.000Z",
    unit: first.unit,
    amount: first.amount,
    effectiveDate: "2026-09-11",
    priorObservationId: firstId,
    provenance: first.provenance,
  };
}

export function sampleUpstreamObservation() {
  return readJsonFile(join(OWNED_DIR, "fixtures/sample-as-upstream.json"));
}

/**
 * Literal journey: ingest → list current → older digest is stale not current
 * → SAMPLE rejected as upstream.
 */
export function runJourney({ fixturePath, storeDir = null, flags = {} } = {}) {
  const dir = storeDir || mkdtempSync(join(tmpdir(), "vendor-price-feed-"));
  const firstInput = readJsonFile(fixturePath);
  const ingest = ingestObservation(firstInput, { storeDir: dir, flags });
  const afterIngest = listCurrentResult(dir);

  const later = laterObservationFrom(ingest.observation, ingest.id);
  const ingestLater = ingestObservation(later, { storeDir: dir, flags });
  const afterLater = listAllResult(dir);

  const older = afterLater.observations.find((row) => row.id === ingest.id);
  const currentIds = afterLater.currentIds;

  let sampleAsUpstream;
  try {
    sampleAsUpstream = ingestObservation(sampleUpstreamObservation(), {
      storeDir: dir,
      flags,
    });
  } catch (err) {
    if (err instanceof FeedRefuse) sampleAsUpstream = err.toJSON();
    else throw err;
  }

  const journeyOk =
    ingest.ok &&
    ingestLater.ok &&
    older?.status === "stale" &&
    !currentIds.includes(ingest.id) &&
    currentIds.includes(ingestLater.id) &&
    sampleAsUpstream.ok === false &&
    sampleAsUpstream.code === "sample-not-upstream";

  return {
    ok: journeyOk,
    command: "journey",
    storeDir: dir,
    purchaseAuthority: false,
    purchaseAuthorized: false,
    liveCatalogWritten: false,
    olderDigest: ingest.id,
    currentDigest: ingestLater.id,
    steps: {
      ingest,
      listCurrentAfterIngest: afterIngest,
      ingestLater,
      listCurrentAfterLater: {
        ok: true,
        current: afterLater.current,
        stale: afterLater.stale,
        currentIds: afterLater.currentIds,
        staleIds: afterLater.staleIds,
        olderStatus: older?.status || null,
        olderIsCurrent: currentIds.includes(ingest.id),
      },
      sampleAsUpstream,
    },
  };
}
