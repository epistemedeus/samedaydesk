import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { CARDS } from "../client/scripts/gen-og.mjs";

const pub = new URL("../client/public/", import.meta.url);
const sha = (file) => createHash("sha256").update(readFileSync(new URL(file, pub))).digest("hex");
// The old résumé-desk card in lime, which made links to this site look like another product.
const RETIRED = new Set(["c21d3b9ec32e048c373777cc68b2089795db9e936464b61d133199147a8175cb"]);

test("every important page has its own share card, and none is the retired one", () => {
  const seen = new Set();
  for (const card of CARDS) {
    assert.ok(existsSync(new URL(card.file, pub)), card.file);
    const digest = sha(card.file);
    assert.ok(!RETIRED.has(digest), `${card.file} is the retired card`);
    assert.ok(!seen.has(digest), `${card.file} repeats another page's card`);
    seen.add(digest);
  }
});

test("the icon is the drafting reticle", () => {
  const svg = readFileSync(new URL("favicon.svg", pub), "utf8");
  assert.match(svg, /drafting reticle/);
  assert.match(svg, /<circle/);
});
