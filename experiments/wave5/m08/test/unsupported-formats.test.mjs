import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { detectFormat } from "../lib/detect-format.mjs";
import { fixture, parseStdout, runConsumer, tmpOut } from "./helpers.mjs";

function refuse(beforeRel, expectedFormat) {
  const result = runConsumer([
    "--before",
    fixture("unsupported", beforeRel),
    "--after",
    fixture("supported", "routes-before.json"),
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2, `stderr=${result.stderr} stdout=${result.stdout}`);
  assert.equal(body.ok, false);
  assert.equal(body.refused, true);
  assert.equal(body.code, "unsupported_format");
  assert.equal(body.analysis, "refused");
  assert.equal(body.detail.format, expectedFormat);
  return body;
}

test("HTML is an explicit unsupported format, not a successful catalog", () => {
  refuse("page.html", "html");
});

test("YAML is an explicit unsupported format", () => {
  refuse("routes.yaml", "yaml");
});

test("CSV is an explicit unsupported format", () => {
  refuse("routes.csv", "csv");
});

test("Express source is an explicit unsupported format", () => {
  refuse("express-app.mjs", "javascript");
});

test("Next.js page source is an explicit unsupported format", () => {
  refuse("next-page.tsx", "typescript");
});

test("FastAPI source is an explicit unsupported format", () => {
  refuse("fastapi_app.py", "python");
});

test("OpenAPI documents are an explicit unsupported format", () => {
  refuse("openapi.json", "openapi");
});

test("Next.js-shaped JSON is refused by this consumer even though Co12 would accept it", () => {
  const body = refuse("next-routes.json", "nextjs");
  assert.match(body.error, /nextjs/);
});

test("Express-style :param JSON paths are refused", () => {
  refuse("express-params.json", "express-path-params");
});

test("empty JSON object is unsupported, not a silent pass", () => {
  refuse("empty.json", "unknown-json");
});

test("public HTTPS catalogs are refused before fetch", () => {
  const result = runConsumer([
    "--before",
    "https://samedaydesk.com/for-agents/useful-jobs/catalog.json",
    "--after",
    fixture("supported", "routes-before.json"),
    "--out-dir",
    tmpOut(),
  ]);
  const body = parseStdout(result);
  assert.equal(result.status, 2);
  assert.equal(body.code, "unsupported_format");
  assert.equal(body.detail.format, "https-url");
});

test("detectFormat classifies claimed envelopes without spawning the engine", () => {
  const routes = detectFormat({
    text: readFileSync(fixture("supported", "routes-before.json"), "utf8"),
    locator: fixture("supported", "routes-before.json"),
  });
  assert.equal(routes.format, "routes-wrapper");
  assert.equal(routes.supported, true);

  const next = detectFormat({
    text: readFileSync(fixture("unsupported", "next-routes.json"), "utf8"),
    locator: fixture("unsupported", "next-routes.json"),
  });
  assert.equal(next.format, "nextjs");
  assert.equal(next.supported, false);
});
