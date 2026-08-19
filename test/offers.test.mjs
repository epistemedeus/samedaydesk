import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { offers, routes, clockText, toolCountOf, renderSitemap, renderLlmsTxt } from "../scripts/generate-machine-layer.mjs";

const record = offers();
const routeRecord = routes();

test("the record publishes exactly four offers, one of them free", () => {
  assert.equal(record.offers.length, 4);
  assert.equal(record.offers.filter((o) => o.price === 0).length, 1);
  assert.deepEqual(
    record.offers.map((o) => o.price_label),
    ["Free", "$490", "$2,400", "$4,800"],
  );
});

test("every paid offer has a clock key, an exclusion line, and a pay path", () => {
  for (const offer of record.offers.filter((o) => o.price > 0)) {
    assert.ok(record.clocks[offer.clock_key], `${offer.slug} has no clock`);
    assert.ok(offer.exclusion?.length > 20, `${offer.slug} has no exclusion line`);
    assert.match(offer.path, /^\/pay\//);
  }
});

test("the plus clock is the sprint clock plus five days", () => {
  assert.equal(record.clocks.plus_days, record.clocks.sprint_days + 5);
});

test("clock text renders from config, never from a literal", () => {
  const audit = record.offers.find((o) => o.slug === "answer_audit");
  assert.equal(clockText(record, audit), `${record.clocks.audit_days} business days from complete intake`);
});

test("server pricing mirrors the record", async () => {
  const pricing = await import("../server/pricing.js");
  const paid = record.offers.filter((o) => o.price > 0);
  assert.deepEqual(Object.keys(pricing.OFFERS).sort(), paid.map((o) => o.slug).sort());
  for (const offer of paid) {
    assert.equal(pricing.getOffer(offer.slug).amount, offer.price);
    assert.equal(pricing.getOffer(offer.slug).label, offer.name);
  }
  assert.equal(pricing.getOffer("lead_list"), null, "a retired gig slug must not resolve");
});

test("the client mirror matches the record", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "client/src/lib/services.ts"), "utf8");
  for (const offer of record.offers) {
    assert.ok(src.includes(`slug: "${offer.slug}"`));
    assert.ok(src.includes(`price: ${offer.price}`));
  }
});

test("the ten owner questions and eight vendor questions are present verbatim", () => {
  assert.equal(record.faq_owner.length, 10);
  assert.equal(record.faq_vendor.length, 8);
  const home = fs.readFileSync(path.join(process.cwd(), "client/public/home.html"), "utf8");
  for (const q of [...record.faq_owner, ...record.faq_vendor]) {
    const escaped = q.replace(/"/g, "&quot;").replace(/&(?!quot;)/g, "&amp;");
    assert.ok(home.includes(q) || home.includes(escaped), `home.html is missing: ${q}`);
  }
});

test("the frozen panel has the five named slots", () => {
  assert.deepEqual(
    record.panel.prompts.map((p) => p.slot),
    ["identity", "status", "service", "head_to_head", "price"],
  );
});

test("generated machine files on disk match what the record generates", () => {
  const sitemap = fs.readFileSync(path.join(process.cwd(), "client/public/sitemap.xml"), "utf8");
  const llms = fs.readFileSync(path.join(process.cwd(), "client/public/llms.txt"), "utf8");
  assert.equal(sitemap, renderSitemap(routeRecord));
  assert.equal(llms, renderLlmsTxt(record, routeRecord));
});

test("the canonical tool count is derived, not typed", () => {
  assert.equal(toolCountOf(routeRecord), 7);
});
