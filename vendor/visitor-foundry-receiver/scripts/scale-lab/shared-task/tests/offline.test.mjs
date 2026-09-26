import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfflineWorkspace,
  briefEventBody,
  proposeArtifactBody,
  MODE_LOCAL,
} from "../src/index.mjs";

test("offline workspace never claims shared mode", async () => {
  const ws = createOfflineWorkspace();
  assert.equal(ws.mode, MODE_LOCAL);
  assert.equal(ws.configured, false);
  const brief = await ws.createTaskBrief({ title: "demo", brief: "x", fundingClass: "demonstration" });
  assert.equal(brief.event.kind, "request");
  const proposal = await ws.proposeArtifact({
    summary: "p",
    artifactUrl: "https://example.invalid/demo/s20-unhosted-receipt.json",
  });
  await ws.acceptArtifact({ proposalEventId: proposal.event.id });
  await ws.correctEvidence({ correctsEventId: proposal.event.id, statement: "fix" });
  const changes = await ws.listChanges();
  assert.ok(changes.events.length >= 4);
  const snap = ws.exportSnapshot();
  assert.equal(snap.shared, false);
  assert.equal(snap.mode, MODE_LOCAL);
  assert.match(snap.note, /not custody/i);
});

test("artifact mapping refuses non-https URLs", () => {
  assert.throws(() => proposeArtifactBody({ artifactUrl: "http://evil.example/" }), /https/i);
  assert.throws(() => proposeArtifactBody({ artifactUrl: "javascript:alert(1)" }), /https/i);
});

test("brief mapping retains fundingClass as data text", () => {
  const body = briefEventBody({ title: "T", brief: "B", fundingClass: "demonstration" });
  assert.equal(body.kind, "request");
  assert.match(body.text, /fundingClass=demonstration/);
  assert.doesNotMatch(body.text, /execute/i);
});
