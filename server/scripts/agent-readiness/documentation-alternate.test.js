import assert from "node:assert/strict";
import test from "node:test";
import { declaredTextAlternate } from "../../lib/agent-readiness/documentation-alternate.js";

const context = new URL("https://docs.example.org/reports/index.html");
const alternate = (target = "/result.md") => `<${target}>; rel=alternate; type="text/markdown"`;

test("normalizes only the same-origin path and maps the explicit plain-text hint", () => {
  assert.deepEqual(
    declaredTextAlternate('<https://DOCS.example.org:443/reports/../result.txt>; rel="ALTERNATE"; type="Text/Plain"; title="untrusted"', context),
    { kind: "read-declared-alternate", path: "/result.txt", mediaTypeHint: "text/plain", verified: false },
  );
});

for (const [name, field] of [
  ["missing", undefined],
  ["oversized", alternate() + '; title="' + "a".repeat(4096) + '"'],
  ["oversized target", alternate("/" + "a".repeat(1024))],
  ["malformed quotes", alternate() + '; title="unterminated'],
  ["malformed link", alternate() + ", missing-angle-brackets"],
  ["invalid parameter", alternate() + '; type=text/markdown'],
  ["unquoted media type", "</result.md>; rel=alternate; type=text/markdown"],
  ["control data", alternate() + "\r\n X-Injected: value"],
  ["multiple candidates", alternate() + ", " + alternate("/other.md")],
  ["duplicate candidate", alternate() + ", " + alternate("/dir/../result.md")],
  ["duplicate relation", alternate() + "; REL=preload"],
  ["duplicate type", alternate() + '; TYPE="text/plain"'],
  ["preload", '</result.md>; rel=preload; type="text/markdown"'],
  ["combined preload", '</result.md>; rel="alternate preload"; type="text/markdown"'],
  ["anchor override", alternate() + '; anchor="/"'],
  ["unsupported media type", '</result.md>; rel=alternate; type="text/html"'],
  ["missing media type", "</result.md>; rel=alternate"],
  ["off-origin", alternate("https://outside.example/result.md")],
  ["other port", alternate("https://docs.example.org:444/result.md")],
  ["downgrade", alternate("http://docs.example.org/result.md")],
  ["unsafe scheme", alternate("javascript:alert(1)")],
  ["ambiguous slash authority", alternate("https:///docs.example.org/result.md")],
  ["scheme repair", alternate("https:result.md")],
  ["userinfo", alternate("https://user:password@docs.example.org/result.md")],
  ["empty userinfo", alternate("https://@docs.example.org/result.md")],
  ["query", alternate("/result.md?key=secret")],
  ["empty query", alternate("/result.md?")],
  ["fragment", alternate("/result.md#part")],
  ["empty fragment", alternate("/result.md#")],
  ["network-path-shaped projection", alternate("https://docs.example.org//outside.example/result.md")],
  ["encoded separator", alternate("/%2Foutside.example/result.md")],
  ["backslash", alternate("/\\outside.example/result.md")],
  ["malformed URI escape", alternate("/bad%xx.md")],
  ["same resource", alternate("./index.html")],
]) {
  test(`refuses a ${name} declaration`, () => {
    assert.equal(declaredTextAlternate(field, context), null);
  });
}

test("a short relative reference cannot inherit an oversized context path", () => {
  const longContext = new URL("https://docs.example.org/" + "a".repeat(1024) + "/index.html");
  assert.equal(declaredTextAlternate(alternate("result.md"), longContext), null);
});
