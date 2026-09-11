import assert from "node:assert/strict";
import test from "node:test";
import { ENGINE_SHA } from "../lib/pins.mjs";
import { engine } from "./helpers.mjs";

test("trial resolves the W4-commerce-13 page-change CLI at the packet pin", () => {
  const resolved = engine();
  assert.equal(resolved.sha, ENGINE_SHA);
  assert.match(resolved.cli, /page-change\.mjs$/);
});
