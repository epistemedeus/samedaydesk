import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewJson } from "./helpers.mjs";

describe("m14 limits", () => {
  it("limits --job feed-agenda tells an unbriefed reader the report is not live deadlines", () => {
    const r = previewJson(["limits", "--job", "feed-agenda"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(r.json.id, "feed-agenda");
    assert.ok(r.json.limits.some((l) => /not live deadlines/i.test(l)));
    assert.ok(r.json.limits.some((l) => /sold is always false/i.test(l)));
  });

  it("limits --job vendor-budget-impact keeps purchase authority and partial evidence distinct", () => {
    const r = previewJson(["limits", "--job", "vendor-budget-impact"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(r.json.limits.some((l) => /No purchase authority/i.test(l) || /purchase authority/i.test(l)));
    assert.ok(r.json.limits.some((l) => /partial/i.test(l)));
  });
});
