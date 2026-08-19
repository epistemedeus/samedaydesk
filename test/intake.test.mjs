import test from "node:test";
import assert from "node:assert/strict";
import { validateIntake } from "../server/routes/intake.js";
import { normalizeSiteUrl, validEmail } from "../server/routes/checkout.js";
import { planPrompts, labelAnswer, extractText, fillSlots } from "../server/lib/answer-panel.js";

const complete = {
  city: "Willoughby",
  category: "bookshop",
  service: "rare book search",
  competitor_1: "A",
  competitor_2: "B",
  competitor_3: "C",
  buyer_questions: "one?\ntwo?\nthree?\nfour?\nfive?",
  fact_hours: "Mon to Sat 9 to 5",
};

test("a complete intake passes", () => {
  const r = validateIntake(complete);
  assert.equal(r.ok, true);
  assert.equal(r.questions.length, 5);
});

test("the clock does not start on a partial form", () => {
  for (const key of ["city", "category", "service", "competitor_1", "competitor_2", "competitor_3"]) {
    const r = validateIntake({ ...complete, [key]: "" });
    assert.equal(r.ok, false, `${key} should be required`);
  }
});

test("fewer than five buyer questions is incomplete, more than ten is refused", () => {
  assert.equal(validateIntake({ ...complete, buyer_questions: "one?\ntwo?" }).ok, false);
  assert.equal(validateIntake({ ...complete, buyer_questions: Array.from({ length: 11 }, (_, i) => `q${i}?`).join("\n") }).ok, false);
});

test("a thin canonical-facts block still starts the clock, an empty one does not", () => {
  assert.equal(validateIntake({ ...complete, fact_hours: "", fact_phone: "555 0100" }).ok, true);
  const empty = { ...complete, fact_hours: "" };
  assert.equal(validateIntake(empty).ok, false);
});

test("blank lines in the questions box do not count", () => {
  const r = validateIntake({ ...complete, buyer_questions: "one?\n\n\ntwo?\nthree?\nfour?\nfive?\n\n" });
  assert.equal(r.questions.length, 5);
  assert.equal(r.ok, true);
});

test("the three pre-payment fields are validated before Stripe", () => {
  assert.equal(normalizeSiteUrl("example.com"), "https://example.com/");
  assert.equal(normalizeSiteUrl("https://shop.example.co.uk/path"), "https://shop.example.co.uk/path");
  assert.equal(normalizeSiteUrl("localhost"), null);
  assert.equal(normalizeSiteUrl(""), null);
  assert.equal(validEmail("owner@example.com"), "owner@example.com");
  assert.equal(validEmail("owner@example"), null);
  assert.equal(validEmail(""), null);
});

test("the panel asks the frozen prompts and falls back rather than inventing a slot", () => {
  const full = planPrompts({ BUSINESS: "Viridian Books", SERVICE: "rare book search", COMPETITOR: "Owl Books", CATEGORY: "bookshop", CITY: "Willoughby" });
  assert.equal(full.filter((p) => p.asked).length, 5);
  assert.equal(full.find((p) => p.slot === "head_to_head").text, "Which should I pick, Viridian Books or Owl Books?");
  assert.ok(!full.some((p) => p.usedFallback));

  const sparse = planPrompts({ BUSINESS: "Viridian Books", CATEGORY: "bookshop", CITY: "Willoughby" });
  assert.equal(sparse.find((p) => p.slot === "head_to_head").text, "Who is the best bookshop in Willoughby?");
  assert.equal(sparse.find((p) => p.slot === "price").text, "How much does Viridian Books charge?");

  const bare = planPrompts({ BUSINESS: "Viridian Books" });
  const headToHead = bare.find((p) => p.slot === "head_to_head");
  assert.equal(headToHead.asked, false, "with no rival and no market the question is skipped, not guessed");
  assert.ok(headToHead.skippedFor.length > 0);
});

test("no slot placeholder ever survives into a question", () => {
  for (const p of planPrompts({ BUSINESS: "X", CATEGORY: "y", CITY: "z" })) {
    if (p.asked) assert.ok(!/\{[A-Z_]+\}/.test(p.text), p.text);
  }
  assert.equal(fillSlots("What does {BUSINESS} do?", { BUSINESS: "X" }), "What does X do?");
});

test("panel labels are mechanical and never guess a defect word", () => {
  assert.deepEqual(labelAnswer({ answer: "Viridian Books is a bookshop.", brand: "Viridian Books" }), ["named"]);
  assert.deepEqual(labelAnswer({ answer: "I could not find it.", brand: "Viridian Books" }), ["silent"]);
  const withFact = labelAnswer({ answer: "They are open Saturdays until five.", brand: "Viridian Books", fact: "open Saturdays" });
  assert.ok(withFact.includes("silent"));
  assert.ok(withFact.includes("carries your fact"));
  for (const l of withFact) assert.ok(!["stale", "invented", "mixed"].includes(l), "the free panel must not assign defect words");
});

test("the answer extractor reads the response shape and tolerates an empty one", () => {
  assert.equal(extractText({ output_text: "hello" }), "hello");
  assert.equal(extractText({ output: [{ content: [{ text: "a" }, { text: "b" }] }] }), "a\nb");
  assert.equal(extractText({}), "");
});
