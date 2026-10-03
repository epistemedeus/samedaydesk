import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkBrief } from "../lib/work-brief.mjs";

test("caller update and add instructions survive the issue work brief", () => {
  const body = "The caller needs cursor pagination in the SDK.\n\nUpdate src/pagination.ts to parse next_cursor from the response.\nAdd a regression for the final page with no next_cursor.";
  const brief = buildWorkBrief({ owner: "caller", repo: "sdk", number: 42, title: "Update pagination contract", body });
  assert.deepEqual(brief.actions.map(action => action.text), body.split("\n").slice(-2));
  assert.equal(brief.sourceBody, body);
  assert.equal(brief.claims.ownerQaOnly, true);
});
