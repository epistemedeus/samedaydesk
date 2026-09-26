/**
 * BOT-S162 integrated journey tests — real Heavy Cap02/03/06 + native Cap01/04/05/07/08.
 * Count THESE tests only; do not treat Heavy 259/36 as acceptance.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCEPTANCE,
  HEAVY_CAPS,
  HEAVY_PIN,
  JOURNEY_STATUS,
  NATIVE_TIPS,
  SCHEMA,
  STAGE_ID,
  STAGE_STATUS,
} from "../src/constants.mjs";
import {
  adapterStatusTable,
  evidenceBinder,
  partialComposer,
  prereqResolver,
} from "../src/adapters.mjs";
import { runCapabilityJourneyS162 } from "../src/journey.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "../fixtures");
const heavy = join(fixtures, "heavy");
const FIXED_CLOCK = () => Date.parse("2026-09-10T20:00:00.000Z");

function load(name) {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function loadHeavy(name) {
  return JSON.parse(readFileSync(join(heavy, name), "utf8"));
}

function loadTextHeavy(name) {
  return readFileSync(join(heavy, name), "utf8");
}

function demoInput(overrides = {}) {
  const evidence = loadHeavy("evidence-bind-input.json");
  evidence.testOutput = {
    ...evidence.testOutput,
    content: loadTextHeavy("sample-tap-pass.txt"),
  };
  evidence.source = {
    ...evidence.source,
    content: loadTextHeavy("source-snippet.mjs"),
  };
  return {
    taskId: "journey-s162-demo",
    requirements: load("requirements.json"),
    costInput: load("cost-input.json"),
    buyerContext: load("buyer-context.json"),
    failedOutcome: load("failed-outcome.json"),
    artifact: load("artifact.good.json"),
    prerequisites: {
      manifest: loadHeavy("manifest-ready.json"),
      catalogListed: true,
      probe: loadHeavy("probe-ready.json"),
    },
    evidence,
    compose: loadHeavy("compose-input.json"),
    ...overrides,
  };
}

describe("adapters Cap02/03/06 — real Heavy APIs", () => {
  it("prereqResolver empty input is not_ready (never invent ready)", () => {
    const r = prereqResolver({});
    assert.equal(r.status, "not_ready");
    assert.equal(r.readiness, "not_ready");
    assert.equal(r.heavyPin, HEAVY_PIN);
    assert.equal(r.adapterWired, true);
    assert.equal(r.adapterReady, false);
  });

  it("prereqResolver with ready probe returns Heavy readiness=ready", () => {
    const r = prereqResolver({
      manifest: loadHeavy("manifest-ready.json"),
      catalogListed: true,
      probe: loadHeavy("probe-ready.json"),
    });
    assert.equal(r.api, "resolvePrerequisites");
    assert.equal(r.heavyPin, HEAVY_PIN);
    assert.equal(r.readiness, "ready");
    assert.equal(r.status, "ready");
    assert.equal(r.report?.schema, "s138.prereq-report.v1");
    assert.equal(r.adapterReady, true);
  });

  it("prereqResolver catalog-only manifest is not_ready", () => {
    const r = prereqResolver({
      manifest: loadHeavy("manifest-catalog-only.json"),
      catalogListed: true,
    });
    assert.equal(r.readiness, "not_ready");
    assert.ok(Array.isArray(r.gaps) && r.gaps.length > 0);
  });

  it("evidenceBinder empty input is untested_declaration (never invent content_bound)", () => {
    const r = evidenceBinder({});
    assert.equal(r.status, "untested_declaration");
    assert.equal(r.heavyPin, HEAVY_PIN);
    assert.match(r.honesty || "", /does not prove/i);
  });

  it("evidenceBinder with JSON fixtures returns real Heavy bind status", () => {
    const evidence = loadHeavy("evidence-bind-input.json");
    evidence.testOutput.content = loadTextHeavy("sample-tap-pass.txt");
    evidence.source.content = loadTextHeavy("source-snippet.mjs");
    const r = evidenceBinder(evidence);
    assert.equal(r.api, "bindEvidence");
    assert.equal(r.heavyPin, HEAVY_PIN);
    assert.ok(r.status === "content_bound" || r.status === "untested_declaration");
    assert.equal(r.report?.executionVerified, false);
    assert.equal(r.report?.schema, "s138.evidence-binding.v1");
    assert.ok(r.claimed && r.observed && r.verified);
    assert.match(r.honesty || "", /does not prove/i);
    // Even if bound, honesty note must remain — TAP does not prove revision execution.
  });

  it("partialComposer empty input is empty (never invent complete)", () => {
    const r = partialComposer({});
    assert.equal(r.status, "empty");
    assert.equal(r.heavyPin, HEAVY_PIN);
  });

  it("partialComposer with job+parts returns real Heavy composition", () => {
    const r = partialComposer(loadHeavy("compose-input.json"));
    assert.equal(r.api, "composePartial");
    assert.equal(r.report?.schema, "s138.partial-composition.v1");
    assert.ok(["complete", "partial", "empty"].includes(r.status));
    // title+status both supplied → complete for this fixture
    assert.equal(r.status, "complete");
  });

  it("adapterStatusTable shows Heavy pin and no missing caps", () => {
    const t = adapterStatusTable();
    assert.equal(t.heavyPin, HEAVY_PIN);
    assert.deepEqual(t.missingCaps, []);
    assert.equal(t.adapterWired, true);
    assert.equal(t.slots.length, 3);
  });
});

describe("runCapabilityJourneyS162 — eight-component flow", () => {
  it("runs Cap01→02→03→04→05→06→07→08 with real Heavy + native modules", async () => {
    const result = await runCapabilityJourneyS162(demoInput(), {
      clock: FIXED_CLOCK,
    });
    assert.equal(result.schema, SCHEMA);
    assert.equal(result.heavyPin, HEAVY_PIN);
    assert.equal(result.dryRun, true);
    assert.equal(result.paidInstall, false);
    assert.equal(result.liveNetwork, false);
    assert.deepEqual(result.missingHeavyCaps, []);
    assert.deepEqual(result.heavyCaps, [...HEAVY_CAPS]);

    const byId = Object.fromEntries(result.stages.map((s) => [s.id, s]));
    const order = result.stages.map((s) => s.id);
    assert.deepEqual(
      order.slice(0, 8),
      [
        STAGE_ID.ENVELOPE,
        STAGE_ID.INSTALL_PREREQ,
        STAGE_ID.EVIDENCE_BIND,
        STAGE_ID.COST_DRY_RUN,
        STAGE_ID.FALLBACK_PLAN,
        STAGE_ID.VERIFY_OR_PARTIAL,
        STAGE_ID.BUYER_CONTEXT_PACK,
        STAGE_ID.WALKTHROUGH,
      ],
    );

    assert.equal(byId[STAGE_ID.ENVELOPE].implementation, "cap01");
    assert.equal(byId[STAGE_ID.ENVELOPE].nativeTip, NATIVE_TIPS["01"]);
    assert.ok(byId[STAGE_ID.ENVELOPE].envelope?.taskId);

    assert.match(byId[STAGE_ID.INSTALL_PREREQ].implementation, /heavy Cap02/);
    assert.equal(byId[STAGE_ID.INSTALL_PREREQ].heavyPin, HEAVY_PIN);
    assert.notEqual(byId[STAGE_ID.INSTALL_PREREQ].status, "missing_heavy");

    assert.match(byId[STAGE_ID.EVIDENCE_BIND].implementation, /heavy Cap03/);
    assert.equal(byId[STAGE_ID.EVIDENCE_BIND].heavyPin, HEAVY_PIN);
    assert.notEqual(byId[STAGE_ID.EVIDENCE_BIND].status, "missing_heavy");

    assert.equal(byId[STAGE_ID.COST_DRY_RUN].implementation, "cap04");
    assert.equal(byId[STAGE_ID.COST_DRY_RUN].comparison?.dryRun, true);

    assert.equal(byId[STAGE_ID.FALLBACK_PLAN].implementation, "cap05");
    // demo supplies failedOutcome → Cap05 runs
    assert.ok(byId[STAGE_ID.FALLBACK_PLAN].plan?.schema);

    assert.match(byId[STAGE_ID.VERIFY_OR_PARTIAL].implementation, /heavy Cap06/);
    assert.equal(byId[STAGE_ID.VERIFY_OR_PARTIAL].heavyPin, HEAVY_PIN);

    assert.equal(byId[STAGE_ID.BUYER_CONTEXT_PACK].implementation, "cap07");
    assert.equal(byId[STAGE_ID.BUYER_CONTEXT_PACK].pack?.dryRun, true);

    assert.equal(byId[STAGE_ID.WALKTHROUGH].implementation, "cap08");
    assert.equal(byId[STAGE_ID.WALKTHROUGH].nativeTip, NATIVE_TIPS["08"]);
  });

  it("never sets readyForRelease / accepted from TAP or Heavy bind", async () => {
    const result = await runCapabilityJourneyS162(demoInput(), {
      clock: FIXED_CLOCK,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.readyForRelease, false);
    assert.ok(
      result.acceptance === ACCEPTANCE.NOT_ACCEPTED ||
        result.acceptance === ACCEPTANCE.GAPS_PRESERVED,
    );
    assert.ok(result.s161HonestyNotes.some((n) => /TAP/i.test(n)));
    assert.ok(
      result.s161HonestyNotes.some((n) => /does NOT prove/i.test(n) || /does not prove/i.test(n)),
    );
    const overall = result.stages.find((s) => s.id === STAGE_ID.OVERALL);
    assert.equal(overall.readyForRelease, false);
    assert.equal(overall.accepted, false);
    assert.deepEqual(overall.missingHeavyCaps, []);
  });

  it("preserves partial/not_ready when Cap02 catalog-only", async () => {
    const result = await runCapabilityJourneyS162(
      demoInput({
        prerequisites: {
          manifest: loadHeavy("manifest-catalog-only.json"),
          catalogListed: true,
        },
        // omit failedOutcome so fallback is driven by Heavy gaps
        failedOutcome: undefined,
      }),
      { clock: FIXED_CLOCK },
    );
    const prereq = result.stages.find((s) => s.id === STAGE_ID.INSTALL_PREREQ);
    assert.equal(prereq.status, STAGE_STATUS.NOT_READY);
    assert.ok(result.heavyGapSignals.some((g) => g.startsWith("cap02:")));
    assert.ok(
      result.journeyStatus === JOURNEY_STATUS.INTEGRATED_PARTIAL ||
        result.journeyStatus === JOURNEY_STATUS.PARTIAL_INPUT ||
        result.journeyStatus === JOURNEY_STATUS.INTEGRATED,
    );
    assert.equal(result.readyForRelease, false);
    assert.equal(result.acceptance, ACCEPTANCE.GAPS_PRESERVED);
  });

  it("rejects Cap01 forbidden invented-demand fields", async () => {
    const result = await runCapabilityJourneyS162(
      demoInput({ requirements: load("forbidden-requirements.json") }),
      { clock: FIXED_CLOCK },
    );
    const envelope = result.stages.find((s) => s.id === STAGE_ID.ENVELOPE);
    const rejected =
      envelope.status === STAGE_STATUS.REJECTED ||
      envelope.status === STAGE_STATUS.FAILED ||
      envelope.envelope?.status === "rejected";
    assert.ok(rejected, "forbidden requirements must not pass envelope");
    assert.equal(result.accepted, false);
    assert.equal(result.readyForRelease, false);
  });

  it("rejects Cap04 forbidden revenue/buyerCount fields", async () => {
    const result = await runCapabilityJourneyS162(
      demoInput({ costInput: load("forbidden-cost.json") }),
      { clock: FIXED_CLOCK },
    );
    const cost = result.stages.find((s) => s.id === STAGE_ID.COST_DRY_RUN);
    const rejected =
      cost.status === STAGE_STATUS.REJECTED ||
      cost.status === STAGE_STATUS.FAILED ||
      cost.comparison?.status === "rejected";
    assert.ok(rejected, "forbidden cost input must not pass Cap04");
    assert.equal(result.accepted, false);
  });

  it("invalid input is rejected and still not accepted", async () => {
    const result = await runCapabilityJourneyS162(null, { clock: FIXED_CLOCK });
    assert.equal(result.journeyStatus, JOURNEY_STATUS.REJECTED);
    assert.equal(result.accepted, false);
    assert.equal(result.readyForRelease, false);
    assert.equal(result.heavyPin, HEAVY_PIN);
  });

  it("records Heavy pin and native tips provenance", async () => {
    const result = await runCapabilityJourneyS162(demoInput(), {
      clock: FIXED_CLOCK,
    });
    assert.equal(result.heavyPin, HEAVY_PIN);
    assert.deepEqual(result.nativeTips, {
      "01": "8e51dc5f",
      "04": "295569cf",
      "05": "5cef366b",
      "07": "082c5f08",
      "08": "3f970255",
    });
    assert.ok(result.importPaths.heavy.includes("s138-capability-evidence"));
  });

  it("does not claim Heavy 259/36 as journey acceptance", async () => {
    const result = await runCapabilityJourneyS162(demoInput(), {
      clock: FIXED_CLOCK,
    });
    // Honesty note may mention Heavy's counts as a NON-acceptance warning.
    assert.ok(result.s161HonestyNotes.some((n) => /259/i.test(n) && /NOT journey acceptance/i.test(n)));
    assert.equal(result.accepted, false);
    assert.equal(result.readyForRelease, false);
    // Journey must not surface a fake acceptanceCounters object borrowed from Heavy.
    assert.equal(result.heavyTestCount, undefined);
    assert.equal(result.acceptanceTestCount, undefined);
  });
});
