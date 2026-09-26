import assert from "node:assert/strict";
import test from "node:test";

import { EVENT_KINDS, isCorrespondenceKind } from "../correspondence-kinds.mjs";
import {
  briefFromWorkBoardDossier,
  composeScalePacket,
  evidencePacketFromObservation,
  selectionFromCapabilityMatch,
} from "../handoff.mjs";
import { createWorkBoard } from "../../work-board/src/index.mjs";
import { createSeedCatalog, matchCapabilities, FIXTURE_NOW } from "../../capability-market/src/index.mjs";

test("correspondence kinds mirror the service vocabulary", () => {
  assert.deepEqual(Object.values(EVENT_KINDS), [
    "request",
    "reply",
    "artifact",
    "correction",
    "needs_human",
    "resolved",
    "reopened",
  ]);
  assert.equal(isCorrespondenceKind("artifact"), true);
  assert.equal(isCorrespondenceKind("payment"), false);
});

test("brief export is unfunded and correspondence-shaped", () => {
  const board = createWorkBoard();
  const dossier = board.getJobDossier("job_demo_page_diff");
  const brief = briefFromWorkBoardDossier(dossier);
  assert.equal(brief.kind, EVENT_KINDS.request);
  assert.equal(brief.funded, false);
  assert.equal(brief.hostedApi, false);
  assert.match(brief.text, /demonstration|DEMONSTRATION/i);
  assert.equal(brief.routes.correspondence, "/correspondence/");
});

test("capability selection refuses when no overlap", () => {
  const catalog = createSeedCatalog();
  const matched = matchCapabilities(catalog, { outcome: "nonexistent_outcome_xyz" }, { nowMs: Date.parse(FIXTURE_NOW) });
  const selection = selectionFromCapabilityMatch(matched, { requestedOutcome: "nonexistent_outcome_xyz" });
  assert.equal(selection.ok, false);
  assert.equal(selection.kind, EVENT_KINDS.needs_human);
  assert.equal(selection.hostedApi, false);
});

test("composeScalePacket keeps one envelope over three surfaces", () => {
  const board = createWorkBoard();
  const brief = briefFromWorkBoardDossier(board.getJobDossier("job_demo_page_diff"));
  const evidence = evidencePacketFromObservation({ observationId: "obs_demo", revisionId: "rev_1", statement: "demo" });
  const catalog = createSeedCatalog();
  const matched = matchCapabilities(
    catalog,
    { outcome: "public_page_extract", inputs: { urls: ["https://neomorphic.io/"] } },
    { nowMs: Date.parse(FIXTURE_NOW) },
  );
  const selection = selectionFromCapabilityMatch(matched, {
    requestedOutcome: "public_page_extract",
    inputs: { urls: ["https://neomorphic.io/"] },
  });
  const packet = composeScalePacket({ brief, evidence, selection });
  assert.equal(packet.events.length, 3);
  assert.equal(packet.paymentAuthority, "unchanged-owner-rails-only");
  assert.equal(packet.hostedApi, false);
  assert.deepEqual(
    packet.events.map((e) => e.surface),
    ["work-board", "town-square", "capability-market"],
  );
});
