import assert from "node:assert/strict";
import test from "node:test";
import {
  boardEventToCorrespondenceBody,
  ERROR_CODES,
  EVENT_KINDS,
  projectBodyFromJob,
  runWorkBoardJourney,
} from "../src/index.mjs";

test("board event mapping strips digest and keeps correspondence fields", () => {
  const request = boardEventToCorrespondenceBody({
    kind: EVENT_KINDS.request,
    text: "Created job job_n12: DEMONSTRATION",
  });
  assert.deepEqual(request, {
    kind: "request",
    text: "Created job job_n12: DEMONSTRATION",
  });

  const artifact = boardEventToCorrespondenceBody({
    kind: EVENT_KINDS.artifact,
    text: "Completion artifact from agent_n12",
    artifact: {
      url: "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json",
      label: "N12 demonstration completion artifact",
      digest: "sha256:n12-demo",
    },
  });
  assert.equal(artifact.kind, "artifact");
  assert.equal(artifact.artifact.url, "https://neomorphic.io/api/receipts/lab-release-2026-09-01.json");
  assert.equal(artifact.artifact.label, "N12 demonstration completion artifact");
  assert.equal("digest" in artifact.artifact, false);

  const correction = boardEventToCorrespondenceBody({
    kind: EVENT_KINDS.correction,
    text: "Prior completion overstated certainty.",
  });
  assert.equal(correction.kind, "correction");
  assert.match(correction.text, /overstated/);

  assert.throws(
    () => boardEventToCorrespondenceBody({ kind: EVENT_KINDS.artifact, text: "missing artifact" }),
    (error) => error.code === ERROR_CODES.missing_artifact,
  );
  assert.throws(
    () => boardEventToCorrespondenceBody({ kind: EVENT_KINDS.request }),
    (error) => error.code === ERROR_CODES.invalid_input,
  );
});

test("project body from a job clips title/summary and labels funding", () => {
  const body = projectBodyFromJob({
    id: "job_n12_create_observe",
    title: "DEMONSTRATION: Create, update, and observe a work-board row",
    brief: "Demonstration only (unfunded).",
    fundingClass: "demonstration",
  });
  assert.ok(body.title.length <= 120);
  assert.match(body.title, /DEMONSTRATION/);
  assert.match(body.summary, /fundingClass=demonstration/);
  assert.match(body.summary, /job_n12_create_observe/);
});

test("local create-update-observe journey does not claim a hosted API", async () => {
  const result = await runWorkBoardJourney();
  assert.equal(result.boardMode, "local-demo");
  assert.equal(result.correspondenceBound, false);
  assert.equal(result.hostedApi, false);
  assert.equal(result.funded, false);
  assert.equal(result.jobId, "job_n12_create_observe");
  assert.equal(result.jobStatus, "corrected");
  assert.deepEqual(result.localEventKinds, ["request", "request", "artifact", "correction"]);
  assert.equal(result.observedCount, 4);
  assert.equal(result.projectId, null);
  assert.equal(result.serviceEventIds, null);
  assert.match(result.note, /not a hosted API/i);
});
