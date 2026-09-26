import assert from "node:assert/strict";
import test from "node:test";

import { runScaleJourney } from "../journey.mjs";
import { EVENT_KINDS } from "../correspondence-kinds.mjs";

test("runScaleJourney links brief, evidence ingest, and capability delivery", async () => {
  const result = await runScaleJourney();
  assert.equal(result.brief.kind, EVENT_KINDS.request);
  assert.equal(result.evidence.kind, EVENT_KINDS.artifact);
  assert.equal(result.selection.ok, true);
  assert.equal(result.selection.kind, EVENT_KINDS.artifact);
  assert.equal(result.ingestSummary.accepted, 2);
  assert.ok(result.machineExport.changeCount >= 2);
  assert.equal(result.delivery.ok, true);
  assert.equal(result.packet.events.length, 3);
  assert.match(result.packet.note, /integration candidate/i);
});

test("runScaleJourney rejects hostile partial observation without throwing", async () => {
  const { loadTaskMemoryContract } = await import("../task-memory.mjs");
  const { createContractBackedTownSquare } = await import("../../town-square/src/index.mjs");
  const contract = await loadTaskMemoryContract();
  const town = createContractBackedTownSquare({
    parseObservation: contract.parseTaskObservation,
    assertLineage: contract.assertCorrectionLineage,
  });
  const bad = { observationId: "x", revisionId: "y" };
  try {
    town.ingestObservations([bad]);
    assert.fail("expected malformed observation to be rejected");
  } catch (error) {
    assert.equal(error.code, "invalid_observation");
  }
});
