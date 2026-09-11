import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  F18_LIVE_ROUTE_COUNT,
  F18_OLDER_ROUTE_COUNT,
  PARENT_H4R_SESSION_ID,
  PRIOR_H4_SESSION_ID,
  loadCorpusNoteFixture,
  noteF16Meter,
  noteF18Routes,
  noteMH4Api,
  readLocalRouteCount,
  readVerifiedFeed,
} from "../src/corpus-notes.ts";
import { SDS_VERIFIED_FEED } from "../src/paths.ts";
import { sha256Hex } from "../src/load-fixture.ts";

const packRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(packRoot, "fixtures/corpus");
const noteIds = ["F18-routes", "M-H4-api", "M-F16-meter"] as const;

function fixturePath(id: string): string {
  return join(corpusDir, `${id}.json`);
}

test("local route count matches committed verified.json routes.length", () => {
  const raw = JSON.parse(readFileSync(SDS_VERIFIED_FEED, "utf8")) as {
    routes: unknown[];
  };
  assert.equal(Array.isArray(raw.routes), true);
  assert.equal(raw.routes.length, 20);
  assert.equal(readLocalRouteCount(), raw.routes.length);
  assert.equal(readLocalRouteCount(), 20);
});

test("corpus note fixtures exist with disposition noted and not-a-sale contract", () => {
  for (const id of noteIds) {
    const path = fixturePath(id);
    assert.equal(existsSync(path), true, `missing ${path}`);
    const fixture = loadCorpusNoteFixture(id);
    assert.equal(fixture.id, id);
    assert.equal(fixture.disposition, "noted");
    assert.equal(fixture.saleState, "not_a_sale");
    assert.equal(fixture.provenance, "fixture");
    assert.equal(fixture.authorized, false);
    assert.equal(fixture.kind, "note");
    assert.equal(fixture.evaluator, "corpus-notes");
  }
});

test("F18-routes observation records live 23, older 22, and local 20", () => {
  const observation = noteF18Routes();
  const fixture = loadCorpusNoteFixture("F18-routes");
  assert.equal(observation.disposition, "noted");
  assert.equal(observation.evaluator, "corpus-notes");
  assert.equal(observation.facts.localRouteCount, readLocalRouteCount());
  assert.equal(observation.facts.f18LiveRouteCount, F18_LIVE_ROUTE_COUNT);
  assert.equal(observation.facts.olderRouteCount, F18_OLDER_ROUTE_COUNT);
  assert.equal(fixture.facts.localRouteCount, 20);
  assert.equal(fixture.facts.f18LiveRouteCount, 23);
  assert.equal(fixture.facts.olderRouteCount, 22);
  assert.deepEqual(observation, fixture);
  const feed = readVerifiedFeed();
  assert.equal(feed.routes.length, 20);
  assert.deepEqual(
    observation.facts.localRoutes,
    feed.routes.map((row) => `${row.method} ${row.route}`),
  );
});

test("M-H4-api notes parent RECEIPT H4R section plus final JSON stdout", () => {
  const observation = noteMH4Api();
  const fixture = loadCorpusNoteFixture("M-H4-api");
  assert.equal(observation.disposition, "noted");
  assert.equal(observation.facts.priorH4SessionId, PRIOR_H4_SESSION_ID);
  assert.equal(observation.facts.parentSessionId, PARENT_H4R_SESSION_ID);
  assert.equal(observation.facts.childWritesParentReceipt, false);
  assert.match(observation.notes, /RECEIPT\.md H4R section/);
  assert.match(observation.notes, /final JSON stdout/);
  assert.equal(observation.notes.includes(PRIOR_H4_SESSION_ID), true);
  assert.equal(observation.notes.includes(PARENT_H4R_SESSION_ID), true);
  assert.deepEqual(observation, fixture);
});

test("M-F16-meter is noted, briefed, and does not implement a meter", () => {
  const observation = noteF16Meter();
  const fixture = loadCorpusNoteFixture("M-F16-meter");
  assert.equal(observation.disposition, "noted");
  assert.equal(observation.briefPath, "briefs/M-F16-meter.md");
  assert.equal(existsSync(join(packRoot, "briefs/M-F16-meter.md")), true);
  assert.equal(observation.facts.meterImplemented, false);
  assert.equal(observation.facts.pilotAttached, false);
  assert.equal(observation.facts.sdsCanPushPilot, false);
  assert.equal(observation.facts.productionChangeInThisPack, false);
  assert.deepEqual(observation, fixture);
});

test("reading notes does not change verified.json", () => {
  const before = sha256Hex(readFileSync(SDS_VERIFIED_FEED));
  const count = readLocalRouteCount();
  noteF18Routes();
  noteMH4Api();
  noteF16Meter();
  const after = sha256Hex(readFileSync(SDS_VERIFIED_FEED));
  assert.equal(after, before);
  assert.equal(count, 20);
  const notesSource = readFileSync(join(packRoot, "src/corpus-notes.ts"), "utf8");
  assert.equal(notesSource.includes("writeFile"), false);
});
