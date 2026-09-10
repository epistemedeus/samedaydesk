import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CAPTURE_OUTCOME,
  ERROR_CODES,
  EVENT_KINDS,
  EVENTS_SCHEMA,
  FORBIDDEN_INTENT_FIELDS,
  SOURCE_TAGS,
  TAGGED_SCHEMA,
  assertActivationNotIntent,
  assertCaptureDistinct,
  emitResultEvents,
  tagEntries,
  TAGGED_STATUS,
  validateEntries,
  validateResultEvents,
  validateSignal,
  validateTaggedLinks,
} from "../src/index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(readFileSync(join(root, "fixtures", name), "utf8"));
const clock = () => Date.parse("2026-09-10T19:00:00.000Z");

test("positive: tagged links with explicit source tags + opaque campaign/ref", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  assert.equal(tagged.schema, TAGGED_SCHEMA);
  assert.equal(tagged.status, TAGGED_STATUS.READY);
  assert.equal(tagged.generatedAt, "2026-09-10T19:00:00.000Z");
  assert.equal(tagged.links.length, 4);

  const grexal = tagged.links.find((l) => l.id === "grexal-s124-entry");
  const agensi = tagged.links.find((l) => l.id === "agensi-s131-entry");
  const catalog = tagged.links.find((l) => l.id === "catalog-portable-entry");
  const manual = tagged.links.find((l) => l.id === "manual-handoff-entry");
  assert.equal(grexal.sourceTag, SOURCE_TAGS.GREXAL);
  assert.equal(agensi.sourceTag, SOURCE_TAGS.AGENSI);
  assert.equal(catalog.sourceTag, SOURCE_TAGS.CATALOG);
  assert.equal(manual.sourceTag, SOURCE_TAGS.MANUAL);
  assert.match(grexal.taggedHref, /source=grexal/);
  assert.match(grexal.taggedHref, /campaign=r2-dist-04-synthetic/);
  assert.match(catalog.taggedHref, /source=catalog/);
  assert.equal(grexal.impliesBuyerIntent, false);
  assert.equal(grexal.equatesActivationWithIntent, false);
  assert.equal(tagged.mutationBoundary.executesProviderMutations, false);
  validateTaggedLinks(tagged);
});

test("positive: recorded events with linkPresented/linkActivated; no intent claims", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  const events = emitResultEvents(tagged, load("signal.recorded.json"), { clock });
  assert.equal(events.schema, EVENTS_SCHEMA);
  assert.equal(events.outcome, CAPTURE_OUTCOME.RECORDED);
  assert.equal(events.activationCount, 2);
  assert.ok(events.events.some((e) => e.kind === EVENT_KINDS.LINK_PRESENTED));
  assert.ok(events.events.some((e) => e.kind === EVENT_KINDS.LINK_ACTIVATED));
  assert.equal(events.claims.activationEqualsBuyerIntent, false);
  assert.equal(assertActivationNotIntent(events), true);
  validateResultEvents(events);
});

