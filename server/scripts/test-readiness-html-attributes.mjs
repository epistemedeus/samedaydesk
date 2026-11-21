import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHtml } from "../routes/tools.js";

test("valid unquoted attributes retain the same readiness facts as quoted HTML", () => {
  const bare = analyzeHtml('<!doctype html><html lang=en><head><title>Example Domain</title><meta name=description content="A public example page."><meta property=og:title content=Example><link rel=canonical href=https://example.com/></head><h1>Example Domain</h1>');
  const quoted = analyzeHtml('<!doctype html><html lang="en"><head><title>Example Domain</title><meta name="description" content="A public example page."><meta property="og:title" content="Example"><link rel="canonical" href="https://example.com/"></head><h1>Example Domain</h1>');
  assert.equal(bare.lang, "en");
  assert.equal(bare.description, "A public example page.");
  assert.equal(bare.canonical, "https://example.com/");
  assert.equal(bare.og, 1);
  assert.deepEqual(bare, quoted);
});

test("attribute boundaries exclude data attributes and retain mixed quoting and whitespace", () => {
  const unrelated = analyzeHtml('<html data-lang=de><meta data-name=description content=wrong><link data-rel=canonical href=https://wrong.example/>');
  assert.equal(unrelated.lang, null);
  assert.equal(unrelated.description, null);
  assert.equal(unrelated.canonical, null);
  assert.equal(analyzeHtml("<HTML\nLANG = 'en-US'>").lang, "en-US");
});
