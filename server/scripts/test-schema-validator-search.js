import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../client/public/tools/schema-validator.html", import.meta.url);

test("JSON-LD validator page presents the bounded search experiment", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(
    html,
    /<title>Free JSON-LD Validator &amp; Schema Checker \| SameDayDesk<\/title>/,
  );
  assert.match(
    html,
    /<meta name="description" content="Paste JSON-LD to check JSON syntax, @context, @type, and recommended fields for common Schema\.org types\. Runs in your browser\. Free, no signup\." \/>/,
  );
  assert.match(html, /<h1>Free JSON-LD Validator &amp; Schema Checker<\/h1>/);
  assert.match(html, /<button class="act" id="run" type="button">Check JSON-LD<\/button>/);
  assert.match(html, /The check runs in your browser\./);
});

test("the experiment preserves the route, offer, and client-only behavior", async () => {
  const html = await readFile(pageUrl, "utf8");

  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/samedaydesk\.com\/tools\/schema-validator\.html" \/>/,
  );
  const historical = execFileSync("git", ["show", "46d8ff535e56dd461828fe2d8b38d1f8c7f5e73b:client/public/tools/schema-validator.html"], { encoding: "utf8" });
  assert.match(historical, /<strong>Fix Pack \(\$39\)<\/strong>/);
  assert.match(html, /<strong>Fix Pack \(39 USD\)<\/strong>/);
  assert.match(
    historical,
    /href="https:\/\/buy\.stripe\.com\/28E5kE9465np2OPh2WeZ20e">Get the Fix Pack · \$39<\/a>/,
  );
  assert.match(
    html,
    /href="https:\/\/buy\.stripe\.com\/28E5kE9465np2OPh2WeZ20e">Get the Fix Pack · 39 USD<\/a>/,
  );
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
});
