import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PULSE_ANONYMOUS_SPOOFABLE_STATES,
  REPAIR_CONTACT_LIFECYCLE,
  REPAIR_CONTACT_LIFECYCLE_ENUM_EXAMPLES,
  REPAIR_CONTACT_LIFECYCLE_FIXTURE,
  assertKnownFindingLifecycle,
  describeRepairContactLifecycle,
  findRepairContactLifecycle,
  isAnonymousSpoofablePulseState,
  isRepairContactLifecycle,
  lookupRepairContactLifecycle,
} from "../../client/src/data/repairContactLifecycle.ts";
import {
  findSellerRepairBrief,
  furthestRepairContactLifecycle,
  sellerRepairBriefs,
  type RepairContactLifecycle,
} from "../../client/src/data/sellerRepairBriefs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

function readRepo(rel: string) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const EXPECTED_STATES = [
  "published",
  "attempted_dispatch",
  "bounce",
  "anonymous_view",
  "scope_click",
  "reply",
  "repair_merged",
  "paid",
] as const satisfies readonly RepairContactLifecycle[];

test("enum distinguishes the eight repair-contact lifecycle states", () => {
  assert.deepEqual([...REPAIR_CONTACT_LIFECYCLE], [...EXPECTED_STATES]);
  assert.equal(new Set(REPAIR_CONTACT_LIFECYCLE).size, 8);
  assert.equal(REPAIR_CONTACT_LIFECYCLE_ENUM_EXAMPLES.length, 8);
  assert.equal(isRepairContactLifecycle("not-a-state"), false);
  assert.equal(isRepairContactLifecycle("Published"), false);
  assert.equal(furthestRepairContactLifecycle([]), null);

  const authorities = new Set<string>();
  for (const state of REPAIR_CONTACT_LIFECYCLE) {
    assert.equal(isRepairContactLifecycle(state), true);
    const row = describeRepairContactLifecycle(state);
    assert.equal(row.state, state);
    assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE[state].state, state);
    assert.equal(row.uniqueVisitor, false);
    assert.equal(row.demand, false);
    authorities.add(row.authority);
  }

  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.published.authority, "public_brief");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.attempted_dispatch.authority, "outbound_attempt");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.bounce.authority, "transport_bounce");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.anonymous_view.authority, "pulse_anonymous_spoofable");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.scope_click.authority, "pulse_anonymous_spoofable");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.reply.authority, "seller_attributed_reply");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.repair_merged.authority, "upstream_merge");
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.paid.authority, "payment");
  assert.equal(authorities.size, 7);
  assert.notEqual(
    REPAIR_CONTACT_LIFECYCLE_FIXTURE.anonymous_view.authority,
    REPAIR_CONTACT_LIFECYCLE_FIXTURE.reply.authority,
  );
  assert.notEqual(
    REPAIR_CONTACT_LIFECYCLE_FIXTURE.repair_merged.authority,
    REPAIR_CONTACT_LIFECYCLE_FIXTURE.paid.authority,
  );
});

test("seeded failure: unknown finding ID remains null", () => {
  assert.equal(findRepairContactLifecycle("not-a-real-finding"), null);
  assert.equal(findRepairContactLifecycle("not-a-real-finding-id"), null);
  assert.equal(findRepairContactLifecycle(null), null);
  assert.equal(findRepairContactLifecycle(""), null);
  assert.equal(lookupRepairContactLifecycle("bad/value?client_reference_id=spoofed"), null);
  assert.equal(findRepairContactLifecycle("gentech-defi-slash-20260912"), null);
  assert.equal(findSellerRepairBrief("not-a-real-finding"), null);
  assert.throws(
    () => assertKnownFindingLifecycle("not-a-real-finding"),
    /unknown_finding_id:not-a-real-finding/,
  );
});

test("lookup is keyed only by existing public finding IDs", () => {
  const ids = sellerRepairBriefs.map((brief) => brief.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 7);

  for (const brief of sellerRepairBriefs) {
    const record = findRepairContactLifecycle(brief.id);
    assert.ok(record);
    assert.equal(record.findingId, brief.id);
    assert.deepEqual([...record.observed], [...brief.contactLifecycle]);
    assert.equal(record.state, furthestRepairContactLifecycle(brief.contactLifecycle));
    assert.equal(brief.contactLifecycle.includes("published"), true);
    for (const state of brief.contactLifecycle) {
      assert.equal(isRepairContactLifecycle(state), true);
    }
  }

  assert.equal(findRepairContactLifecycle("hypernatt-liq-radar-20260830")?.state, "published");
  const driftflight = findRepairContactLifecycle("driftflight-image-generation-20260830");
  assert.deepEqual(
    [...(driftflight?.observed ?? [])],
    ["published", "attempted_dispatch", "bounce"],
  );
  assert.equal(driftflight?.state, "bounce");
});