test("negative: malformed URL + forbidden buyerIntent rejected", () => {
  assert.throws(
    () => validateEntries(load("entries.malformed.json")),
    (err) =>
      err.code === ERROR_CODES.FORBIDDEN_INTENT || err.code === ERROR_CODES.INVALID_INPUT,
  );
  // Prefer intent rejection when buyerIntent present (rejectForbidden runs first)
  assert.throws(
    () => tagEntries(load("entries.malformed.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_INTENT,
  );
});

test("negative: signal with purchaseIntent / buyerIntent rejected", () => {
  assert.throws(
    () => validateSignal(load("signal.forbidden-intent.json")),
    (err) => err.code === ERROR_CODES.FORBIDDEN_INTENT,
  );
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  assert.throws(
    () => emitResultEvents(tagged, load("signal.forbidden-intent.json"), { clock }),
    (err) => err.code === ERROR_CODES.FORBIDDEN_INTENT,
  );
});

test("explicit: click/activation does NOT imply buyer intent", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  const events = emitResultEvents(tagged, load("signal.recorded.json"), { clock });
  const activated = events.events.filter((e) => e.kind === EVENT_KINDS.LINK_ACTIVATED);
  assert.ok(activated.length >= 1);
  for (const ev of activated) {
    assert.equal(ev.impliesBuyerIntent, false);
    assert.equal(ev.equatesActivationWithIntent, false);
    assert.equal(Object.prototype.hasOwnProperty.call(ev, "buyerIntent"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(ev, "purchaseIntent"), false);
  }
  assert.equal(events.claims.activationEqualsBuyerIntent, false);
  assert.equal(assertActivationNotIntent(events), true);

  // validateResultEvents rejects if someone stamps intent later
  const poisoned = structuredClone(events);
  poisoned.events[0].impliesBuyerIntent = true;
  // find an activated one to poison if first is presentation
  const act = poisoned.events.find((e) => e.kind === EVENT_KINDS.LINK_ACTIVATED);
  if (act) act.impliesBuyerIntent = true;
  assert.throws(
    () => validateResultEvents(poisoned),
    (err) => err.code === ERROR_CODES.FORBIDDEN_INTENT,
  );

  const claimPoison = structuredClone(events);
  claimPoison.claims.activationEqualsBuyerIntent = true;
  assert.throws(
    () => validateResultEvents(claimPoison),
    (err) => err.code === ERROR_CODES.FORBIDDEN_INTENT,
  );

  for (const field of FORBIDDEN_INTENT_FIELDS) {
    assert.ok(FORBIDDEN_INTENT_FIELDS.includes(field));
  }
});

test("partial: missing source tag → partial status + missingInputs", () => {
  const tagged = tagEntries(load("entries.partial.json"), { clock });
  assert.equal(tagged.status, TAGGED_STATUS.PARTIAL);
  assert.ok(tagged.missingInputs.some((m) => m.includes("source")));
  const gap = tagged.links.find((l) => l.id === "missing-source");
  assert.equal(gap.sourceTag, null);
  assert.equal(gap.missingSourceTag, true);
  const ok = tagged.links.find((l) => l.id === "grexal-ok");
  assert.equal(ok.sourceTag, SOURCE_TAGS.GREXAL);
});

test("unavailable: capture unavailable omits activationCount", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  const events = emitResultEvents(tagged, load("signal.unavailable.json"), { clock });
  assert.equal(events.outcome, CAPTURE_OUTCOME.UNAVAILABLE);
  assert.equal(events.code, ERROR_CODES.UNAVAILABLE);
  assert.equal(
    Object.prototype.hasOwnProperty.call(events, "activationCount"),
    false,
    "unavailable must not emit activationCount",
  );
  validateResultEvents(events);
});

test("no_users: capture ok with zero activations is distinct", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  const events = emitResultEvents(tagged, load("signal.no-users.json"), { clock });
  assert.equal(events.outcome, CAPTURE_OUTCOME.NO_USERS);
  assert.equal(events.code, ERROR_CODES.NO_USERS);
  assert.equal(events.activationCount, 0);
  validateResultEvents(events);
});

test("explicit: unavailable ≠ no_users (outcomes, codes, activationCount field)", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  const unavailable = emitResultEvents(tagged, load("signal.unavailable.json"), { clock });
  const noUsers = emitResultEvents(tagged, load("signal.no-users.json"), { clock });
  assert.equal(assertCaptureDistinct(unavailable, noUsers), true);
  assert.notEqual(unavailable.outcome, noUsers.outcome);
  assert.notEqual(unavailable.code, noUsers.code);
  assert.equal(Object.prototype.hasOwnProperty.call(unavailable, "activationCount"), false);
  assert.equal(noUsers.activationCount, 0);
});

test("validateResultEvents rejects collapsed unavailable+activationCount via labels", () => {
  const tagged = tagEntries(load("entries.positive.json"), { clock });
  const events = emitResultEvents(tagged, load("signal.unavailable.json"), { clock });
  events.labels = { collapsedUnavailableAsNoUsers: true };
  assert.throws(
    () => validateResultEvents(events),
    (err) => err.code === ERROR_CODES.INVALID_INPUT,
  );
});

test("source tags include required set grexal|agensi|catalog|manual", () => {
  for (const s of ["grexal", "agensi", "catalog", "manual"]) {
    assert.ok(Object.values(SOURCE_TAGS).includes(s), `missing source tag ${s}`);
  }
});
