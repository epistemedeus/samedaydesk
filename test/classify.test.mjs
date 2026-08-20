import test from "node:test";
import assert from "node:assert/strict";
import { classifyRequest, aiReferrer, refererHost } from "../server/lib/classify.js";
import { buildValue, parseValue } from "../server/lib/attr.js";

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

test("declared crawlers are class A", () => {
  for (const ua of ["GPTBot/1.2", "OAI-SearchBot/1.4", "ClaudeBot/1.0", "PerplexityBot/1.0", "Googlebot/2.1"]) {
    assert.equal(classifyRequest({ ua }).cls, "A", ua);
  }
});

test("fetchers acting for a person right now are class B", () => {
  for (const ua of ["ChatGPT-User/1.0", "Claude-User/1.0", "Perplexity-User/1.0", "curl/8.14.1"]) {
    assert.equal(classifyRequest({ ua }).cls, "B", ua);
  }
});

test("a browser arriving from an AI surface is class C", () => {
  const r = classifyRequest({ ua: BROWSER, referer: "https://chatgpt.com/c/123" });
  assert.equal(r.cls, "C");
  assert.equal(r.who, "chatgpt.com");
});

test("a browser with no referrer is class D and is never upgraded", () => {
  assert.equal(classifyRequest({ ua: BROWSER }).cls, "D");
  assert.equal(classifyRequest({ ua: BROWSER, referer: "https://news.ycombinator.com/" }).cls, "D");
});

test("no user agent at all is unresolved, not human", () => {
  assert.equal(classifyRequest({ ua: "" }).cls, "E");
});

test("first touch attribution keeps a source, a path, and a date, and no identifier", () => {
  const v = buildValue({ referer: "https://www.perplexity.ai/search/x", path: "/report", now: new Date("2026-08-19T10:00:00Z") });
  assert.equal(v, "perplexity.ai|/report|2026-08-19");
  assert.deepEqual(parseValue(v), { source: "perplexity.ai", path: "/report", date: "2026-08-19" });
  assert.equal(buildValue({ referer: "", path: "/", now: new Date("2026-08-19T10:00:00Z") }), "direct|/|2026-08-19");
});

test("referrer helpers tolerate junk", () => {
  assert.equal(refererHost("not a url"), null);
  assert.equal(aiReferrer(null), null);
});