test("Pulse view and click states stay anonymous and spoofable", () => {
  assert.deepEqual([...PULSE_ANONYMOUS_SPOOFABLE_STATES], ["anonymous_view", "scope_click"]);
  for (const state of PULSE_ANONYMOUS_SPOOFABLE_STATES) {
    assert.equal(isAnonymousSpoofablePulseState(state), true);
    const row = describeRepairContactLifecycle(state);
    assert.equal(row.spoofable, true);
    assert.equal(row.uniqueVisitor, false);
    assert.equal(row.demand, false);
    assert.equal(row.authority, "pulse_anonymous_spoofable");
  }

  for (const state of REPAIR_CONTACT_LIFECYCLE) {
    if (state === "anonymous_view" || state === "scope_click") continue;
    assert.equal(isAnonymousSpoofablePulseState(state), false);
    assert.equal(describeRepairContactLifecycle(state).spoofable, false);
  }

  const pulseRoute = readRepo("server/routes/pulse.js");
  const pulse = readRepo("server/lib/pulse.js");
  assert.match(pulseRoute, /anonymous diagnostic signals/);
  assert.match(pulseRoute, /no identity or demand authority/);
  assert.doesNotMatch(pulse, /uniqueVisitor|unique.visitor|unique_visitor/i);
  assert.doesNotMatch(pulseRoute, /uniqueVisitor|unique.visitor|unique_visitor/i);

  const fixtureSource = readRepo("client/src/data/repairContactLifecycle.ts");
  assert.doesNotMatch(fixtureSource, /uniqueVisitor:\s*true/);
});

test("observed fixture does not invent paid, merged, reply, or unique visitors", () => {
  for (const brief of sellerRepairBriefs) {
    assert.equal(brief.contactLifecycle.includes("paid"), false);
    assert.equal(brief.contactLifecycle.includes("repair_merged"), false);
    assert.equal(brief.contactLifecycle.includes("reply"), false);
    assert.equal(brief.contactLifecycle.includes("scope_click"), false);
    assert.equal(brief.contactLifecycle.includes("anonymous_view"), false);
  }
  assert.equal(findRepairContactLifecycle("agenttoll-market-radar-20260901")?.state, "published");
  assert.equal(findRepairContactLifecycle("argonaut-ecb-fx-reference-20260902")?.state, "published");
});

test("unknown lifecycle tokens fail closed instead of being skipped", () => {
  assert.equal(furthestRepairContactLifecycle(["published", "not-a-state"]), null);
  assert.equal(furthestRepairContactLifecycle(["paid", "spoofed"]), null);
  assert.equal(furthestRepairContactLifecycle([null, "published"]), null);
});

test("lookup results and fixture rows cannot invent paid or unique visitors", () => {
  const record = findRepairContactLifecycle("hypernatt-liq-radar-20260830");
  assert.ok(record);
  assert.throws(() => {
    (record.observed as string[]).push("paid");
  }, TypeError);
  const brief = findSellerRepairBrief("hypernatt-liq-radar-20260830");
  assert.ok(brief);
  assert.throws(() => {
    (brief.contactLifecycle as string[]).push("paid");
  }, TypeError);
  assert.throws(() => {
    (brief as { contactLifecycle: RepairContactLifecycle[] }).contactLifecycle = ["paid"];
  }, TypeError);
  assert.equal(findRepairContactLifecycle("hypernatt-liq-radar-20260830")?.state, "published");
  assert.equal(
    findRepairContactLifecycle("hypernatt-liq-radar-20260830")?.observed.includes("paid"),
    false,
  );

  const row = describeRepairContactLifecycle("anonymous_view");
  assert.throws(() => {
    (row as { uniqueVisitor: boolean }).uniqueVisitor = true;
  }, TypeError);
  assert.throws(() => {
    (row as { demand: boolean }).demand = true;
  }, TypeError);
  assert.throws(() => {
    (REPAIR_CONTACT_LIFECYCLE_FIXTURE.paid as { authority: string }).authority = "public_brief";
  }, TypeError);
  assert.equal(describeRepairContactLifecycle("anonymous_view").uniqueVisitor, false);
  assert.equal(describeRepairContactLifecycle("anonymous_view").demand, false);
  assert.equal(REPAIR_CONTACT_LIFECYCLE_FIXTURE.paid.authority, "payment");
});
